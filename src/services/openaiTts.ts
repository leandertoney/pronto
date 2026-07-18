import {Directory, File, Paths} from 'expo-file-system';

import {openAiKey} from './env';

/**
 * Natural-sounding TTS via OpenAI's speech API, cached on-device.
 *
 * TTS is deterministic: the same text + voice always yields the same audio,
 * so the first time a line is spoken we fetch the MP3 and save it under a
 * stable filename. Every replay (including the slow version, which just plays
 * the cached file at a lower rate) reuses the saved file and costs nothing.
 * Only brand-new lines hit the API.
 *
 * The SAME voice (nova) is used for both Spanish phrases and English coaching
 * lines so the app has one consistent voice throughout — only the spoken
 * accent differs, steered per-language via the `instructions` field.
 *
 * The cache key includes VOICE_PROFILE_VERSION, bumped whenever INSTRUCTIONS
 * changes — otherwise a wording tweak would never take effect for phrases
 * already cached under the old wording.
 */

const TTS_URL = 'https://api.openai.com/v1/audio/speech';
const MODEL = 'gpt-4o-mini-tts';
const VOICE = 'nova'; // warm younger woman — used for every spoken line
const CACHE_DIRNAME = 'tts-cache';
// Bump whenever INSTRUCTIONS changes wording — the cache key includes this,
// so old audio (recorded under the previous instructions) is automatically
// orphaned instead of being served stale forever.
const VOICE_PROFILE_VERSION = 2;

export type TtsLang = 'es' | 'en';

// Anchored as ONE bilingual woman switching languages, not two separate
// character descriptions — independent descriptions can drift far enough in
// pitch/pacing that nova stops sounding like the same person across languages.
const VOICE_ANCHOR =
  'You are the same warm, upbeat young bilingual woman throughout — same voice, same energy, same relaxed pacing, whether you are speaking English or Spanish.';
const INSTRUCTIONS: Record<TtsLang, string> = {
  es: `${VOICE_ANCHOR} Right now speak in natural Latin American Spanish (Colombian accent). Clear and unhurried.`,
  en: `${VOICE_ANCHOR} Right now speak in natural American English, like an encouraging language buddy.`,
};

/**
 * Stable, filesystem-safe cache filename for a line. Not a security hash —
 * just a deterministic key so the same text+lang+voice maps to the same file.
 */
export function cacheFileName(
  text: string,
  lang: TtsLang = 'es',
  voice: string = VOICE,
  profileVersion: number = VOICE_PROFILE_VERSION,
): string {
  const normalized = text.trim().toLowerCase();
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }
  const unsigned = hash >>> 0;
  return `${voice}-v${profileVersion}-${lang}-${unsigned.toString(36)}.mp3`;
}

function cacheDir(): Directory {
  const dir = new Directory(Paths.cache, CACHE_DIRNAME);
  if (!dir.exists) {
    dir.create({intermediates: true, idempotent: true});
  }
  return dir;
}

/**
 * Return a local file URI for the line's audio, fetching + caching it on a
 * miss. Throws if the API call fails and there is no cached copy.
 */
export async function getAudioUri(text: string, lang: TtsLang): Promise<string> {
  const file = new File(cacheDir(), cacheFileName(text, lang));

  if (file.exists) {
    return file.uri;
  }

  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiKey()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      voice: VOICE,
      input: text,
      response_format: 'mp3',
      instructions: INSTRUCTIONS[lang],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`OpenAI TTS failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  file.write(bytes);
  return file.uri;
}
