import {useRouter} from 'expo-router';
import {useEffect, useRef, useState} from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RecordingPresets, useAudioRecorder} from 'expo-audio';

import {
  enterRecordingMode,
  exitRecordingMode,
  requestMicPermission,
} from '../src/services/audioSession';
import {colors, fonts} from '../src/theme';
import {
  Phase,
  TranscriptEntry,
  useConversation,
} from '../src/store/useConversation';

export default function Conversation() {
  const router = useRouter();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [micPermission, setMicPermission] = useState<
    'unknown' | 'granted' | 'denied'
  >('unknown');

  const phase = useConversation((s) => s.phase);
  const transcript = useConversation((s) => s.transcript);
  const currentTarget = useConversation((s) => s.currentTarget);
  const error = useConversation((s) => s.error);
  const startSession = useConversation((s) => s.startSession);
  const setRecording = useConversation((s) => s.setRecording);
  const handleEnglishRecording = useConversation((s) => s.handleEnglishRecording);
  const handleRepeatRecording = useConversation((s) => s.handleRepeatRecording);
  const replayTarget = useConversation((s) => s.replayTarget);
  const reset = useConversation((s) => s.reset);

  const listRef = useRef<FlatList<TranscriptEntry>>(null);

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

  const canUseMic = phase === 'awaiting-english' || phase === 'awaiting-repeat';
  const isRecording = phase === 'recording';

  const onMicPress = async () => {
    if (isRecording) {
      const wasRepeat = currentTarget !== null;
      await recorder.stop();
      await exitRecordingMode();
      const uri = recorder.uri;
      if (!uri) return;
      if (wasRepeat) {
        await handleRepeatRecording(uri);
      } else {
        await handleEnglishRecording(uri);
      }
    } else if (canUseMic) {
      await enterRecordingMode();
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording();
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
        <View style={{width: 20}} />
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

      <MicButton
        phase={phase}
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
      return <ScoreRow score={entry.score ?? 0} text={entry.text} />;
    default:
      return null;
  }
}

function ScoreRow({score, text}: {score: number; text: string}) {
  const color =
    score >= 80 ? colors.scoreGood : score >= 50 ? colors.scoreMid : colors.scoreLow;
  return (
    <View style={styles.scoreRow}>
      <View style={[styles.scoreRing, {borderColor: color}]}>
        <Text style={[styles.scoreNumber, {color}]}>{score}</Text>
      </View>
      <Text style={styles.scoreText}>{text}</Text>
    </View>
  );
}

const MIC_LABELS: Record<Phase, string> = {
  idle: 'Warming up…',
  greeting: 'Listening for you soon…',
  'awaiting-english': 'Tap and tell me what you’re doing',
  recording: 'Listening… tap when done',
  transcribing: 'Got it — writing that down…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  'awaiting-repeat': 'Tap and repeat the Spanish',
  scoring: 'Scoring your attempt…',
};

function MicButton({
  phase,
  disabled,
  onPress,
}: {
  phase: Phase;
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

  return (
    <View style={styles.micArea}>
      <Text style={styles.micLabel}>{MIC_LABELS[phase]}</Text>
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
          <Text style={styles.micIcon}>{isRecording ? '■' : '🎙️'}</Text>
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
    color: colors.accent,
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
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
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
    backgroundColor: colors.danger,
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
