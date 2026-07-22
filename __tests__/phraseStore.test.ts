import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearPhrases,
  loadPhrases,
  removePhrase,
  savePhrase,
  touchPhrase,
} from '../src/lib/phraseStore';

const PHRASE = {
  spanish: 'Estoy trabajando en mi laptop',
  english: "I'm working on my laptop",
  bestScore: 85,
  learnedAt: 1700000000000,
  lastSaidAt: 1700000000000,
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('phraseStore', () => {
  it('returns an empty list when nothing is stored', async () => {
    expect(await loadPhrases()).toEqual([]);
  });

  it('persists a phrase and loads it back', async () => {
    await savePhrase(PHRASE);
    const loaded = await loadPhrases();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(PHRASE);
  });

  it('accumulates distinct phrases across saves', async () => {
    await savePhrase(PHRASE);
    await savePhrase({...PHRASE, spanish: 'Estoy bebiendo café', bestScore: 92});
    const loaded = await loadPhrases();
    expect(loaded).toHaveLength(2);
  });

  it('deduplicates the same phrase, keeping the best score', async () => {
    await savePhrase(PHRASE);
    await savePhrase({...PHRASE, bestScore: 60});
    let loaded = await loadPhrases();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].bestScore).toBe(85);

    await savePhrase({...PHRASE, bestScore: 97});
    loaded = await loadPhrases();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].bestScore).toBe(97);
  });

  it('bumps lastSaidAt to the new save time on a re-save, even if the score is not an improvement', async () => {
    await savePhrase(PHRASE);
    const resavedAt = PHRASE.learnedAt + 1000;
    await savePhrase({...PHRASE, bestScore: 10, learnedAt: resavedAt, lastSaidAt: resavedAt});
    const loaded = await loadPhrases();
    expect(loaded[0].lastSaidAt).toBe(resavedAt);
    expect(loaded[0].bestScore).toBe(85); // unimproved score still kept
  });

  describe('touchPhrase', () => {
    it('updates lastSaidAt without touching score', async () => {
      await savePhrase(PHRASE);
      const [updated] = await touchPhrase(PHRASE.spanish, 1800000000000);
      expect(updated.lastSaidAt).toBe(1800000000000);
      expect(updated.bestScore).toBe(PHRASE.bestScore);
    });

    it('is a no-op for a phrase that does not exist', async () => {
      await savePhrase(PHRASE);
      const result = await touchPhrase('No existe', 1800000000000);
      expect(result).toEqual(await loadPhrases());
    });
  });

  it('survives corrupted storage by returning an empty list', async () => {
    await AsyncStorage.setItem('@queonda/learned-phrases', 'not-json{');
    expect(await loadPhrases()).toEqual([]);
  });

  it('backfills lastSaidAt from learnedAt for phrases stored before it existed', async () => {
    // Simulates a real on-device record from before this field was added.
    await AsyncStorage.setItem(
      '@queonda/learned-phrases',
      JSON.stringify([
        {spanish: 'Hola', english: 'hello', bestScore: 90, learnedAt: 1500},
      ]),
    );
    const loaded = await loadPhrases();
    expect(loaded[0].lastSaidAt).toBe(1500);
  });

  it('removes a single phrase by its Spanish text, leaving others intact', async () => {
    await savePhrase(PHRASE);
    await savePhrase({...PHRASE, spanish: 'Estoy bebiendo café', bestScore: 92});
    const remaining = await removePhrase(PHRASE.spanish);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].spanish).toBe('Estoy bebiendo café');
    expect(await loadPhrases()).toEqual(remaining);
  });

  it('removing a phrase that does not exist is a no-op', async () => {
    await savePhrase(PHRASE);
    const remaining = await removePhrase('No existe');
    expect(remaining).toHaveLength(1);
  });

  it('clears all phrases', async () => {
    await savePhrase(PHRASE);
    await clearPhrases();
    expect(await loadPhrases()).toEqual([]);
  });
});
