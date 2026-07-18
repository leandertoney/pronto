import AsyncStorage from '@react-native-async-storage/async-storage';

import {normalize} from './similarity';

/**
 * Personal dictionary: every individual Spanish word the user has been
 * taught, with its English gloss. Distinct from phraseStore (which tracks
 * whole learned phrases with pronunciation scores) — this is a vocabulary
 * lookup, deduped by normalized word so accents/case don't fork an entry.
 */

const STORAGE_KEY = '@queonda/word-dictionary';

export interface DictionaryWord {
  word: string; // original spelling/accents, as first seen
  meaning: string;
  timesSeen: number;
  firstSeenAt: number;
}

export async function loadWords(): Promise<DictionaryWord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DictionaryWord[]) : [];
  } catch {
    return [];
  }
}

/**
 * Add or reinforce words from a freshly-learned phrase. An existing entry
 * (matched by normalized word) has its timesSeen incremented and keeps its
 * original spelling + meaning rather than being overwritten — Claude's gloss
 * for a word should be stable across phrases, and the first version is as
 * good as any later one.
 */
export async function recordWords(
  entries: Array<{word: string; meaning: string}>,
  seenAt: number,
): Promise<DictionaryWord[]> {
  const existing = await loadWords();
  const byKey = new Map(existing.map((w) => [normalize(w.word), w]));

  for (const entry of entries) {
    const key = normalize(entry.word);
    if (!key) continue; // pure punctuation token
    const current = byKey.get(key);
    if (current) {
      byKey.set(key, {...current, timesSeen: current.timesSeen + 1});
    } else {
      byKey.set(key, {
        word: entry.word,
        meaning: entry.meaning,
        timesSeen: 1,
        firstSeenAt: seenAt,
      });
    }
  }

  const next = Array.from(byKey.values());
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function removeWord(word: string): Promise<DictionaryWord[]> {
  const existing = await loadWords();
  const key = normalize(word);
  const next = existing.filter((w) => normalize(w.word) !== key);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function clearWords(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
