import {cacheFileName} from '../src/services/openaiTts';

describe('cacheFileName', () => {
  it('is deterministic for the same phrase', () => {
    expect(cacheFileName('Estoy trabajando en mi laptop')).toBe(
      cacheFileName('Estoy trabajando en mi laptop'),
    );
  });

  it('ignores surrounding whitespace and case', () => {
    expect(cacheFileName('  Estoy Trabajando  ')).toBe(
      cacheFileName('estoy trabajando'),
    );
  });

  it('produces different names for different phrases', () => {
    expect(cacheFileName('Estoy trabajando')).not.toBe(
      cacheFileName('Estoy bebiendo café'),
    );
  });

  it('encodes the voice in the filename and ends in .mp3', () => {
    const name = cacheFileName('hola', 'nova');
    expect(name.startsWith('nova-')).toBe(true);
    expect(name.endsWith('.mp3')).toBe(true);
  });

  it('varies by voice', () => {
    expect(cacheFileName('hola', 'nova')).not.toBe(cacheFileName('hola', 'shimmer'));
  });

  it('produces a filesystem-safe name (no spaces or slashes)', () => {
    const name = cacheFileName('¿Qué onda, cómo estás?');
    expect(name).toMatch(/^[a-z0-9-]+\.mp3$/);
  });
});
