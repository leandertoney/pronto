import {useFocusEffect, useRouter} from 'expo-router';
import {useCallback, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {AppText} from '../src/components/AppText';
import {OutlineButton} from '../src/components/OutlineButton';
import {PrimaryButton} from '../src/components/PrimaryButton';
import {ZocaloMark} from '../src/components/ZocaloMark';
import {APP_NAME, APP_SUBTITLE, APP_TAGLINE} from '../src/constants/brand';
import {loadPhrases} from '../src/lib/phraseStore';
import {colors} from '../src/theme';

/** Home: the living zócalo mark, the wordmark, the greeting, and one CTA. */
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
        <ZocaloMark />

        <View style={styles.wordmarkRow}>
          <AppText variant="title" style={styles.wordmark}>
            {APP_NAME}
          </AppText>
          <AppText variant="caption" color={colors.textSecondary} style={styles.subtitleTag}>
            {APP_SUBTITLE.toUpperCase()}
          </AppText>
        </View>

        <AppText variant="display" style={styles.greet}>
          ¿Qué estás <AppText variant="display" color={colors.accent} style={styles.greet}>haciendo?</AppText>
        </AppText>

        <AppText variant="body" color={colors.textSecondary} style={styles.homeSub}>
          <AppText variant="bodyBold" color={colors.textPrimary}>
            {APP_TAGLINE}
          </AppText>{' '}
          Tell me what you're doing, I'll teach you to say it.
        </AppText>

        {phraseCount > 0 && (
          <View style={styles.statLine}>
            <AppText variant="display" color={colors.spanishText} style={styles.statValue}>
              {phraseCount}
            </AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              phrases you actually use
            </AppText>
          </View>
        )}
      </View>

      <View style={styles.buttons}>
        <PrimaryButton label="Start talking" onPress={() => router.push('/conversation')} />
        {phraseCount > 0 && (
          <OutlineButton
            label={`My progress · ${phraseCount}`}
            onPress={() => router.push('/profile')}
          />
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
    gap: 16,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  wordmark: {
    fontSize: 20,
    letterSpacing: -0.3,
  },
  subtitleTag: {
    letterSpacing: 0.5,
  },
  greet: {
    lineHeight: 40,
  },
  homeSub: {
    lineHeight: 24,
    maxWidth: 260,
  },
  statLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
  },
  statValue: {
    fontSize: 26,
  },
  buttons: {
    marginBottom: 24,
    gap: 12,
  },
});
