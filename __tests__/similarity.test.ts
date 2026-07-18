import {
  diffWords,
  levenshtein,
  normalize,
  scoreAttempt,
  tierForScore,
} from '../src/lib/similarity';

describe('diffWords', () => {
  it('marks every word hit on a perfect attempt (accents ignored)', () => {
    const diff = diffWords('Estoy tomando café', 'estoy tomando cafe');
    expect(diff).toEqual([
      {word: 'Estoy', hit: true},
      {word: 'tomando', hit: true},
      {word: 'café', hit: true},
    ]);
  });

  it('marks only the missing word as a miss', () => {
    const diff = diffWords('Estoy tomando café ahora', 'estoy tomando café');
    expect(diff.map((w) => w.hit)).toEqual([true, true, true, false]);
  });

  it('keeps the target original spelling in the output', () => {
    const diff = diffWords('¿Qué onda?', 'que onda');
    expect(diff.map((w) => w.word)).toEqual(['¿Qué', 'onda?']);
    expect(diff.every((w) => w.hit)).toBe(true);
  });

  it('respects word order — a shuffled attempt does not fully match', () => {
    const diff = diffWords('el perro grande', 'grande el perro');
    expect(diff.filter((w) => w.hit).length).toBeLessThan(3);
  });

  it('marks everything missed on an empty attempt', () => {
    const diff = diffWords('Estoy aquí', '');
    expect(diff.map((w) => w.hit)).toEqual([false, false]);
  });

  it('handles a completely different attempt', () => {
    const diff = diffWords('Estoy cocinando pasta', 'buenos días amigo');
    expect(diff.every((w) => !w.hit)).toBe(true);
  });
});

describe('normalize', () => {
  it('lowercases and strips accents', () => {
    expect(normalize('Estoy trabajando en mi LAPTOP')).toBe(
      'estoy trabajando en mi laptop',
    );
    expect(normalize('bebó café')).toBe('bebo cafe');
  });

  it('strips punctuation including inverted marks', () => {
    expect(normalize('¿Qué onda?')).toBe('que onda');
    expect(normalize('¡Perfecto!')).toBe('perfecto');
  });

  it('collapses whitespace', () => {
    expect(normalize('  hola    mundo  ')).toBe('hola mundo');
  });
});

describe('levenshtein', () => {
  it('is zero for identical token arrays', () => {
    expect(levenshtein(['a', 'b'], ['a', 'b'])).toBe(0);
  });

  it('counts substitutions, insertions, deletions', () => {
    expect(levenshtein(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(1);
    expect(levenshtein(['a', 'b'], ['a', 'b', 'c'])).toBe(1);
    expect(levenshtein(['a', 'b', 'c'], ['b', 'c'])).toBe(1);
  });

  it('handles empty arrays', () => {
    expect(levenshtein([], ['a', 'b'])).toBe(2);
    expect(levenshtein(['a'], [])).toBe(1);
    expect(levenshtein([], [])).toBe(0);
  });
});

describe('scoreAttempt', () => {
  const target = 'Estoy trabajando en mi laptop';

  it('gives 100 for an exact match', () => {
    expect(scoreAttempt(target, 'estoy trabajando en mi laptop')).toBe(100);
  });

  it('is accent- and punctuation-insensitive', () => {
    expect(scoreAttempt('¿Qué onda?', 'que onda')).toBe(100);
  });

  it('gives a high score for one wrong word', () => {
    const score = scoreAttempt(target, 'estoy trabajando en mi computadora');
    expect(score).toBe(80);
  });

  it('gives a low score for mostly wrong attempts', () => {
    const score = scoreAttempt(target, 'no tengo idea');
    expect(score).toBeLessThan(50);
  });

  it('returns 0 for empty attempts or targets', () => {
    expect(scoreAttempt(target, '')).toBe(0);
    expect(scoreAttempt('', 'hola')).toBe(0);
    expect(scoreAttempt(target, '...')).toBe(0);
  });
});

describe('tierForScore', () => {
  it('maps score bands to tiers', () => {
    expect(tierForScore(100)).toBe('perfect');
    expect(tierForScore(80)).toBe('perfect');
    expect(tierForScore(79)).toBe('close');
    expect(tierForScore(50)).toBe('close');
    expect(tierForScore(49)).toBe('retry');
    expect(tierForScore(0)).toBe('retry');
  });
});
