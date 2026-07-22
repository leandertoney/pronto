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
  /** Every distinct Spanish phrase this word has appeared in, oldest first — backs the dictionary's "from '...'" provenance line. */
  sourcePhrases: string[];
}

export async function loadWords(): Promise<DictionaryWord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Backfill sourcePhrases for words stored before provenance existed —
    // without this, recordWords' `.includes()` on a legacy word throws.
    return (parsed as DictionaryWord[]).map((w) => ({
      ...w,
      sourcePhrases: w.sourcePhrases ?? [],
    }));
  } catch {
    return [];
  }
}

/**
 * Add or reinforce words from a freshly-learned phrase. An existing entry
 * (matched by normalized word) has its timesSeen incremented and keeps its
 * original spelling + meaning rather than being overwritten — Claude's gloss
 * for a word should be stable across phrases, and the first version is as
 * good as any later one. `sourcePhrase` is recorded too (deduped, so
 * repeating the exact same phrase doesn't pad the provenance list).
 */
export async function recordWords(
  entries: Array<{word: string; meaning: string}>,
  seenAt: number,
  sourcePhrase: string,
): Promise<DictionaryWord[]> {
  const existing = await loadWords();
  const byKey = new Map(existing.map((w) => [normalize(w.word), w]));

  for (const entry of entries) {
    const key = normalize(entry.word);
    if (!key) continue; // pure punctuation token
    const current = byKey.get(key);
    if (current) {
      const sourcePhrases = current.sourcePhrases.includes(sourcePhrase)
        ? current.sourcePhrases
        : [...current.sourcePhrases, sourcePhrase];
      byKey.set(key, {...current, timesSeen: current.timesSeen + 1, sourcePhrases});
    } else {
      byKey.set(key, {
        word: entry.word,
        meaning: entry.meaning,
        timesSeen: 1,
        firstSeenAt: seenAt,
        sourcePhrases: [sourcePhrase],
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

export interface WordGroup {
  letter: string;
  words: DictionaryWord[];
}

/**
 * Group words alphabetically by their (accent-insensitive) first letter, so
 * a growing dictionary reads as a scannable A-Z list instead of an
 * unordered wall of chips.
 */
export function groupWordsAlphabetically(words: DictionaryWord[]): WordGroup[] {
  const sorted = [...words].sort((a, b) => normalize(a.word).localeCompare(normalize(b.word)));
  const groups: WordGroup[] = [];
  for (const word of sorted) {
    const letter = (normalize(word.word)[0] ?? '#').toUpperCase();
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.letter === letter) {
      lastGroup.words.push(word);
    } else {
      groups.push({letter, words: [word]});
    }
  }
  return groups;
}
