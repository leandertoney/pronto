import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_500Medium_Italic,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useFonts} from 'expo-font';
import {Stack} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import {useEffect} from 'react';
import {StatusBar} from 'expo-status-bar';

import {loadPhrases} from '../src/lib/phraseStore';
import {backfillSessionsFromPhrases} from '../src/lib/sessionStore';
import {colors} from '../src/theme';

SplashScreen.preventAutoHideAsync();

const BACKFILL_FLAG_KEY = '@queonda/sessions-backfilled-v1';

/**
 * One time, credit past active days that predate session tracking. A phrase's
 * learnedAt is a real timestamp of a real day the user showed up, so those
 * days become session records for "My week". The underlying backfill is
 * fill-missing-only (idempotent), so this flag is just an optimization to
 * skip the work on later launches, not a correctness guard.
 */
async function runOneTimeBackfill(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(BACKFILL_FLAG_KEY)) return;
    const phrases = await loadPhrases();
    await backfillSessionsFromPhrases(phrases.map((p) => p.learnedAt));
    await AsyncStorage.setItem(BACKFILL_FLAG_KEY, '1');
  } catch {
    // Backfill is a nice-to-have; a failure must not block app startup.
  }
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_500Medium_Italic,
    InstrumentSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    runOneTimeBackfill();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {backgroundColor: colors.background},
          animation: 'fade',
        }}
      />
    </>
  );
}
