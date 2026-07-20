import {useFocusEffect, useRouter} from 'expo-router';
import {useCallback, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {AppText} from '../src/components/AppText';
import {Card} from '../src/components/Card';
import {PrimaryButton} from '../src/components/PrimaryButton';
import {ScoreRing, scoreColorFor} from '../src/components/ScoreRing';
import {ScreenHeader} from '../src/components/ScreenHeader';
import {LearnedPhrase, loadPhrases} from '../src/lib/phraseStore';
import {DictionaryWord, loadWords} from '../src/lib/wordStore';
import {speakSpanish} from '../src/services/tts';
import {colors} from '../src/theme';

const WEAK_SCORE_THRESHOLD = 80;

/**
 * My progress: stats at a glance, phrases that need more practice
 * (auto-flagged, not manually assigned), and the word-level dictionary built
 * up from every phrase Claude has taught.
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
      <ScreenHeader
        title={
          <>
            My <AppText variant="title" color={colors.accent}>progress</AppText>
          </>
        }
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.statsRow}>
          <StatTile value={phrases.length} label="Phrases" color={colors.turquoise} />
          <StatTile value={words.length} label="Words" color={colors.sunshine} />
          <StatTile
            value={avgScore ?? '--'}
            label="Avg score"
            color={avgScore === null ? colors.textSecondary : scoreColorFor(avgScore)}
          />
        </View>

        {loaded && phrases.length === 0 && (
          <View style={styles.emptyState}>
            <AppText variant="title">Nothing to show yet</AppText>
            <AppText variant="body" color={colors.textSecondary} style={styles.emptyBody}>
              Have a conversation and your stats, weak spots, and word
              dictionary will show up here.
            </AppText>
            <PrimaryButton
              label="Start talking"
              onPress={() => router.replace('/conversation')}
            />
          </View>
        )}

        {needsPractice.length > 0 && (
          <Section title="Needs practice" accent={colors.accent}>
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
          <Section title="My dictionary" accent={colors.sunshine}>
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
            <AppText variant="caption" color={colors.spanishText} style={styles.linkText}>
              Browse all phrases in My phrases →
            </AppText>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
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
    <Card style={styles.statTile}>
      <AppText variant="display" color={color} style={styles.statValue}>
        {value}
      </AppText>
      <AppText variant="caption" color={colors.textSecondary} style={styles.statLabel}>
        {label.toUpperCase()}
      </AppText>
    </Card>
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
        <AppText variant="title" style={styles.sectionTitle}>
          {title}
        </AppText>
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
  return (
    <Pressable
      style={({pressed}) => [styles.practiceRow, (pressed || isPlaying) && styles.rowActive]}
      onPress={onPlay}
    >
      <ScoreRing score={phrase.bestScore} size={34} borderWidth={3} />
      <View style={styles.cardText}>
        <AppText variant="title" color={colors.spanishText} style={styles.practiceSpanish}>
          {phrase.spanish}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary} style={styles.practiceEnglish}>
          {phrase.english}
        </AppText>
      </View>
      <AppText variant="button" color={colors.accent} style={styles.playHint}>
        ▶
      </AppText>
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
      <AppText variant="title" color={colors.spanishText} style={styles.wordSpanish}>
        {word.word}
      </AppText>
      <AppText variant="caption" color={colors.textSecondary} style={styles.wordMeaning}>
        {word.meaning}
      </AppText>
      {word.timesSeen > 1 && (
        <View style={styles.wordSeenBadge}>
          <AppText variant="caption" color={colors.textPrimary} style={styles.wordSeenText}>
            ×{word.timesSeen}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 32,
    gap: 24,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 9,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
  },
  statValue: {
    fontSize: 22,
    letterSpacing: 0,
  },
  statLabel: {
    fontSize: 10.5,
    letterSpacing: 0.4,
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
    fontSize: 14,
  },
  practiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    gap: 11,
    borderWidth: 1,
    borderColor: '#EADFCB',
    marginBottom: 8,
  },
  rowActive: {
    borderColor: colors.turquoise,
    backgroundColor: colors.spanishBubble,
  },
  cardText: {
    flex: 1,
  },
  practiceSpanish: {
    fontSize: 13.5,
  },
  practiceEnglish: {
    fontSize: 11.5,
    marginTop: 2,
  },
  playHint: {
    fontSize: 15,
  },
  wordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  wordChip: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#EADFCB',
    flexDirection: 'row',
    alignItems: 'center',
  },
  wordChipActive: {
    borderColor: colors.sunshine,
    backgroundColor: colors.englishBubble,
  },
  wordSpanish: {
    fontSize: 13,
  },
  wordMeaning: {
    fontSize: 10.5,
    marginLeft: 4,
  },
  wordSeenBadge: {
    backgroundColor: colors.sunshine,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 5,
  },
  wordSeenText: {
    fontSize: 10,
    fontWeight: '700',
  },
  linkRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    fontWeight: '600',
  },
  emptyState: {
    paddingVertical: 24,
    gap: 16,
  },
  emptyBody: {
    lineHeight: 24,
  },
  pressed: {
    opacity: 0.85,
  },
});
