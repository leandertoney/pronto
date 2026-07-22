import {Ionicons} from '@expo/vector-icons';
import {useRouter} from 'expo-router';
import {useCallback, useEffect, useState} from 'react';
import {FlatList, Pressable, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {AppText} from '../src/components/AppText';
import {PrimaryButton} from '../src/components/PrimaryButton';
import {ScoreRing} from '../src/components/ScoreRing';
import {ScreenHeader} from '../src/components/ScreenHeader';
import {LearnedPhrase, loadPhrases, removePhrase} from '../src/lib/phraseStore';
import {speakSpanish, stopSpeaking} from '../src/services/tts';
import {colors} from '../src/theme';

/**
 * My phrases: everything the user has learned, newest first. Tap a card to
 * hear it (natural voice, cached), turtle icon for the slow replay, X to
 * remove (`removePhrase` in the store).
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

  const play = useCallback(async (phrase: LearnedPhrase, slow: boolean) => {
    // A new tap interrupts whatever's currently playing instead of silently
    // no-opping — with only one shared `playing` slot across every row,
    // tapping a second phrase while the first was still mid-fetch used to
    // just do nothing, which read as "the button doesn't always work."
    stopSpeaking();
    setPlaying(phrase.spanish);
    try {
      await speakSpanish(phrase.spanish, slow);
    } finally {
      setPlaying(null);
    }
  }, []);

  const remove = useCallback(async (spanish: string) => {
    setPhrases(await removePhrase(spanish));
  }, []);

  const sorted = [...phrases].sort((a, b) => b.learnedAt - a.learnedAt);

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader
        title={
          <>
            My <AppText variant="title" color={colors.accent}>phrases</AppText>
          </>
        }
        onBack={() => router.back()}
        right={
          <View style={styles.badge}>
            <AppText variant="caption" color={colors.textOnAccent} style={styles.badgeText}>
              {phrases.length}
            </AppText>
          </View>
        }
      />

      {loaded && phrases.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="title" style={styles.emptyTitle}>
            Nothing saved yet
          </AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.emptyBody}>
            Everything you learn lands here.
          </AppText>
          <PrimaryButton
            label="Start talking"
            onPress={() => router.replace('/conversation')}
          />
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
  return (
    <Pressable
      style={({pressed}) => [styles.card, (pressed || isPlaying) && styles.cardActive]}
      onPress={onPlay}
    >
      <ScoreRing score={phrase.bestScore} size={40} />
      <View style={styles.cardText}>
        <AppText variant="title" color={colors.spanishText} style={styles.spanish}>
          {phrase.spanish}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary} style={styles.english}>
          {phrase.english}
        </AppText>
      </View>
      <View style={styles.cardActions}>
        <Pressable hitSlop={8} onPress={onPlaySlow} style={styles.iconSquare}>
          <AppText style={styles.turtleEmoji}>🐢</AppText>
        </Pressable>
        <Pressable hitSlop={8} onPress={onRemove} style={styles.iconSquare}>
          <Ionicons name="close" size={16} color={colors.textSecondary} />
        </Pressable>
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
    minWidth: 38,
    alignItems: 'center',
  },
  badgeText: {
    fontWeight: '700',
  },
  list: {
    paddingBottom: 24,
    gap: 9,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 13,
    gap: 12,
    borderWidth: 1,
    borderColor: '#EADFCB',
  },
  cardActive: {
    borderColor: colors.turquoise,
    backgroundColor: colors.spanishBubble,
  },
  cardText: {
    flex: 1,
  },
  spanish: {
    fontSize: 14.5,
  },
  english: {
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 6,
  },
  iconSquare: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: '#EADFCB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  turtleEmoji: {
    fontSize: 14,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
  },
  emptyTitle: {
    marginBottom: 4,
  },
  emptyBody: {
    lineHeight: 24,
    marginBottom: 8,
  },
});
