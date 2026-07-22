import {isHallucinatedTranscript} from '../src/lib/whisperHallucination';

describe('isHallucinatedTranscript', () => {
  it('treats empty or whitespace as hallucinated (nothing said)', () => {
    expect(isHallucinatedTranscript('')).toBe(true);
    expect(isHallucinatedTranscript('   ')).toBe(true);
  });

  it('catches the classic English hallucinations', () => {
    expect(isHallucinatedTranscript('Thanks for watching')).toBe(true);
    expect(isHallucinatedTranscript('Thank you for watching!')).toBe(true);
    expect(isHallucinatedTranscript('Please subscribe')).toBe(true);
    expect(isHallucinatedTranscript('you')).toBe(true);
  });

  it('catches the classic Spanish hallucinations', () => {
    expect(isHallucinatedTranscript('Gracias por ver')).toBe(true);
    expect(isHallucinatedTranscript('gracias por ver el video')).toBe(true);
    expect(isHallucinatedTranscript('¡Gracias!')).toBe(true);
    expect(isHallucinatedTranscript('Suscríbete')).toBe(true);
  });

  it('is accent- and punctuation-insensitive', () => {
    expect(isHallucinatedTranscript('Gracias por ver.')).toBe(true);
    expect(isHallucinatedTranscript('gracias por su atención')).toBe(true);
  });

  it('does NOT discard real user answers', () => {
    expect(isHallucinatedTranscript('Estoy trabajando en mi laptop')).toBe(false);
    expect(isHallucinatedTranscript("I'm making coffee")).toBe(false);
    expect(isHallucinatedTranscript('Estoy bebiendo café')).toBe(false);
  });

  it('does not match on a substring within a longer real answer', () => {
    // "gracias" appears but the whole transcript is a genuine sentence.
    expect(
      isHallucinatedTranscript('Le estoy dando las gracias a mi amiga'),
    ).toBe(false);
  });

  it('catches the "siguiente video" caption-artifact family, even appended to plausible Spanish', () => {
    // This exact string was taught to Leander as if he'd said it (see logs).
    expect(isHallucinatedTranscript('¡Continúa al siguiente video!')).toBe(true);
    expect(isHallucinatedTranscript('Nos vemos en el siguiente video')).toBe(true);
    expect(isHallucinatedTranscript('See you in the next video, subscribe!')).toBe(true);
  });

  it('catches subtitle-credit artifacts anywhere in the transcript', () => {
    expect(
      isHallucinatedTranscript('Subtítulos realizados por la comunidad de Amara.org'),
    ).toBe(true);
  });

  it('does not let the fragment matcher swallow legitimate sentences', () => {
    // "video" alone is a real word; only the specific caption fragments match.
    expect(isHallucinatedTranscript('Estoy viendo un video con mi hermano')).toBe(false);
    expect(isHallucinatedTranscript('Quiero grabar un video')).toBe(false);
  });
});
