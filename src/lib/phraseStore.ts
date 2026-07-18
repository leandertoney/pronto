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
}

export async function loadPhrases(): Promise<LearnedPhrase[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LearnedPhrase[]) : [];
  } catch {
    return [];
  }
}

/**
 * Save a phrase. If the same Spanish phrase already exists, keep the best
 * score rather than duplicating it.
 */
export async function savePhrase(phrase: LearnedPhrase): Promise<LearnedPhrase[]> {
  const existing = await loadPhrases();
  const idx = existing.findIndex((p) => p.spanish === phrase.spanish);
  let next: LearnedPhrase[];
  if (idx >= 0) {
    const merged: LearnedPhrase = {
      ...existing[idx],
      bestScore: Math.max(existing[idx].bestScore, phrase.bestScore),
    };
    next = [...existing];
    next[idx] = merged;
  } else {
    next = [...existing, phrase];
  }
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
