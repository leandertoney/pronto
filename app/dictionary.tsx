import {Ionicons} from '@expo/vector-icons';
import {useFocusEffect, useRouter} from 'expo-router';
import {useCallback, useMemo, useState} from 'react';
import {FlatList, Pressable, SectionList, StyleSheet, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {AppText} from '../src/components/AppText';
import {ScreenHeader} from '../src/components/ScreenHeader';
import {scoreColorFor} from '../src/components/ScoreRing';
import {LearnedPhrase, loadPhrases} from '../src/lib/phraseStore';
import {
  DictionaryFilter,
  DictionaryWord,
  filterWords,
  groupWordsAlphabetically,
  loadWords,
  wordStrength,
} from '../src/lib/wordStore';
import {speakSpanish, stopSpeaking} from '../src/services/tts';
import {colors} from '../src/theme';

/**
 * My dictionary, full screen (per momentum-dictionary-mockups.html): the
 * word list graduated out of a chip pile inside My progress. Adds search,
 * a strength bar per word (reusing the score band colors), and provenance —
 * every word shows the phrase(s) it came from, so vocabulary here reads as
 * coming from YOUR life, not a word list.
 */

const FILTERS: Array<{key: DictionaryFilter; label: string}> = [
  {key: 'all', label: 'All'},
  {key: 'needs-practice', label: 'Needs practice'},
  {key: 'strongest', label: 'Strongest'},
  {key: 'recent', label: 'Recent'},
];

export default function Dictionary() {
  const router = useRouter();
  const [words, setWords] = useState<DictionaryWord[]>([]);
  const [phrases, setPhrases] = useState<LearnedPhrase[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<DictionaryFilter>('all');
  const [playing, setPlaying] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadWords(), loadPhrases()]).then(([w, p]) => {
        setWords(w);
        setPhrases(p);
      });
    }, []),
  );

  const phraseScores = useMemo(
    () => new Map(phrases.map((p) => [p.spanish, p.bestScore])),
    [phrases],
  );

  const visible = useMemo(
    () => filterWords(words, query, filter, phraseScores),
    [words, query, filter, phraseScores],
  );

  // Letter headers only make sense on the alphabetical "All" view; the
  // reordering filters (strongest/recent) impose their own order, so those
  // render as a flat list. "Needs practice" is a filtered subset, also flat.
  const sections = useMemo(
    () =>
      filter === 'all'
        ? groupWordsAlphabetically(visible).map((g) => ({title: g.letter, data: g.words}))
        : null,
    [filter, visible],
  );

  const play = useCallback(async (word: string) => {
    stopSpeaking();
    setPlaying(word);
    try {
      await speakSpanish(word);
    } finally {
      setPlaying(null);
    }
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader
        title={
          <>
            My <AppText variant="title" color={colors.accent}>dictionary</AppText>
          </>
        }
        onBack={() => router.back()}
        right={
          <View style={styles.badge}>
            <AppText variant="caption" color={colors.textOnAccent} style={styles.badgeText}>
              {words.length}
            </AppText>
          </View>
        }
      />

      <View style={styles.search}>
        <Ionicons name="search" size={15} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your words"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipOn]}
            onPress={() => setFilter(f.key)}
          >
            <AppText
              variant="caption"
              color={filter === f.key ? colors.background : colors.textSecondary}
              style={styles.filterChipText}
            >
              {f.label}
            </AppText>
          </Pressable>
        ))}
      </View>

      {visible.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="body" color={colors.textSecondary}>
            {words.length === 0
              ? 'Words you learn will collect here.'
              : 'No words match that.'}
          </AppText>
        </View>
      ) : sections ? (
        <SectionList
          sections={sections}
          keyExtractor={(w) => w.word.toLowerCase()}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({section}) => (
            <AppText variant="title" color={colors.accent} style={styles.letterHeader}>
              {section.title}
            </AppText>
          )}
          renderItem={({item}) => (
            <WordRow
              word={item}
              strength={wordStrength(item, phraseScores)}
              isPlaying={playing === item.word}
              onPlay={() => play(item.word)}
            />
          )}
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(w) => w.word.toLowerCase()}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({item}) => (
            <WordRow
              word={item}
              strength={wordStrength(item, phraseScores)}
              isPlaying={playing === item.word}
              onPlay={() => play(item.word)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function provenanceLabel(sourcePhrases: string[]): string | null {
  if (sourcePhrases.length === 0) return null;
  if (sourcePhrases.length === 1) return `from "${sourcePhrases[0]}"`;
  return `from ${sourcePhrases.length} phrases`;
}

function WordRow({
  word,
  strength,
  isPlaying,
  onPlay,
}: {
  word: DictionaryWord;
  strength: number | null;
  isPlaying: boolean;
  onPlay: () => void;
}) {
  const provenance = provenanceLabel(word.sourcePhrases);
  return (
    <Pressable
      style={({pressed}) => [styles.row, (pressed || isPlaying) && styles.rowActive]}
      onPress={onPlay}
    >
      <View
        style={[
          styles.strengthBar,
          {backgroundColor: strength === null ? '#EADFCB' : scoreColorFor(strength)},
        ]}
      />
      <View style={styles.rowText}>
        <AppText variant="title" color={colors.spanishText} style={styles.rowWord}>
          {word.word}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary} style={styles.rowMeaning}>
          {word.meaning}
        </AppText>
        {provenance && (
          <AppText variant="captionItalic" color={colors.textSecondary} style={styles.rowFrom}>
            {provenance}
          </AppText>
        )}
      </View>
      {word.timesSeen > 1 && (
        <View style={styles.count}>
          <AppText variant="caption" color={colors.textPrimary} style={styles.countText}>
            ×{word.timesSeen}
          </AppText>
        </View>
      )}
      <View style={styles.speaker}>
        <Ionicons name="volume-high" size={15} color={colors.spanishText} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
  },
  badge: {
    backgroundColor: colors.turquoise,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 4,
    minWidth: 34,
    alignItems: 'center',
  },
  badgeText: {
    fontWeight: '700',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#EADFCB',
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 4,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'InstrumentSans_400Regular',
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 9,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 11,
    marginBottom: 12,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#EADFCB',
  },
  filterChipOn: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  filterChipText: {
    fontWeight: '600',
  },
  list: {
    paddingBottom: 24,
  },
  letterHeader: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 6,
    marginLeft: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#EADFCB',
    borderRadius: 14,
    padding: 11,
    marginBottom: 7,
  },
  rowActive: {
    borderColor: colors.spanishBorder,
    backgroundColor: colors.spanishBubble,
  },
  strengthBar: {
    width: 8,
    height: 34,
    borderRadius: 4,
  },
  rowText: {
    flex: 1,
  },
  rowWord: {
    fontSize: 15,
  },
  rowMeaning: {
    fontSize: 11.5,
    marginTop: 1,
  },
  rowFrom: {
    fontSize: 10,
    marginTop: 3,
  },
  count: {
    backgroundColor: colors.sunshine,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    fontSize: 10,
    fontWeight: '700',
  },
  speaker: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.spanishBubble,
    borderWidth: 1,
    borderColor: colors.spanishBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 48,
  },
});
