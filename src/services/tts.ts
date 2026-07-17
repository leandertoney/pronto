import {createAudioPlayer} from 'expo-audio';
import * as Speech from 'expo-speech';

import {getSpanishAudioUri} from './openaiTts';

/**
 * Text-to-speech.
 *
 * Spanish phrases use OpenAI's natural "nova" voice (a real human-sounding
 * Latina voice), cached on-device so replays and slow-mode cost nothing —
 * see openaiTts.ts. If the network/API call fails, we fall back to the free
 * device Spanish voice so the loop never dead-ends.
 *
 * English coaching lines stay on the free device voice: they vary constantly
 * and aren't worth an API call or cache.
 */

const SPANISH_SLOW_RATE = 0.6;
const ENGLISH_RATE = 1.0;
const DEVICE_SPANISH_RATE = 0.85;

let cachedDeviceVoice: string | null | undefined;

/** Prefer an es-MX device voice, fall back to es-ES, then any es-* voice. */
export async function resolveSpanishVoice(): Promise<string | null> {
  if (cachedDeviceVoice !== undefined) return cachedDeviceVoice;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const byLang = (prefix: string) =>
      voices.find((v) => v.language.toLowerCase().replace('_', '-').startsWith(prefix));
    const voice = byLang('es-mx') ?? byLang('es-es') ?? byLang('es') ?? null;
    cachedDeviceVoice = voice ? voice.identifier : null;
  } catch {
    cachedDeviceVoice = null;
  }
  return cachedDeviceVoice;
}

function speakDevice(text: string, options: Speech.SpeechOptions): Promise<void> {
  return new Promise((resolve) => {
    Speech.speak(text, {
      ...options,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

/** Play a local audio file to completion at the given rate. */
function playFile(uri: string, rate: number): Promise<void> {
  return new Promise((resolve) => {
    const player = createAudioPlayer(uri);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        player.remove();
      } catch {
        // player already released
      }
      resolve();
    };
    try {
      player.setPlaybackRate(rate);
    } catch {
      // rate control unsupported — play at normal speed
    }
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        sub?.remove?.();
        finish();
      }
    });
    player.play();
  });
}

async function speakDeviceSpanish(text: string, slow: boolean): Promise<void> {
  const voice = await resolveSpanishVoice();
  await speakDevice(text, {
    language: voice ? undefined : 'es-MX',
    voice: voice ?? undefined,
    rate: slow ? SPANISH_SLOW_RATE : DEVICE_SPANISH_RATE,
  });
}

export async function speakSpanish(text: string, slow = false): Promise<void> {
  try {
    const uri = await getSpanishAudioUri(text);
    await playFile(uri, slow ? SPANISH_SLOW_RATE : 1.0);
  } catch {
    // Network/API/playback failure — fall back to the free device voice so a
    // phrase is always spoken.
    await speakDeviceSpanish(text, slow);
  }
}

export async function speakEnglish(text: string): Promise<void> {
  await speakDevice(text, {language: 'en-US', rate: ENGLISH_RATE});
}

export function stopSpeaking(): void {
  Speech.stop();
}
