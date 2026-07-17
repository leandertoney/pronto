import {useRouter} from 'expo-router';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {colors, fonts} from '../src/theme';

/** Home: app name + wave motif, one button. That's it. */
export default function Home() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.waveRow}>
          <View style={[styles.wave, styles.waveOne]} />
          <View style={[styles.wave, styles.waveTwo]} />
          <View style={[styles.wave, styles.waveThree]} />
        </View>
        <Text style={styles.title}>¿qué onda?</Text>
        <Text style={styles.subtitle}>
          Learn the Spanish for what you're doing right now.
        </Text>
      </View>

      <Pressable
        style={({pressed}) => [styles.cta, pressed && styles.ctaPressed]}
        onPress={() => router.push('/conversation')}
      >
        <Text style={styles.ctaText}>Start Talking</Text>
      </Pressable>
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
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  waveOne: {width: 56, opacity: 1},
  waveTwo: {width: 34, opacity: 0.55},
  waveThree: {width: 18, opacity: 0.25},
  title: {
    ...fonts.display,
    fontSize: 44,
    color: colors.textPrimary,
  },
  subtitle: {
    ...fonts.body,
    color: colors.textSecondary,
    marginTop: 12,
    lineHeight: 24,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 24,
  },
  ctaPressed: {
    opacity: 0.85,
  },
  ctaText: {
    ...fonts.title,
    color: colors.textOnAccent,
  },
});
