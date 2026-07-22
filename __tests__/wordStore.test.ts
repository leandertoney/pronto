import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearWords,
  DictionaryWord,
  groupWordsAlphabetically,
  loadWords,
  recordWords,
  removeWord,
} from '../src/lib/wordStore';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('wordStore', () => {
  it('returns an empty list when nothing is stored', async () => {
    expect(await loadWords()).toEqual([]);
  });

  it('records new words with timesSeen 1 and the source phrase', async () => {
    const words = await recordWords(
      [
        {word: 'Estoy', meaning: 'I am'},
        {word: 'trabajando', meaning: 'working'},
      ],
      1700000000000,
      'Estoy trabajando',
    );
    expect(words).toHaveLength(2);
    expect(words.find((w) => w.word === 'Estoy')).toEqual({
      word: 'Estoy',
      meaning: 'I am',
      timesSeen: 1,
      firstSeenAt: 1700000000000,
      sourcePhrases: ['Estoy trabajando'],
    });
  });

  it('increments timesSeen for a word seen again, keeping original spelling and meaning', async () => {
    await recordWords([{word: 'Café', meaning: 'coffee'}], 1000, 'Quiero café');
    const words = await recordWords(
      [{word: 'café', meaning: 'coffee (drink)'}],
      2000,
      'Tomo café en la mañana',
    );
    expect(words).toHaveLength(1);
    expect(words[0]).toEqual({
      word: 'Café',
      meaning: 'coffee',
      timesSeen: 2,
      firstSeenAt: 1000,
      sourcePhrases: ['Quiero café', 'Tomo café en la mañana'],
    });
  });

  it('does not duplicate the source phrase if the same phrase teaches the word again', async () => {
    await recordWords([{word: 'Café', meaning: 'coffee'}], 1000, 'Quiero café');
    const words = await recordWords([{word: 'café', meaning: 'coffee'}], 2000, 'Quiero café');
    expect(words[0].sourcePhrases).toEqual(['Quiero café']);
    expect(words[0].timesSeen).toBe(2);
  });

  it('dedupes by normalized word across accents and case', async () => {
    await recordWords([{word: 'ESTOY', meaning: 'I am'}], 1000, 'Estoy aquí');
    const words = await recordWords([{word: 'estoy', meaning: 'I am'}], 2000, 'Estoy bien');
    expect(words).toHaveLength(1);
    expect(words[0].timesSeen).toBe(2);
  });

  it('skips entries that normalize to nothing', async () => {
    const words = await recordWords([{word: '¡', meaning: 'punctuation'}], 1000, 'Hola!');
    expect(words).toEqual([]);
  });

  it('removes a word by normalized match', async () => {
    await recordWords(
      [
        {word: 'Hola', meaning: 'hello'},
        {word: 'Adiós', meaning: 'goodbye'},
      ],
      1000,
      'Hola, adiós',
    );
    const remaining = await removeWord('hola');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].word).toBe('Adiós');
  });

  it('survives corrupted storage by returning an empty list', async () => {
    await AsyncStorage.setItem('@queonda/word-dictionary', 'not-json{');
    expect(await loadWords()).toEqual([]);
  });

  it('backfills sourcePhrases for words stored before provenance existed', async () => {
    // Simulates a real on-device record from before this field was added.
    await AsyncStorage.setItem(
      '@queonda/word-dictionary',
      JSON.stringify([{word: 'café', meaning: 'coffee', timesSeen: 3, firstSeenAt: 1000}]),
    );
    const loaded = await loadWords();
    expect(loaded[0].sourcePhrases).toEqual([]);

    // The real regression: recordWords on a legacy word must not throw.
    const updated = await recordWords([{word: 'café', meaning: 'coffee'}], 2000, 'Quiero café');
    expect(updated[0].sourcePhrases).toEqual(['Quiero café']);
    expect(updated[0].timesSeen).toBe(4);
  });

  it('clears all words', async () => {
    await recordWords([{word: 'Hola', meaning: 'hello'}], 1000, 'Hola amigo');
    await clearWords();
    expect(await loadWords()).toEqual([]);
  });
});

function word(w: string, overrides: Partial<DictionaryWord> = {}): DictionaryWord {
  return {word: w, meaning: '', timesSeen: 1, firstSeenAt: 0, sourcePhrases: [], ...overrides};
}

describe('groupWordsAlphabetically', () => {
  it('returns an empty list for no words', () => {
    expect(groupWordsAlphabetically([])).toEqual([]);
  });

  it('groups words under their first letter, sorted alphabetically', () => {
    const groups = groupWordsAlphabetically([
      word('banana'),
      word('avocado'),
      word('apple'),
    ]);
    expect(groups.map((g) => g.letter)).toEqual(['A', 'B']);
    expect(groups[0].words.map((w) => w.word)).toEqual(['apple', 'avocado']);
    expect(groups[1].words.map((w) => w.word)).toEqual(['banana']);
  });

  it('groups accented words under their unaccented letter', () => {
    const groups = groupWordsAlphabetically([word('árbol'), word('amigo')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].letter).toBe('A');
    expect(groups[0].words.map((w) => w.word)).toEqual(['amigo', 'árbol']);
  });

  it('treats upper and lower case as the same letter group', () => {
    const groups = groupWordsAlphabetically([word('Estoy'), word('estar')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].letter).toBe('E');
  });

  it('preserves original spelling in the grouped output', () => {
    const groups = groupWordsAlphabetically([word('Café')]);
    expect(groups[0].words[0].word).toBe('Café');
  });
});
