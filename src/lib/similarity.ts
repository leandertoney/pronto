/**
 * Pronunciation scoring for the MVP: compare a Whisper transcript of the
 * user's Spanish attempt against the target phrase using normalized,
 * token-level Levenshtein distance mapped to 0-100.
 */

/** Lowercase, strip accents/punctuation, collapse whitespace. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿¡]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Standard Levenshtein distance over arrays of tokens. */
export function levenshtein(a: string[], b: string[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Score an attempt against a target phrase, 0-100.
 * 100 = token-identical after normalization.
 */
export function scoreAttempt(target: string, attempt: string): number {
  const targetTokens = normalize(target).split(' ').filter(Boolean);
  const attemptTokens = normalize(attempt).split(' ').filter(Boolean);

  if (targetTokens.length === 0) return 0;
  if (attemptTokens.length === 0) return 0;

  const distance = levenshtein(targetTokens, attemptTokens);
  const maxLen = Math.max(targetTokens.length, attemptTokens.length);
  const similarity = 1 - distance / maxLen;
  return Math.round(Math.max(0, Math.min(1, similarity)) * 100);
}

export type ScoreTier = 'perfect' | 'close' | 'retry';

export function tierForScore(score: number): ScoreTier {
  if (score >= 80) return 'perfect';
  if (score >= 50) return 'close';
  return 'retry';
}
