import {Ionicons} from '@expo/vector-icons';
import {useRouter} from 'expo-router';
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

import {
  enterRecordingMode,
  exitRecordingMode,
  requestMicPermission,
} from '../src/services/audioSession';
import {AppText} from '../src/components/AppText';
import {Card} from '../src/components/Card';
import {ListenBars, ListenBarsState} from '../src/components/ListenBars';
import {ScoreRing} from '../src/components/ScoreRing';
import {ScreenHeader} from '../src/components/ScreenHeader';
import {recordSession} from '../src/lib/sessionStore';
import {initialVadState, vadStep, VadState} from '../src/lib/vad';
import {speakSpanish, stopSpeaking} from '../src/services/tts';
import {transcribe} from '../src/services/whisper';
import {colors} from '../src/theme';
import {
  NextChoice,
  Phase,
  TranscriptEntry,
  useConversation,
} from '../src/store/useConversation';

/**
 * Hands-free conversational flow: after the app finishes speaking it starts
 * listening automatically. Metering-based voice activity detection — once
 * you've spoken and then stay quiet for SILENCE_HOLD_MS, the recording is
 * sent. The mic button is a "send now" override; auto-listen can be toggled
 * off for tap-to-talk.
 *
 * VAD decision logic lives in src/lib/vad.ts as a pure, unit-tested step
 * function (tested against real captured metering traces). The floor ADAPTS
 * upward toward sustained background noise, so a noisy room whose ambient
 * level sits above the initial calibrated floor still gets silence detected
 * instead of running every utterance to the MAX_UTTERANCE_MS hard cap. This
 * effect just feeds samples in and reacts to its 'end' decision.
 */
const NO_SPEECH_TIMEOUT_MS = 8000; // no speech at all -> restart listening
const MAX_UTTERANCE_MS = 25000; // hard cap per utterance
const MIN_UTTERANCE_MS = 500; // shorter than this -> discard (avoids blips)
const LISTEN_START_DELAY_MS = 250; // let the app's own voice fully stop first

export default function Conversation() {
  const router = useRouter();
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder, 120);
  const [micPermission, setMicPermission] = useState<
    'unknown' | 'granted' | 'denied'
  >('unknown');
  const [autoListen, setAutoListen] = useState(true);

  const phase = useConversation((s) => s.phase);
  const preRecordPhase = useConversation((s) => s.preRecordPhase);
  const transcript = useConversation((s) => s.transcript);
  const currentTarget = useConversation((s) => s.currentTarget);
  const error = useConversation((s) => s.error);
  const startSession = useConversation((s) => s.startSession);
  const setRecording = useConversation((s) => s.setRecording);
  const cancelRecording = useConversation((s) => s.cancelRecording);
  const handleEnglishRecording = useConversation((s) => s.handleEnglishRecording);
  const handleRepeatRecording = useConversation((s) => s.handleRepeatRecording);
  const chooseNext = useConversation((s) => s.chooseNext);
  const learnedCount = useConversation((s) => s.learnedCount);
  const [pendingProgress, setPendingProgress] = useState(false);
  const [savingAck, setSavingAck] = useState(false);
  const reset = useConversation((s) => s.reset);

  const listRef = useRef<FlatList<TranscriptEntry>>(null);
  const busyRef = useRef(false); // guards start/stop races
  const listenStartRef = useRef(0);
  const sessionStartRef = useRef(0); // when this conversation screen was entered, for recordSession on the way out
  const vadStateRef = useRef<VadState>(initialVadState); // adaptive VAD state, reset per listen
  const lastMeteringLogRef = useRef(0); // throttles the diagnostic metering log
  const leavingRef = useRef(false); // true once "I'm finished" is tapped, so the mic doesn't re-arm under the "saved" overlay
  const doneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Chips show whenever we're in the choosing phase. (Choosing no longer
  // auto-records, so there's no "recording but was choosing" case to cover.)
  const choosingActive = phase === 'choosing';

  useEffect(() => {
    let cancelled = false;
    sessionStartRef.current = Date.now();
    (async () => {
      const granted = await requestMicPermission();
      if (cancelled) return;
      setMicPermission(granted ? 'granted' : 'denied');
      if (granted) {
        // Explicitly set playback (non-recording) audio mode before the
        // very first thing the app ever speaks — the greeting. Without
        // this, that first line plays under whatever ambient/default audio
        // session iOS + Expo Go left behind after the permission prompt,
        // which is exactly the kind of state that routes to the quiet
        // earpiece or plays back inconsistently.
        await exitRecordingMode();
        if (cancelled) return;
        await startSession();
      }
    })();
    return () => {
      cancelled = true;
      if (doneTimeoutRef.current) clearTimeout(doneTimeoutRef.current);
      reset();
      // Log this session for "My week", rounded to the nearest minute. A
      // session under 30s (permission denied immediately, or an accidental
      // open) rounds to 0 and recordSession no-ops on it, so a stray tap
      // into the screen and back out doesn't inflate the week view.
      const minutes = Math.round((Date.now() - sessionStartRef.current) / 60000);
      recordSession(sessionStartRef.current, minutes).catch(() => {
        // Momentum tracking is a nice-to-have; must not break navigation.
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (transcript.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({animated: true}), 80);
    }
  }, [transcript.length]);

  const startListening = useCallback(async () => {
    if (busyRef.current || leavingRef.current) return;
    busyRef.current = true;
    try {
      await enterRecordingMode();
      await recorder.prepareToRecordAsync();
      recorder.record();
      listenStartRef.current = Date.now();
      vadStateRef.current = initialVadState;
      setRecording();
    } finally {
      busyRef.current = false;
    }
  }, [recorder, setRecording]);

  const finishListening = useCallback(
    async (process: boolean) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        // Route by the phase we were in BEFORE recording started, not the
        // live phase (which is already 'recording' by the time this runs).
        const wasRepeat = preRecordPhase === 'awaiting-repeat' && currentTarget !== null;
        const duration = Date.now() - listenStartRef.current;
        const heardSpeech = vadStateRef.current.speechDetected;
        await recorder.stop();
        await exitRecordingMode();
        const uri = recorder.uri;
        // Only transcribe if we actually heard sustained speech. This keeps
        // silent/near-silent clips out of Whisper, which otherwise
        // hallucinates "thanks for watching" style caption boilerplate.
        const worthProcessing =
          process && uri !== null && heardSpeech && duration >= MIN_UTTERANCE_MS;
        if (worthProcessing) {
          if (wasRepeat) {
            await handleRepeatRecording(uri);
          } else {
            await handleEnglishRecording(uri);
          }
        } else {
          cancelRecording();
        }
      } finally {
        busyRef.current = false;
      }
    },
    [
      recorder,
      preRecordPhase,
      currentTarget,
      handleEnglishRecording,
      handleRepeatRecording,
      cancelRecording,
    ],
  );

  useEffect(() => {
    if (pendingProgress) {
      router.push('/profile');
      setPendingProgress(false);
    }
  }, [pendingProgress, router]);

  // Auto-start listening whenever it's the user's turn (hands-free mode).
  // NOTE: the "choosing" phase deliberately does NOT auto-listen — spoken
  // next-step commands were removed because Whisper kept hallucinating
  // caption phrases like "¡Continúa al siguiente video!" and the command
  // layer mistook a phrase containing "continúa" for a command. Chips are
  // now the only next-step mechanism.
  useEffect(() => {
    if (
      autoListen &&
      micPermission === 'granted' &&
      (phase === 'awaiting-english' || phase === 'awaiting-repeat')
    ) {
      const t = setTimeout(() => startListening(), LISTEN_START_DELAY_MS);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase, autoListen, micPermission, startListening]);

  // Voice activity detection: feed each metering sample to the pure adaptive
  // VAD (src/lib/vad.ts) and react to its end decision.
  useEffect(() => {
    if (phase !== 'recording' || !recorderState.isRecording) return;
    const now = Date.now();
    const elapsed = now - listenStartRef.current;
    const level = recorderState.metering;

    if (typeof level === 'number') {
      const {state, decision} = vadStep(vadStateRef.current, level, elapsed, now);
      vadStateRef.current = state;

      // Diagnostic: throttled so it doesn't flood the log, but enough to see
      // the actual metering range this device/room produces if VAD misbehaves.
      if (now - lastMeteringLogRef.current > 400) {
        lastMeteringLogRef.current = now;
        console.log(
          `[vad] t=${elapsed}ms level=${level.toFixed(1)}dB floor=${state.floor?.toFixed(1) ?? 'calibrating'} speech=${state.speechDetected}`,
        );
      }

      if (decision === 'end') {
        finishListening(true);
        return;
      }
    }

    if (!vadStateRef.current.speechDetected && elapsed >= NO_SPEECH_TIMEOUT_MS) {
      // Heard nothing — recycle the listener so we don't record forever.
      finishListening(false);
    } else if (elapsed >= MAX_UTTERANCE_MS) {
      console.warn('[vad] hit MAX_UTTERANCE_MS hard cap — silence was never detected');
      finishListening(vadStateRef.current.speechDetected);
    }
  }, [phase, recorderState, finishListening]);

  // The mic is not usable during "choosing" — next steps are chips-only now
  // (spoken commands were removed, see the auto-listen effect note).
  const canUseMic = phase === 'awaiting-english' || phase === 'awaiting-repeat';
  const isRecording = phase === 'recording';

  // Live 0..1 mic level for the listening animation, so the bars react to
  // ACTUAL audio (proof it's hearing you), not just a canned loop. Metering
  // is roughly -60 dB (silence) to -10 dB (loud speech); map that window to
  // 0..1 and clamp. recorderState updates every 120ms, re-rendering this.
  const audioLevel =
    isRecording && typeof recorderState.metering === 'number'
      ? Math.max(0, Math.min(1, (recorderState.metering + 60) / 50))
      : 0;

  const onMicPress = async () => {
    if (isRecording) {
      await finishListening(true);
    } else if (canUseMic) {
      await startListening();
    }
  };

  // A chip tap is an explicit choice — stop listening first (discarding the
  // clip) so the mic doesn't also try to process whatever it half-heard.
  const onChipChoice = useCallback(
    async (choice: NextChoice) => {
      if (isRecording) {
        await finishListening(false);
      }
      await chooseNext(choice);
    },
    [isRecording, finishListening, chooseNext],
  );

  const onChipProgress = useCallback(async () => {
    if (isRecording) {
      await finishListening(false);
    }
    setPendingProgress(true);
  }, [isRecording, finishListening]);

  // An explicit "done" tap, same as a chip choice — stop listening first so
  // the mic doesn't keep processing a half-heard clip, and cut off any
  // in-flight TTS so the app doesn't keep talking over the Home screen
  // after the user has already left. Phrases are already persisted as they're
  // learned, so this doesn't SAVE anything — it just acknowledges that the
  // progress is safe before leaving, so the exit doesn't feel like a discard.
  const onDone = useCallback(async () => {
    if (leavingRef.current) return; // ignore a second tap while already leaving
    leavingRef.current = true; // stop the mic from re-arming under the overlay
    if (isRecording) {
      await finishListening(false);
    }
    stopSpeaking();
    setSavingAck(true);
    doneTimeoutRef.current = setTimeout(() => router.back(), 900);
  }, [isRecording, finishListening, router]);

  if (micPermission === 'denied') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionBox}>
          <View style={styles.permissionIconCircle}>
            <Ionicons name="mic-outline" size={30} color={colors.accent} />
          </View>
          <AppText variant="title" style={styles.permissionTitle}>
            We need your voice
          </AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.permissionBody}>
            Pronto is a speaking app, without the microphone there's nothing
            to practice. Enable microphone access for Expo Go in Settings, then
            come back and we'll pick it right up.
          </AppText>
          <Pressable style={styles.permissionButton} onPress={() => router.back()}>
            <AppText variant="button" color={colors.accent}>
              Back to Home
            </AppText>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader
        title="Right now"
        onBack={() => router.back()}
        right={
          <Pressable style={styles.modePill} onPress={() => setAutoListen((v) => !v)} hitSlop={8}>
            <View style={[styles.modeSeg, autoListen && styles.modeSegOn]}>
              <AppText variant="caption" color={autoListen ? colors.textOnAccent : colors.textSecondary} style={styles.modeText}>
                auto
              </AppText>
            </View>
            <View style={[styles.modeSeg, !autoListen && styles.modeSegOn]}>
              <AppText variant="caption" color={!autoListen ? colors.textOnAccent : colors.textSecondary} style={styles.modeText}>
                tap
              </AppText>
            </View>
          </Pressable>
        }
      />

      <FlatList
        ref={listRef}
        data={transcript}
        keyExtractor={(item) => item.id}
        renderItem={({item}) => <TranscriptRow entry={item} />}
        contentContainerStyle={styles.listContent}
      />

      {error ? (
        <View style={styles.errorBanner}>
          <AppText variant="caption" color={colors.danger}>
            {error}
          </AppText>
        </View>
      ) : null}

      {choosingActive && (
        <NextChips onChoose={onChipChoice} onProgress={onChipProgress} />
      )}

      <Pressable
        style={({pressed}) => [styles.doneRow, pressed && styles.pressed]}
        onPress={onDone}
        hitSlop={8}
      >
        <Ionicons name="checkmark-circle-outline" size={14} color={colors.textSecondary} />
        <AppText variant="caption" color={colors.textSecondary} style={styles.doneText}>
          I'm finished learning
        </AppText>
      </Pressable>

      <MicZone
        phase={phase}
        autoListen={autoListen}
        audioLevel={audioLevel}
        disabled={!canUseMic && !isRecording}
        onPress={onMicPress}
      />

      {savingAck && (
        <View style={styles.savedOverlay}>
          <View style={styles.savedCard}>
            <Ionicons name="checkmark-circle" size={30} color={colors.turquoise} />
            <AppText variant="title" style={styles.savedTitle}>
              Progress saved
            </AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              {learnedCount > 0
                ? `${learnedCount} ${learnedCount === 1 ? 'phrase is' : 'phrases are'} in My phrases`
                : 'Everything you learn is kept for you'}
            </AppText>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function TranscriptRow({entry}: {entry: TranscriptEntry}) {
  switch (entry.kind) {
    case 'coach':
      return (
        <View style={styles.coachBlock}>
          <AppText variant="body" color={colors.textSecondary}>
            {entry.text}
          </AppText>
          {entry.spanishTranslation ? (
            <AppText variant="captionItalic" color={colors.turquoise} style={styles.esSub}>
              {entry.spanishTranslation}
            </AppText>
          ) : null}
        </View>
      );
    case 'user-english':
    case 'user-attempt':
      // Translations appear on what the app teaches, never on what the user
      // says (ui-redesign-prompt-v2.md §5): the spanish card that follows an
      // English utterance already delivers the translation, and the why box
      // already covers what was heard for a Spanish attempt, so duplicating
      // either here would kill the reveal.
      return (
        <View style={[styles.bubble, styles.userBubble]}>
          <AppText variant="body">{entry.text}</AppText>
        </View>
      );
    case 'spanish':
      return <SpanishCard entry={entry} />;
    case 'score':
      return <ScoreRow entry={entry} />;
    default:
      return null;
  }
}

function SpanishCard({entry}: {entry: TranscriptEntry}) {
  const [playing, setPlaying] = useState(false);

  // Bound to THIS card's own phrase, not whatever the store's currentTarget
  // happens to be — a past card's Replay/Slow must always play what that
  // card actually shows, even after the conversation has moved on to a new
  // phrase (previously a bug: every card called the same store-level
  // replayTarget, which only ever knew the current phrase).
  const play = useCallback(
    async (slow: boolean) => {
      if (playing) return;
      setPlaying(true);
      try {
        await speakSpanish(entry.text, slow);
      } finally {
        setPlaying(false);
      }
    },
    [playing, entry.text],
  );

  return (
    <View style={[styles.bubble, styles.spanishBubble]}>
      <AppText variant="title" color={colors.spanishText}>
        {entry.text}
      </AppText>
      {entry.englishMeaning ? (
        <AppText variant="caption" color={colors.textSecondary} style={styles.meaningText}>
          {entry.englishMeaning}
        </AppText>
      ) : null}
      <View style={styles.replayRow}>
        <Pressable
          style={({pressed}) => [styles.replayPill, (pressed || playing) && styles.replayPillActive]}
          onPress={() => play(false)}
        >
          <Ionicons name="play" size={12} color={colors.spanishText} />
          <AppText variant="caption" color={colors.spanishText}>
            Replay
          </AppText>
        </Pressable>
        <Pressable
          style={({pressed}) => [styles.replayPill, (pressed || playing) && styles.replayPillActive]}
          onPress={() => play(true)}
        >
          <AppText style={styles.replayEmoji}>🐢</AppText>
          <AppText variant="caption" color={colors.spanishText}>
            Slow
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function ScoreRow({entry}: {entry: TranscriptEntry}) {
  const score = entry.score ?? 0;
  const perfect = score >= 80;

  // Pop in with a spring — big and bouncy for a great score.
  const scale = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: perfect ? 3.5 : 6,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [scale, perfect]);

  const missed = entry.targetWords?.some((w) => !w.hit) ?? false;
  const showWhy = missed && !!entry.heard;

  return (
    <Animated.View style={{transform: [{scale}]}}>
      <Card
        borderColor={perfect ? colors.sunshine : undefined}
        elevated
        style={styles.scoreCard}
      >
        <View style={styles.scoreRow}>
          <ScoreRing score={score} />
          <View style={styles.scoreTextBlock}>
            <AppText variant="title" style={styles.verdictText}>
              {perfect ? '🎉 ' : ''}
              {entry.text}
            </AppText>
            {entry.spanishTranslation ? (
              <AppText variant="captionItalic" color={colors.turquoise}>
                {entry.spanishTranslation}
              </AppText>
            ) : null}
          </View>
        </View>
        {showWhy && (
          <View style={styles.whyBox}>
            <AppText variant="caption" color={colors.textSecondary} style={styles.whyLabel}>
              WHAT I HEARD, WORD BY WORD
            </AppText>
            <View style={styles.wordChips}>
              {entry.targetWords!.map((w, i) => (
                <View key={i} style={[styles.wordChip, w.hit ? styles.wordHit : styles.wordMiss]}>
                  <AppText
                    variant="caption"
                    color={w.hit ? colors.spanishText : colors.danger}
                    style={w.hit ? undefined : styles.wordMissText}
                  >
                    {w.word}
                  </AppText>
                </View>
              ))}
            </View>
            <AppText variant="captionItalic" color={colors.textSecondary} style={styles.whyHeard}>
              I heard: "{entry.heard}"
            </AppText>
          </View>
        )}
      </Card>
    </Animated.View>
  );
}

const NEXT_CHIPS: Array<{label: string; choice: NextChoice}> = [
  {label: '➕ Build on it', choice: {kind: 'extend'}},
  {label: '📍 Add where', choice: {kind: 'extend', element: 'a location, where this is happening'}},
  {label: '🕐 Add when', choice: {kind: 'extend', element: 'a time of day'}},
  {label: '😊 Add a feeling', choice: {kind: 'extend', element: 'how the user feels about it'}},
  {label: '🔄 New topic', choice: {kind: 'new-topic'}},
];

function NextChips({
  onChoose,
  onProgress,
}: {
  onChoose: (choice: NextChoice) => void;
  onProgress: () => void;
}) {
  return (
    <Card elevated style={styles.nextCard}>
      <AppText variant="title" style={styles.nextCardLabel}>
        Where to next?
      </AppText>
      <View style={styles.chipsWrap}>
        {NEXT_CHIPS.map((chip, i) => (
          <Pressable
            key={chip.label}
            style={({pressed}) => [
              styles.chip,
              i === 0 ? styles.chipPrimary : styles.chipLine,
              pressed && styles.chipPressed,
            ]}
            onPress={() => onChoose(chip.choice)}
          >
            <AppText
              variant="caption"
              color={i === 0 ? colors.textOnAccent : colors.textPrimary}
              style={styles.chipText}
            >
              {chip.label}
            </AppText>
          </Pressable>
        ))}
        <Pressable
          style={({pressed}) => [styles.chip, styles.chipLine, pressed && styles.chipPressed]}
          onPress={onProgress}
        >
          <AppText variant="caption" color={colors.textPrimary} style={styles.chipText}>
            📊 Progress
          </AppText>
        </Pressable>
      </View>
    </Card>
  );
}

const MIC_LABELS: Record<Phase, string> = {
  idle: 'Warming up',
  greeting: 'Say hi in a second',
  'awaiting-english': "Tell me what you're doing",
  recording: 'Listening for your Spanish',
  transcribing: 'Got it, writing that down',
  thinking: 'Thinking',
  speaking: 'Speaking',
  'awaiting-repeat': 'Your turn, say it in Spanish',
  scoring: 'Scoring your attempt',
  choosing: 'Pick what is next',
};

function MicZone({
  phase,
  autoListen,
  audioLevel,
  disabled,
  onPress,
}: {
  phase: Phase;
  autoListen: boolean;
  audioLevel: number;
  disabled: boolean;
  onPress: () => void;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  const isRecording = phase === 'recording';
  const isBusy =
    phase === 'transcribing' || phase === 'thinking' || phase === 'scoring';

  useEffect(() => {
    if (isRecording) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {toValue: 1.15, duration: 600, useNativeDriver: true}),
          Animated.timing(pulse, {toValue: 1, duration: 600, useNativeDriver: true}),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulse.setValue(1);
    return undefined;
  }, [isRecording, pulse]);

  const label = isRecording
    ? autoListen
      ? 'Listening, pause when done (or tap to send)'
      : 'Listening, tap to send'
    : MIC_LABELS[phase];

  // ListenBars state, per ui-redesign-prompt-v2.md §4: rippling while
  // recording, gentle breathe while auto-listen is armed and waiting for its
  // turn, frozen low while busy, hidden when tap mode is off and idle.
  const canListenSoon = phase === 'awaiting-english' || phase === 'awaiting-repeat';
  let barsState: ListenBarsState;
  if (isRecording) {
    barsState = 'rippling';
  } else if (isBusy) {
    // A traveling-wave "thinking" animation while Whisper/Claude run, so the
    // multi-second wait reads as the app working, not frozen.
    barsState = 'thinking';
  } else if (autoListen && canListenSoon) {
    barsState = 'breathing';
  } else {
    barsState = 'hidden';
  }

  return (
    <View style={styles.micArea}>
      <ListenBars state={barsState} audioLevel={audioLevel} />
      <AppText variant="caption" color={colors.textSecondary} style={styles.micLabel}>
        {label.toUpperCase()}
      </AppText>
      <Animated.View style={{transform: [{scale: pulse}]}}>
        <Pressable
          onPress={onPress}
          disabled={disabled}
          style={[
            styles.micButton,
            isRecording && styles.micButtonRecording,
            isBusy && styles.micButtonBusy,
            disabled && !isBusy && styles.micButtonDisabled,
          ]}
        >
          <Ionicons name="mic" size={26} color={colors.textOnAccent} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
  },
  modePill: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#EADFCB',
    borderRadius: 999,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  modeSeg: {
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  modeSegOn: {
    backgroundColor: colors.turquoise,
  },
  modeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 16,
    gap: 11,
  },
  coachBlock: {
    marginTop: 8,
    maxWidth: '92%',
  },
  esSub: {
    marginTop: 3,
  },
  bubble: {
    borderRadius: 16,
    borderBottomRightRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    maxWidth: '85%',
  },
  userBubble: {
    backgroundColor: colors.englishBubble,
    alignSelf: 'flex-end',
  },
  spanishBubble: {
    backgroundColor: colors.spanishBubble,
    borderWidth: 1.5,
    borderColor: colors.spanishBorder,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 18,
    alignSelf: 'flex-start',
    maxWidth: '94%',
    paddingVertical: 14,
    paddingHorizontal: 15,
  },
  meaningText: {
    marginTop: 4,
  },
  replayRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 11,
  },
  replayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.spanishBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  replayPillActive: {
    opacity: 0.75,
  },
  replayEmoji: {
    fontSize: 12,
  },
  scoreCard: {
    marginVertical: 4,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scoreTextBlock: {
    flex: 1,
  },
  verdictText: {
    fontSize: 17,
  },
  whyBox: {
    marginTop: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: '#EADFCB',
    borderRadius: 12,
    padding: 10,
  },
  whyLabel: {
    fontSize: 10.5,
    letterSpacing: 0.5,
    marginBottom: 7,
  },
  wordChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  wordChip: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  wordHit: {
    backgroundColor: colors.spanishBubble,
  },
  wordMiss: {
    backgroundColor: '#FBE3DF',
  },
  wordMissText: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'solid',
  },
  whyHeard: {
    marginTop: 8,
  },
  nextCard: {
    marginTop: 2,
  },
  nextCardLabel: {
    fontSize: 14,
    marginBottom: 10,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipPrimary: {
    backgroundColor: colors.accent,
  },
  chipLine: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: '#EADFCB',
  },
  chipPressed: {
    opacity: 0.8,
  },
  chipText: {
    fontWeight: '600',
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
  },
  doneText: {
    letterSpacing: 0.2,
  },
  savedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(51,36,28,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 8,
  },
  savedTitle: {
    fontSize: 18,
  },
  pressed: {
    opacity: 0.7,
  },
  micArea: {
    alignItems: 'center',
    paddingBottom: 18,
    paddingTop: 8,
    gap: 8,
  },
  micLabel: {
    letterSpacing: 0.5,
  },
  micButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: 0},
  },
  micButtonRecording: {
    backgroundColor: colors.turquoise,
    shadowColor: colors.turquoise,
  },
  micButtonBusy: {
    backgroundColor: colors.surfaceRaised,
    shadowOpacity: 0,
  },
  micButtonDisabled: {
    opacity: 0.5,
  },
  permissionBox: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
    gap: 16,
  },
  permissionIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.englishBubble,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  permissionTitle: {
    fontSize: 20,
  },
  permissionBody: {
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  errorBanner: {
    backgroundColor: '#FBE3DF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
});
