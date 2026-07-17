import {isHallucinatedTranscript} from '../lib/whisperHallucination';
import {openAiKey} from './env';

/**
 * Speech-to-text via OpenAI Whisper (whisper-1). Expo Go has no on-device
 * speech recognition, so we upload the recorded audio file per attempt.
 * `language` is locked per step: 'en' for the user's English input,
 * 'es' for their Spanish repeat attempts.
 *
 * Whisper hallucinates caption boilerplate ("thanks for watching",
 * "gracias por ver", …) when handed silence. Two defenses:
 *  1. `temperature: 0` makes decoding deterministic and less prone to it.
 *  2. If the transcript is *only* a known hallucination, we return '' so the
 *     conversation treats it as "nothing was said" instead of coaching it.
 */

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';

export async function transcribe(
  fileUri: string,
  language: 'en' | 'es',
): Promise<string> {
  const form = new FormData();
  // React Native FormData file part: {uri, name, type}
  form.append('file', {
    uri: fileUri,
    name: 'attempt.m4a',
    type: 'audio/m4a',
  } as unknown as Blob);
  form.append('model', 'whisper-1');
  form.append('language', language);
  form.append('response_format', 'json');
  form.append('temperature', '0');

  const res = await fetch(WHISPER_URL, {
    method: 'POST',
    headers: {Authorization: `Bearer ${openAiKey()}`},
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Whisper request failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {text?: string};
  const text = (data.text ?? '').trim();
  return isHallucinatedTranscript(text) ? '' : text;
}
