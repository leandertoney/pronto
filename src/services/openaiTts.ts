import {Directory, File, Paths} from 'expo-file-system';

import {openAiKey} from './env';

/**
 * Natural-sounding Spanish TTS via OpenAI's speech API, cached on-device.
 *
 * TTS is deterministic: the same text + voice always yields the same audio,
 * so the first time a phrase is spoken we fetch the MP3 and save it under a
 * stable filename. Every replay (including the slow version, which just plays
 * the cached file at a lower rate) reuses the saved file and costs nothing.
 * Only brand-new phrases hit the API.
 */

const TTS_URL = 'https://api.openai.com/v1/audio/speech';
const MODEL = 'gpt-4o-mini-tts';
const VOICE = 'nova'; // warm younger woman
const CACHE_DIRNAME = 'tts-cache';

/**
 * Stable, filesystem-safe cache filename for a phrase. Not a security hash —
 * just a deterministic key so the same phrase maps to the same file.
 */
export function cacheFileName(text: string, voice: string = VOICE): string {
  const normalized = text.trim().toLowerCase();
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }
  const unsigned = hash >>> 0;
  return `${voice}-${unsigned.toString(36)}.mp3`;
}

function cacheDir(): Directory {
  const dir = new Directory(Paths.cache, CACHE_DIRNAME);
  if (!dir.exists) {
    dir.create({intermediates: true, idempotent: true});
  }
  return dir;
}

/**
 * Return a local file URI for the phrase's audio, fetching + caching it on a
 * miss. Throws if the API call fails and there is no cached copy.
 */
export async function getSpanishAudioUri(text: string): Promise<string> {
  const file = new File(cacheDir(), cacheFileName(text));

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
      // Latin American Spanish steering; gpt-4o-mini-tts honors instructions
      // on accent and tone.
      instructions:
        'Speak in warm, natural Latin American Spanish, like a friendly Colombian woman. Clear and unhurried.',
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
