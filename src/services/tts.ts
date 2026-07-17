import * as Speech from 'expo-speech';

/**
 * Text-to-speech via expo-speech (device voices, free, Expo Go compatible).
 * Spanish phrases MUST use a Spanish voice — never an English voice reading
 * Spanish text — so we resolve a Spanish voice once and cache it.
 */

const SPANISH_RATE = 0.85;
const SPANISH_SLOW_RATE = 0.6;
const ENGLISH_RATE = 1.0;

let cachedSpanishVoice: string | null | undefined;

/** Prefer an es-MX voice, fall back to es-ES, then any es-* voice. */
export async function resolveSpanishVoice(): Promise<string | null> {
  if (cachedSpanishVoice !== undefined) return cachedSpanishVoice;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const byLang = (prefix: string) =>
      voices.find((v) => v.language.toLowerCase().replace('_', '-').startsWith(prefix));
    const voice =
      byLang('es-mx') ?? byLang('es-es') ?? byLang('es') ?? null;
    cachedSpanishVoice = voice ? voice.identifier : null;
  } catch {
    cachedSpanishVoice = null;
  }
  return cachedSpanishVoice;
}

function speak(text: string, options: Speech.SpeechOptions): Promise<void> {
  return new Promise((resolve) => {
    Speech.speak(text, {
      ...options,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

export async function speakSpanish(text: string, slow = false): Promise<void> {
  const voice = await resolveSpanishVoice();
  await speak(text, {
    language: voice ? undefined : 'es-MX',
    voice: voice ?? undefined,
    rate: slow ? SPANISH_SLOW_RATE : SPANISH_RATE,
  });
}

export async function speakEnglish(text: string): Promise<void> {
  await speak(text, {language: 'en-US', rate: ENGLISH_RATE});
}

export function stopSpeaking(): void {
  Speech.stop();
}
