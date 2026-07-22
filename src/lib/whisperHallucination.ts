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
  'continua al siguiente video',
  'subtitulos realizados por la comunidad de amaraorg',
];

/**
 * Caption-artifact fragments that betray a Whisper hallucination even inside a
 * longer transcript. Unlike the whole-phrase list, these match as substrings,
 * because the "...al siguiente video" family shows up appended to
 * plausible-looking Spanish. Deliberate tradeoff: a genuine sentence that
 * actually mentions "the next video" / "el siguiente video" would be dropped
 * too. That's judged worth it \u2014 the hallucination was actively teaching the
 * user phrases they never said \u2014 but it IS a known false-positive edge. Kept
 * as narrow as possible ("next video", not bare "video") to minimize it.
 */
const HALLUCINATION_FRAGMENTS = [
  'siguiente video', // "al siguiente video", "el siguiente video"
  'next video',
  'subscribe to the channel',
  'suscribanse al canal',
  'suscribete al canal',
  'subtitulos realizados por',
  'subtitles by',
  'amaraorg',
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
const HALLUCINATION_FRAGMENT_SET = HALLUCINATION_FRAGMENTS.map(normalize);

/**
 * True if the transcript is a known Whisper hallucination and should be
 * treated as if nothing was said. Matches either the WHOLE normalized
 * transcript against known caption phrases, or a narrow set of caption-artifact
 * FRAGMENTS anywhere in it (for the "...al siguiente video" family, which shows
 * up appended to otherwise plausible-looking Spanish).
 */
export function isHallucinatedTranscript(text: string): boolean {
  const normalized = normalize(text);
  if (normalized === '') return true;
  if (HALLUCINATION_SET.has(normalized)) return true;
  return HALLUCINATION_FRAGMENT_SET.some((frag) => normalized.includes(frag));
}
