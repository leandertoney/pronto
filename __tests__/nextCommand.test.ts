import {recognizeCommand} from '../src/lib/nextCommand';

describe('recognizeCommand', () => {
  it('recognizes Spanish "continue" phrasings', () => {
    expect(recognizeCommand('continúa')).toEqual({kind: 'extend'});
    expect(recognizeCommand('Sigue')).toEqual({kind: 'extend'});
  });

  it('recognizes an element-specific extend command', () => {
    expect(recognizeCommand('dónde')).toEqual({
      kind: 'extend',
      element: 'a location — where this is happening',
    });
    expect(recognizeCommand('cuándo')).toEqual({
      kind: 'extend',
      element: 'a time of day',
    });
  });

  it('recognizes new-topic phrasings', () => {
    expect(recognizeCommand('nuevo tema')).toEqual({kind: 'new-topic'});
    expect(recognizeCommand('cambia el tema')).toEqual({kind: 'new-topic'});
  });

  it('recognizes progress phrasings', () => {
    expect(recognizeCommand('progreso')).toEqual({kind: 'progress'});
    expect(recognizeCommand('mi progreso')).toEqual({kind: 'progress'});
  });

  it('is accent- and case-insensitive', () => {
    expect(recognizeCommand('PROGRESO')).toEqual({kind: 'progress'});
    expect(recognizeCommand('progréso')).toEqual({kind: 'progress'});
  });

  it('returns null for a real sentence that merely contains a command word as a substring', () => {
    expect(recognizeCommand('estoy tomando mas café')).toBeNull();
    expect(recognizeCommand('quiero saber donde está el baño')).toBeNull();
  });

  it('returns null for an empty or unrecognized transcript', () => {
    expect(recognizeCommand('')).toBeNull();
    expect(recognizeCommand('estoy cocinando pasta')).toBeNull();
  });
});
