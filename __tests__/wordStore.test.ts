import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearWords,
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

  it('records new words with timesSeen 1', async () => {
    const words = await recordWords(
      [
        {word: 'Estoy', meaning: 'I am'},
        {word: 'trabajando', meaning: 'working'},
      ],
      1700000000000,
    );
    expect(words).toHaveLength(2);
    expect(words.find((w) => w.word === 'Estoy')).toEqual({
      word: 'Estoy',
      meaning: 'I am',
      timesSeen: 1,
      firstSeenAt: 1700000000000,
    });
  });

  it('increments timesSeen for a word seen again, keeping original spelling and meaning', async () => {
    await recordWords([{word: 'Café', meaning: 'coffee'}], 1000);
    const words = await recordWords(
      [{word: 'café', meaning: 'coffee (drink)'}],
      2000,
    );
    expect(words).toHaveLength(1);
    expect(words[0]).toEqual({
      word: 'Café',
      meaning: 'coffee',
      timesSeen: 2,
      firstSeenAt: 1000,
    });
  });

  it('dedupes by normalized word across accents and case', async () => {
    await recordWords([{word: 'ESTOY', meaning: 'I am'}], 1000);
    const words = await recordWords([{word: 'estoy', meaning: 'I am'}], 2000);
    expect(words).toHaveLength(1);
    expect(words[0].timesSeen).toBe(2);
  });

  it('skips entries that normalize to nothing', async () => {
    const words = await recordWords([{word: '¡', meaning: 'punctuation'}], 1000);
    expect(words).toEqual([]);
  });

  it('removes a word by normalized match', async () => {
    await recordWords(
      [
        {word: 'Hola', meaning: 'hello'},
        {word: 'Adiós', meaning: 'goodbye'},
      ],
      1000,
    );
    const remaining = await removeWord('hola');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].word).toBe('Adiós');
  });

  it('survives corrupted storage by returning an empty list', async () => {
    await AsyncStorage.setItem('@queonda/word-dictionary', 'not-json{');
    expect(await loadWords()).toEqual([]);
  });

  it('clears all words', async () => {
    await recordWords([{word: 'Hola', meaning: 'hello'}], 1000);
    await clearWords();
    expect(await loadWords()).toEqual([]);
  });
});
