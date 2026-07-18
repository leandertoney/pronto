import {useRouter} from 'expo-router';
import {useCallback, useEffect, useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {LearnedPhrase, loadPhrases, removePhrase} from '../src/lib/phraseStore';
import {speakSpanish} from '../src/services/tts';
import {colors, fonts} from '../src/theme';

/**
 * Mis frases: everything the user has learned, newest first. Tap a card to
 * hear it (natural voice, cached), 🐢 for the slow replay, ✕ to remove.
 */
export default function Phrases() {
  const router = useRouter();
  const [phrases, setPhrases] = useState<LearnedPhrase[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    loadPhrases().then((p) => {
      setPhrases(p);
      setLoaded(true);
    });
  }, []);

  const play = useCallback(
    async (phrase: LearnedPhrase, slow: boolean) => {
      if (playing) return;
      setPlaying(phrase.spanish);
      try {
        await speakSpanish(phrase.spanish, slow);
      } finally {
        setPlaying(null);
      }
    },
    [playing],
  );

  const remove = useCallback(async (spanish: string) => {
    setPhrases(await removePhrase(spanish));
  }, []);

  const sorted = [...phrases].sort((a, b) => b.learnedAt - a.learnedAt);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          Mis <Text style={styles.headerAccent}>frases</Text>
        </Text>
        <Text style={styles.count}>{phrases.length}</Text>
      </View>

      {loaded && phrases.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={styles.emptyBody}>
            Phrases you learn in conversation land here so you can replay and
            practice them any time.
          </Text>
          <Pressable
            style={({pressed}) => [styles.emptyCta, pressed && styles.pressed]}
            onPress={() => router.replace('/conversation')}
          >
            <Text style={styles.emptyCtaText}>Start Talking</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.spanish}
          contentContainerStyle={styles.list}
          renderItem={({item}) => (
            <PhraseCard
              phrase={item}
              isPlaying={playing === item.spanish}
              onPlay={() => play(item, false)}
              onPlaySlow={() => play(item, true)}
              onRemove={() => remove(item.spanish)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function PhraseCard({
  phrase,
  isPlaying,
  onPlay,
  onPlaySlow,
  onRemove,
}: {
  phrase: LearnedPhrase;
  isPlaying: boolean;
  onPlay: () => void;
  onPlaySlow: () => void;
  onRemove: () => void;
}) {
  const scoreColor =
    phrase.bestScore >= 80
      ? colors.scoreGood
      : phrase.bestScore >= 50
        ? colors.scoreMid
        : colors.scoreLow;

  return (
    <Pressable
      style={({pressed}) => [styles.card, (pressed || isPlaying) && styles.cardActive]}
      onPress={onPlay}
    >
      <View style={[styles.scoreRing, {borderColor: scoreColor}]}>
        <Text style={[styles.scoreNumber, {color: scoreColor}]}>{phrase.bestScore}</Text>
      </View>
      <View style={styles.cardText}>
        <Text style={styles.spanish}>{phrase.spanish}</Text>
        <Text style={styles.english}>{phrase.english}</Text>
      </View>
      <View style={styles.cardActions}>
        <Pressable hitSlop={8} onPress={onPlaySlow} style={styles.actionButton}>
          <Text style={styles.actionEmoji}>🐢</Text>
        </Pressable>
        <Pressable hitSlop={8} onPress={onRemove} style={styles.actionButton}>
          <Text style={styles.removeText}>✕</Text>
        </Pressable>
      </View>
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  backText: {
    ...fonts.body,
    color: colors.accent,
    fontWeight: '600',
  },
  headerTitle: {
    ...fonts.title,
    flex: 1,
    color: colors.textPrimary,
  },
  headerAccent: {
    color: colors.accent,
  },
  count: {
    ...fonts.caption,
    color: colors.textOnAccent,
    backgroundColor: colors.turquoise,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.surfaceRaised,
  },
  cardActive: {
    borderColor: colors.turquoise,
    backgroundColor: colors.spanishBubble,
  },
  scoreRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumber: {
    ...fonts.caption,
    fontWeight: '700',
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
  cardActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionButton: {
    padding: 6,
  },
  actionEmoji: {
    fontSize: 18,
  },
  removeText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    ...fonts.title,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptyBody: {
    ...fonts.body,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: 24,
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
