import {createAudioPlayer} from 'expo-audio';
import * as Speech from 'expo-speech';

import {getAudioUri, TtsLang} from './openaiTts';

/**
 * Text-to-speech.
 *
 * BOTH Spanish phrases and English coaching lines use OpenAI's natural "nova"
 * voice, so the app has one consistent human-sounding voice throughout.
 * Audio is cached on-device (see openaiTts.ts), so replays and slow-mode cost
 * nothing — only brand-new lines call the API.
 *
 * If the network/API call fails, we fall back to the free device voice (in the
 * right language) so the loop never dead-ends, even offline.
 */

const SPANISH_SLOW_RATE = 0.6;
const DEVICE_SPANISH_RATE = 0.85;
const DEVICE_ENGLISH_RATE = 1.0;

let cachedDeviceVoice: string | null | undefined;

// Whatever's currently speaking (nova playback or the device-voice
// fallback) registers a stopper here so stopSpeaking() can cut it off from
// outside the speak call's own promise chain — e.g. the user tapping "I'm
// finished" mid-sentence.
let currentStopper: (() => void) | null = null;

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
    const settle = () => {
      currentStopper = null;
      resolve();
    };
    Speech.speak(text, {
      ...options,
      onDone: settle,
      onStopped: settle,
      onError: settle,
    });
    currentStopper = () => Speech.stop();
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
      currentStopper = null;
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
    currentStopper = finish;
    player.play();
  });
}

async function speakDeviceLang(
  text: string,
  lang: TtsLang,
  slow: boolean,
): Promise<void> {
  if (lang === 'es') {
    const voice = await resolveSpanishVoice();
    await speakDevice(text, {
      language: voice ? undefined : 'es-MX',
      voice: voice ?? undefined,
      rate: slow ? SPANISH_SLOW_RATE : DEVICE_SPANISH_RATE,
    });
  } else {
    await speakDevice(text, {language: 'en-US', rate: DEVICE_ENGLISH_RATE});
  }
}

/** Speak a line in the given language via the natural nova voice (cached). */
async function speakNova(text: string, lang: TtsLang, slow: boolean): Promise<void> {
  try {
    const uri = await getAudioUri(text, lang);
    await playFile(uri, slow ? SPANISH_SLOW_RATE : 1.0);
  } catch (e) {
    // Network/API/playback failure — fall back to the free device voice.
    // Logged because this fallback sounds like a different woman entirely,
    // and it would otherwise fail silently mid-conversation.
    console.warn(`[tts] nova failed for "${text}" (${lang}), falling back to device voice:`, e);
    await speakDeviceLang(text, lang, slow);
  }
}

export async function speakSpanish(text: string, slow = false): Promise<void> {
  await speakNova(text, 'es', slow);
}

export async function speakEnglish(text: string): Promise<void> {
  await speakNova(text, 'en', false);
}

/**
 * Cut off whatever's currently speaking, if anything. Used when the user
 * explicitly ends the conversation mid-line — without this, the voice keeps
 * talking after the screen has already navigated away.
 */
export function stopSpeaking(): void {
  currentStopper?.();
}
