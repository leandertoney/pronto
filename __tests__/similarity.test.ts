import {
  levenshtein,
  normalize,
  scoreAttempt,
  tierForScore,
} from '../src/lib/similarity';

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
