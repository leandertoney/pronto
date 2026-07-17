/**
 * Whisper hallucinates common training-data phrases when it's fed silence or
 * near-silence — most infamously "thank you for watching" and its
 * translations, plus "like and subscribe" style caption boilerplate. These
 * are never things the user actually said into a Spanish-learning app, so we
 * treat a transcript that is *only* one of these as empty.
 *
 * We match on the normalized whole transcript, not substrings, so a legitimate
 * long answer that happens to contain a word isn't discarded.
 */

const HALLUCINATION_PHRASES = [
  // English
  'thank you',
  'thanks',
  'thank you for watching',
  'thanks for watching',
  'thank you for watching this video',
  'please subscribe',
  'like and subscribe',
  'subscribe to my channel',
  'see you next time',
  'see you in the next video',
  'bye',
  'you',
  // Spanish
  'gracias',
  'gracias por ver',
  'gracias por ver el video',
  'gracias por ver este video',
  'gracias por su atencion',
  'suscribete',
  'suscribete al canal',
  'nos vemos',
  'hasta luego',
  'subtitulos realizados por la comunidad de amaraorg',
];

/** Lowercase, strip accents and punctuation, collapse whitespace. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const HALLUCINATION_SET = new Set(HALLUCINATION_PHRASES.map(normalize));

/**
 * True if the transcript is (only) a known Whisper hallucination and should be
 * treated as if nothing was said.
 */
export function isHallucinatedTranscript(text: string): boolean {
  const normalized = normalize(text);
  if (normalized === '') return true;
  return HALLUCINATION_SET.has(normalized);
}
