import {useFocusEffect, useRouter} from 'expo-router';
import {useCallback, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {LearnedPhrase, loadPhrases} from '../src/lib/phraseStore';
import {DictionaryWord, loadWords} from '../src/lib/wordStore';
import {speakSpanish} from '../src/services/tts';
import {colors, fonts} from '../src/theme';

const WEAK_SCORE_THRESHOLD = 80;

/**
 * Progress hub: the "how am I doing" home base. Stats at a glance, phrases
 * that need more practice (auto-flagged, not manually assigned), and the
 * word-level dictionary built up from every phrase Claude has taught.
 */
export default function Profile() {
  const router = useRouter();
  const [phrases, setPhrases] = useState<LearnedPhrase[]>([]);
  const [words, setWords] = useState<DictionaryWord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadPhrases(), loadWords()]).then(([p, w]) => {
        setPhrases(p);
        setWords(w);
        setLoaded(true);
      });
    }, []),
  );

  const play = useCallback(
    async (spanish: string) => {
      if (playing) return;
      setPlaying(spanish);
      try {
        await speakSpanish(spanish);
      } finally {
        setPlaying(null);
      }
    },
    [playing],
  );

  const needsPractice = [...phrases]
    .filter((p) => p.bestScore < WEAK_SCORE_THRESHOLD)
    .sort((a, b) => a.bestScore - b.bestScore);

  const avgScore =
    phrases.length === 0
      ? null
      : Math.round(phrases.reduce((sum, p) => sum + p.bestScore, 0) / phrases.length);

  const sortedWords = [...words].sort((a, b) => b.timesSeen - a.timesSeen);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          Mi <Text style={styles.headerAccent}>progreso</Text>
        </Text>
        <View style={{width: 44}} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.statsRow}>
          <StatTile value={phrases.length} label="phrases" color={colors.turquoise} />
          <StatTile value={words.length} label="words" color={colors.sunshine} />
          <StatTile
            value={avgScore ?? '—'}
            label="avg score"
            color={avgScore === null ? colors.textSecondary : scoreColorFor(avgScore)}
          />
        </View>

        {loaded && phrases.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Nothing to show yet</Text>
            <Text style={styles.emptyBody}>
              Have a conversation and your stats, weak spots, and word
              dictionary will show up here.
            </Text>
            <Pressable
              style={({pressed}) => [styles.emptyCta, pressed && styles.pressed]}
              onPress={() => router.replace('/conversation')}
            >
              <Text style={styles.emptyCtaText}>Start Talking</Text>
            </Pressable>
          </View>
        )}

        {needsPractice.length > 0 && (
          <Section title="Needs practice" accent={colors.scoreLow}>
            {needsPractice.map((p) => (
              <PracticeRow
                key={p.spanish}
                phrase={p}
                isPlaying={playing === p.spanish}
                onPlay={() => play(p.spanish)}
              />
            ))}
          </Section>
        )}

        {sortedWords.length > 0 && (
          <Section title="Mi diccionario" accent={colors.turquoise}>
            <View style={styles.wordGrid}>
              {sortedWords.map((w) => (
                <WordChip
                  key={w.word.toLowerCase()}
                  word={w}
                  isPlaying={playing === w.word}
                  onPlay={() => play(w.word)}
                />
              ))}
            </View>
          </Section>
        )}

        {phrases.length > 0 && (
          <Pressable
            style={({pressed}) => [styles.linkRow, pressed && styles.pressed]}
            onPress={() => router.push('/phrases')}
          >
            <Text style={styles.linkText}>Browse all phrases in Mis frases →</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function scoreColorFor(score: number): string {
  return score >= 80 ? colors.scoreGood : score >= 50 ? colors.scoreMid : colors.scoreLow;
}

function StatTile({
  value,
  label,
  color,
}: {
  value: number | string;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.statTile}>
      <Text style={[styles.statValue, {color}]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionDot, {backgroundColor: accent}]} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function PracticeRow({
  phrase,
  isPlaying,
  onPlay,
}: {
  phrase: LearnedPhrase;
  isPlaying: boolean;
  onPlay: () => void;
}) {
  const color = scoreColorFor(phrase.bestScore);
  return (
    <Pressable
      style={({pressed}) => [styles.practiceRow, (pressed || isPlaying) && styles.rowActive]}
      onPress={onPlay}
    >
      <View style={[styles.miniRing, {borderColor: color}]}>
        <Text style={[styles.miniRingText, {color}]}>{phrase.bestScore}</Text>
      </View>
      <View style={styles.cardText}>
        <Text style={styles.spanish}>{phrase.spanish}</Text>
        <Text style={styles.english}>{phrase.english}</Text>
      </View>
      <Text style={styles.playHint}>▶</Text>
    </Pressable>
  );
}

function WordChip({
  word,
  isPlaying,
  onPlay,
}: {
  word: DictionaryWord;
  isPlaying: boolean;
  onPlay: () => void;
}) {
  return (
    <Pressable
      style={({pressed}) => [styles.wordChip, (pressed || isPlaying) && styles.wordChipActive]}
      onPress={onPlay}
    >
      <Text style={styles.wordSpanish}>{word.word}</Text>
      <Text style={styles.wordMeaning}>{word.meaning}</Text>
      {word.timesSeen > 1 && (
        <Text style={styles.wordSeen}>×{word.timesSeen}</Text>
      )}
    </Pressable>
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
    paddingVertical: 12,
  },
  backText: {
    ...fonts.body,
    color: colors.accent,
    fontWeight: '600',
  },
  headerTitle: {
    ...fonts.title,
    color: colors.textPrimary,
  },
  headerAccent: {
    color: colors.accent,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 24,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceRaised,
  },
  statValue: {
    ...fonts.display,
    fontSize: 28,
  },
  statLabel: {
    ...fonts.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    ...fonts.title,
    fontSize: 18,
    color: colors.textPrimary,
  },
  practiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.surfaceRaised,
    marginBottom: 8,
  },
  rowActive: {
    borderColor: colors.turquoise,
    backgroundColor: colors.spanishBubble,
  },
  miniRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniRingText: {
    ...fonts.caption,
    fontWeight: '700',
    fontSize: 12,
  },
  cardText: {
    flex: 1,
  },
  spanish: {
    ...fonts.body,
    fontWeight: '600',
    color: colors.spanishText,
  },
  english: {
    ...fonts.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  playHint: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  wordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  wordChip: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.surfaceRaised,
    minWidth: '30%',
  },
  wordChipActive: {
    borderColor: colors.sunshine,
    backgroundColor: colors.englishBubble,
  },
  wordSpanish: {
    ...fonts.caption,
    fontWeight: '700',
    color: colors.spanishText,
  },
  wordMeaning: {
    ...fonts.caption,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  wordSeen: {
    ...fonts.caption,
    color: colors.sunshine,
    fontSize: 10,
    marginTop: 2,
    fontWeight: '700',
  },
  linkRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    ...fonts.caption,
    color: colors.turquoise,
    fontWeight: '600',
  },
  emptyState: {
    paddingVertical: 24,
    gap: 16,
  },
  emptyTitle: {
    ...fonts.title,
    color: colors.textPrimary,
  },
  emptyBody: {
    ...fonts.body,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  emptyCta: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyCtaText: {
    ...fonts.title,
    color: colors.textOnAccent,
  },
  pressed: {
    opacity: 0.85,
  },
});
