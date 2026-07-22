import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persist learned phrases with timestamps to AsyncStorage. This is the seed
 * data for future spaced repetition — MVP just accumulates them.
 */

const STORAGE_KEY = '@queonda/learned-phrases';

export interface LearnedPhrase {
  spanish: string;
  english: string;
  bestScore: number;
  learnedAt: number;
  /** Last time this phrase was spoken by the user or replayed — backs the "getting rusty" card. */
  lastSaidAt: number;
}

export async function loadPhrases(): Promise<LearnedPhrase[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Backfill lastSaidAt for phrases stored before it existed, falling
    // back to learnedAt (the best available proxy for "last said").
    return (parsed as LearnedPhrase[]).map((p) => ({
      ...p,
      lastSaidAt: p.lastSaidAt ?? p.learnedAt,
    }));
  } catch {
    return [];
  }
}

/**
 * Save a phrase. If the same Spanish phrase already exists, keep the best
 * score rather than duplicating it. Saving always means the phrase was just
 * said (that's how a phrase gets learned or re-practiced), so lastSaidAt
 * is bumped to `phrase.learnedAt` on both the new-phrase and merge paths.
 */
export async function savePhrase(phrase: LearnedPhrase): Promise<LearnedPhrase[]> {
  const existing = await loadPhrases();
  const idx = existing.findIndex((p) => p.spanish === phrase.spanish);
  let next: LearnedPhrase[];
  if (idx >= 0) {
    const merged: LearnedPhrase = {
      ...existing[idx],
      bestScore: Math.max(existing[idx].bestScore, phrase.bestScore),
      lastSaidAt: phrase.learnedAt,
    };
    next = [...existing];
    next[idx] = merged;
  } else {
    next = [...existing, phrase];
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** Update lastSaidAt for a phrase without touching its score — used when the user replays a saved phrase (My phrases, My progress) rather than re-learning it in conversation. */
export async function touchPhrase(spanish: string, saidAtMs: number): Promise<LearnedPhrase[]> {
  const existing = await loadPhrases();
  const idx = existing.findIndex((p) => p.spanish === spanish);
  if (idx < 0) return existing;
  const next = [...existing];
  next[idx] = {...next[idx], lastSaidAt: saidAtMs};
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** Remove a single phrase by its Spanish text. */
export async function removePhrase(spanish: string): Promise<LearnedPhrase[]> {
  const existing = await loadPhrases();
  const next = existing.filter((p) => p.spanish !== spanish);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function clearPhrases(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
