import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearPhrases,
  loadPhrases,
  savePhrase,
} from '../src/lib/phraseStore';

const PHRASE = {
  spanish: 'Estoy trabajando en mi laptop',
  english: "I'm working on my laptop",
  bestScore: 85,
  learnedAt: 1700000000000,
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

  it('survives corrupted storage by returning an empty list', async () => {
    await AsyncStorage.setItem('@queonda/learned-phrases', 'not-json{');
    expect(await loadPhrases()).toEqual([]);
  });

  it('clears all phrases', async () => {
    await savePhrase(PHRASE);
    await clearPhrases();
    expect(await loadPhrases()).toEqual([]);
  });
});
