import {useRouter} from 'expo-router';
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
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
import {colors, fonts} from '../src/theme';
import {
  NextChoice,
  Phase,
  TranscriptEntry,
  useConversation,
} from '../src/store/useConversation';

/**
 * Hands-free conversational flow: after the app finishes speaking it starts
 * listening automatically. Simple metering-based voice activity detection —
 * once you've spoken and then stay quiet for SILENCE_HOLD_MS, the recording
 * is sent. The mic button is a "send now" override; auto-listen can be
 * toggled off for tap-to-talk.
 */
const SPEECH_DB = -35; // above this = speech
const SILENCE_DB = -40; // below this = silence
const SILENCE_HOLD_MS = 650; // quiet this long after speech -> send
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
  const transcript = useConversation((s) => s.transcript);
  const currentTarget = useConversation((s) => s.currentTarget);
  const error = useConversation((s) => s.error);
  const startSession = useConversation((s) => s.startSession);
  const setRecording = useConversation((s) => s.setRecording);
  const cancelRecording = useConversation((s) => s.cancelRecording);
  const handleEnglishRecording = useConversation((s) => s.handleEnglishRecording);
  const handleRepeatRecording = useConversation((s) => s.handleRepeatRecording);
  const chooseNext = useConversation((s) => s.chooseNext);
  const replayTarget = useConversation((s) => s.replayTarget);
  const reset = useConversation((s) => s.reset);

  const listRef = useRef<FlatList<TranscriptEntry>>(null);
  const busyRef = useRef(false); // guards start/stop races
  const listenStartRef = useRef(0);
  const speechDetectedRef = useRef(false);
  const silenceSinceRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const granted = await requestMicPermission();
      if (cancelled) return;
      setMicPermission(granted ? 'granted' : 'denied');
      if (granted) {
        await startSession();
      }
    })();
    return () => {
      cancelled = true;
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (transcript.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({animated: true}), 80);
    }
  }, [transcript.length]);

  const startListening = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await enterRecordingMode();
      await recorder.prepareToRecordAsync();
      recorder.record();
      listenStartRef.current = Date.now();
      speechDetectedRef.current = false;
      silenceSinceRef.current = null;
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
        // During "choosing", talking again means a fresh topic, not a repeat
        // of the just-completed phrase — route it like English input.
        const wasRepeat = phase === 'awaiting-repeat' && currentTarget !== null;
        const duration = Date.now() - listenStartRef.current;
        const heardSpeech = speechDetectedRef.current;
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
      phase,
      currentTarget,
      handleEnglishRecording,
      handleRepeatRecording,
      cancelRecording,
    ],
  );

  // Auto-start listening whenever it's the user's turn (hands-free mode).
  // "choosing" also listens — talking again is a faster way to continue than
  // tapping a chip, and the chips remain as an explicit shortcut.
  useEffect(() => {
    if (
      autoListen &&
      micPermission === 'granted' &&
      (phase === 'awaiting-english' ||
        phase === 'awaiting-repeat' ||
        phase === 'choosing')
    ) {
      const t = setTimeout(() => startListening(), LISTEN_START_DELAY_MS);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase, autoListen, micPermission, startListening]);

  // Voice activity detection: watch metering while recording.
  useEffect(() => {
    if (phase !== 'recording' || !recorderState.isRecording) return;
    const now = Date.now();
    const elapsed = now - listenStartRef.current;
    const level = recorderState.metering;

    if (typeof level === 'number') {
      if (level > SPEECH_DB) {
        speechDetectedRef.current = true;
        silenceSinceRef.current = null;
      } else if (speechDetectedRef.current && level < SILENCE_DB) {
        if (silenceSinceRef.current === null) {
          silenceSinceRef.current = now;
        } else if (now - silenceSinceRef.current >= SILENCE_HOLD_MS) {
          finishListening(true);
          return;
        }
      }
    }

    if (!speechDetectedRef.current && elapsed >= NO_SPEECH_TIMEOUT_MS) {
      // Heard nothing — recycle the listener so we don't record forever.
      finishListening(false);
    } else if (elapsed >= MAX_UTTERANCE_MS) {
      finishListening(speechDetectedRef.current);
    }
  }, [phase, recorderState, finishListening]);

  const canUseMic =
    phase === 'awaiting-english' ||
    phase === 'awaiting-repeat' ||
    phase === 'choosing';
  const isRecording = phase === 'recording';

  const onMicPress = async () => {
    if (isRecording) {
      await finishListening(true);
    } else if (canUseMic) {
      await startListening();
    }
  };

  if (micPermission === 'denied') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionBox}>
          <Text style={styles.permissionTitle}>We need your voice 🎙️</Text>
          <Text style={styles.permissionBody}>
            Qué Onda is a speaking app — without the microphone there's nothing
            to practice. Enable microphone access for Expo Go in Settings, then
            come back and we'll pick it right up.
          </Text>
          <Pressable style={styles.permissionButton} onPress={() => router.back()}>
            <Text style={styles.permissionButtonText}>Back to Home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.headerBack}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>qué onda</Text>
        <Pressable onPress={() => setAutoListen((v) => !v)} hitSlop={8}>
          <Text style={[styles.autoToggle, !autoListen && styles.autoToggleOff]}>
            {autoListen ? 'auto 🎙️' : 'tap 🎙️'}
          </Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={transcript}
        keyExtractor={(item) => item.id}
        renderItem={({item}) => (
          <TranscriptRow entry={item} onReplay={replayTarget} />
        )}
        contentContainerStyle={styles.listContent}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {phase === 'choosing' && <NextChips onChoose={chooseNext} />}

      <MicButton
        phase={phase}
        autoListen={autoListen}
        disabled={!canUseMic && !isRecording}
        onPress={onMicPress}
      />
    </SafeAreaView>
  );
}

function TranscriptRow({
  entry,
  onReplay,
}: {
  entry: TranscriptEntry;
  onReplay: (slow: boolean) => void;
}) {
  switch (entry.kind) {
    case 'coach':
      return <Text style={styles.coachLine}>{entry.text}</Text>;
    case 'user-english':
    case 'user-attempt':
      return (
        <View style={[styles.bubble, styles.userBubble]}>
          <Text style={styles.userText}>{entry.text}</Text>
        </View>
      );
    case 'spanish':
      return (
        <View style={[styles.bubble, styles.spanishBubble]}>
          <Text style={styles.spanishText}>{entry.text}</Text>
          {entry.englishMeaning ? (
            <Text style={styles.meaningText}>{entry.englishMeaning}</Text>
          ) : null}
          <View style={styles.replayRow}>
            <Pressable style={styles.replayButton} onPress={() => onReplay(false)}>
              <Text style={styles.replayText}>▶ Replay</Text>
            </Pressable>
            <Pressable style={styles.replayButton} onPress={() => onReplay(true)}>
              <Text style={styles.replayText}>🐢 Slow</Text>
            </Pressable>
          </View>
        </View>
      );
    case 'score':
      return <ScoreRow entry={entry} />;
    default:
      return null;
  }
}

function ScoreRow({entry}: {entry: TranscriptEntry}) {
  const score = entry.score ?? 0;
  const perfect = score >= 80;
  const color =
    perfect ? colors.scoreGood : score >= 50 ? colors.scoreMid : colors.scoreLow;

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
    <Animated.View
      style={[
        styles.scoreCard,
        perfect && styles.scoreCardPerfect,
        {transform: [{scale}]},
      ]}
    >
      <View style={styles.scoreRow}>
        <View style={[styles.scoreRing, {borderColor: color}]}>
          <Text style={[styles.scoreNumber, {color}]}>{score}</Text>
        </View>
        <Text style={[styles.scoreText, perfect && styles.scoreTextPerfect]}>
          {perfect ? '🎉 ' : ''}
          {entry.text}
        </Text>
      </View>
      {showWhy && (
        <View style={styles.whyBox}>
          <Text style={styles.whyTarget}>
            {entry.targetWords!.map((w, i) => (
              <Text key={i} style={w.hit ? styles.whyHit : styles.whyMiss}>
                {w.word}
                {i < entry.targetWords!.length - 1 ? ' ' : ''}
              </Text>
            ))}
          </Text>
          <Text style={styles.whyHeard}>I heard: “{entry.heard}”</Text>
        </View>
      )}
    </Animated.View>
  );
}

const NEXT_CHIPS: Array<{label: string; choice: NextChoice}> = [
  {label: '➕ Build on it', choice: {kind: 'extend'}},
  {label: '📍 Add where', choice: {kind: 'extend', element: 'a location — where this is happening'}},
  {label: '🕐 Add when', choice: {kind: 'extend', element: 'a time of day'}},
  {label: '😊 Add a feeling', choice: {kind: 'extend', element: 'how the user feels about it'}},
  {label: '🔄 New topic', choice: {kind: 'new-topic'}},
];

function NextChips({onChoose}: {onChoose: (choice: NextChoice) => void}) {
  return (
    <View style={styles.chipsWrap}>
      {NEXT_CHIPS.map((chip) => (
        <Pressable
          key={chip.label}
          style={({pressed}) => [styles.chip, pressed && styles.chipPressed]}
          onPress={() => onChoose(chip.choice)}
        >
          <Text style={styles.chipText}>{chip.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const MIC_LABELS: Record<Phase, string> = {
  idle: 'Warming up…',
  greeting: 'Say hi in a second…',
  'awaiting-english': 'Tell me what you’re doing',
  recording: 'Listening… pause when you’re done',
  transcribing: 'Got it — writing that down…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  'awaiting-repeat': 'Your turn — say it in Spanish',
  scoring: 'Scoring your attempt…',
  choosing: 'What next? Pick one 👆',
};

function MicButton({
  phase,
  autoListen,
  disabled,
  onPress,
}: {
  phase: Phase;
  autoListen: boolean;
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
      ? 'Listening… pause when done (or tap to send)'
      : 'Listening… tap to send'
    : MIC_LABELS[phase];

  return (
    <View style={styles.micArea}>
      <Text style={styles.micLabel}>{label}</Text>
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
          <Text style={styles.micIcon}>{isRecording ? '➤' : '🎙️'}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  headerBack: {
    color: colors.textSecondary,
    fontSize: 32,
    lineHeight: 32,
  },
  headerTitle: {
    ...fonts.caption,
    color: colors.textSecondary,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  autoToggle: {
    ...fonts.caption,
    color: colors.turquoise,
  },
  autoToggleOff: {
    color: colors.textSecondary,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 10,
  },
  coachLine: {
    ...fonts.body,
    color: colors.textSecondary,
    marginTop: 8,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: '88%',
  },
  userBubble: {
    backgroundColor: colors.englishBubble,
    alignSelf: 'flex-end',
  },
  userText: {
    ...fonts.body,
    color: colors.textPrimary,
  },
  spanishBubble: {
    backgroundColor: colors.spanishBubble,
    borderWidth: 1,
    borderColor: colors.spanishBorder,
    alignSelf: 'flex-start',
  },
  spanishText: {
    ...fonts.title,
    color: colors.spanishText,
  },
  meaningText: {
    ...fonts.caption,
    color: colors.textSecondary,
    marginTop: 6,
  },
  replayRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  replayButton: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  replayText: {
    ...fonts.caption,
    color: colors.textPrimary,
  },
  scoreCard: {
    marginVertical: 4,
  },
  scoreCardPerfect: {
    backgroundColor: colors.englishBubble,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.sunshine,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scoreTextPerfect: {
    ...fonts.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  whyBox: {
    marginTop: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 10,
  },
  whyTarget: {
    ...fonts.body,
    color: colors.textPrimary,
    lineHeight: 26,
  },
  whyHit: {
    color: colors.scoreGood,
  },
  whyMiss: {
    color: colors.scoreLow,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  whyHeard: {
    ...fonts.caption,
    color: colors.textSecondary,
    marginTop: 6,
    fontStyle: 'italic',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.turquoise,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipPressed: {
    backgroundColor: colors.spanishBubble,
  },
  chipText: {
    ...fonts.caption,
    color: colors.turquoise,
    fontWeight: '600',
  },
  scoreRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumber: {
    fontSize: 18,
    fontWeight: '700',
  },
  scoreText: {
    ...fonts.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  errorText: {
    ...fonts.caption,
    color: colors.danger,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  micArea: {
    alignItems: 'center',
    paddingBottom: 18,
    paddingTop: 8,
  },
  micLabel: {
    ...fonts.caption,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  micButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonRecording: {
    backgroundColor: colors.turquoise,
  },
  micButtonBusy: {
    backgroundColor: colors.surfaceRaised,
  },
  micButtonDisabled: {
    opacity: 0.5,
  },
  micIcon: {
    fontSize: 30,
    color: colors.textOnAccent,
  },
  permissionBox: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 16,
  },
  permissionTitle: {
    ...fonts.title,
    color: colors.textPrimary,
  },
  permissionBody: {
    ...fonts.body,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  permissionButtonText: {
    ...fonts.body,
    color: colors.accent,
  },
});
