import {useFocusEffect, useRouter} from 'expo-router';
import {useCallback, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {loadPhrases} from '../src/lib/phraseStore';
import {colors, fonts} from '../src/theme';

/** Home: app name + wave motif, start button, and a door to saved phrases. */
export default function Home() {
  const router = useRouter();
  const [phraseCount, setPhraseCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      loadPhrases().then((p) => setPhraseCount(p.length));
    }, []),
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.waveRow}>
          <View style={[styles.wave, styles.waveOne]} />
          <View style={[styles.wave, styles.waveTwo]} />
          <View style={[styles.wave, styles.waveThree]} />
        </View>
        <Text style={styles.title}>
          ¿qué <Text style={styles.titleAccent}>onda</Text>?
        </Text>
        <Text style={styles.subtitle}>
          Learn the Spanish for what you're doing right now.
        </Text>
      </View>

      <View style={styles.buttons}>
        <Pressable
          style={({pressed}) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={() => router.push('/conversation')}
        >
          <Text style={styles.ctaText}>Start Talking</Text>
        </Pressable>
        {phraseCount > 0 && (
          <Pressable
            style={({pressed}) => [styles.secondary, pressed && styles.ctaPressed]}
            onPress={() => router.push('/profile')}
          >
            <Text style={styles.secondaryText}>
              Mi progreso <Text style={styles.secondaryCount}>· {phraseCount}</Text>
            </Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
  },
  waveRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 24,
  },
  wave: {
    height: 8,
    borderRadius: 4,
  },
  waveOne: {width: 56, backgroundColor: colors.accent},
  waveTwo: {width: 34, backgroundColor: colors.sunshine},
  waveThree: {width: 18, backgroundColor: colors.turquoise},
  title: {
    ...fonts.display,
    fontSize: 44,
    color: colors.textPrimary,
  },
  titleAccent: {
    color: colors.accent,
  },
  subtitle: {
    ...fonts.body,
    color: colors.textSecondary,
    marginTop: 12,
    lineHeight: 24,
  },
  buttons: {
    marginBottom: 24,
    gap: 12,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  secondary: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.turquoise,
  },
  secondaryText: {
    ...fonts.body,
    fontWeight: '600',
    color: colors.turquoise,
  },
  secondaryCount: {
    color: colors.textSecondary,
    fontWeight: '400',
  },
  ctaPressed: {
    opacity: 0.85,
  },
  ctaText: {
    ...fonts.title,
    color: colors.textOnAccent,
  },
});
