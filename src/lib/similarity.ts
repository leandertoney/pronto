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

export interface WordHit {
  word: string; // the target word with its original accents/punctuation
  hit: boolean; // true if the attempt contained this word
}

/**
 * Per-word breakdown of an attempt: which target words were heard and which
 * were missed. Uses longest-common-subsequence alignment on normalized tokens
 * so word order matters, but display keeps the target's original spelling.
 */
export function diffWords(target: string, attempt: string): WordHit[] {
  const targetWords = target.split(/\s+/).filter(Boolean);
  const targetNorm = targetWords.map((w) => normalize(w));
  const attemptNorm = normalize(attempt).split(' ').filter(Boolean);

  const n = targetNorm.length;
  const m = attemptNorm.length;
  const dp: number[][] = Array.from({length: n + 1}, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        targetNorm[i] === attemptNorm[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const hits = new Array<boolean>(n).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (targetNorm[i] === attemptNorm[j]) {
      hits[i] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  // Words that normalize to nothing (pure punctuation) can't be "missed".
  return targetWords.map((word, k) => ({word, hit: hits[k] || targetNorm[k] === ''}));
}

export type ScoreTier = 'perfect' | 'close' | 'retry';

export function tierForScore(score: number): ScoreTier {
  if (score >= 80) return 'perfect';
  if (score >= 50) return 'close';
  return 'retry';
}
