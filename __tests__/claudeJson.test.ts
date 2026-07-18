import {extractJsonBlock, parseTutorReply} from '../src/lib/claudeJson';

const VALID = {
  spanish_phrase: 'Estoy trabajando en mi laptop',
  english_meaning: "I'm working on my laptop",
  coach_line_english: "Nice! Here's how you say that — give it a try:",
  coach_line_spanish: '¡Bien! Así se dice — ¡inténtalo!',
  user_input_spanish: 'Estoy trabajando en mi computadora portátil',
  is_extension: false,
  words: [
    {word: 'Estoy', meaning: "I am"},
    {word: 'trabajando', meaning: 'working'},
    {word: 'en', meaning: 'on'},
    {word: 'mi', meaning: 'my'},
    {word: 'laptop', meaning: 'laptop'},
  ],
};

describe('extractJsonBlock', () => {
  it('returns raw JSON untouched', () => {
    const raw = JSON.stringify(VALID);
    expect(extractJsonBlock(raw)).toBe(raw);
  });

  it('strips ```json fences', () => {
    const raw = '```json\n' + JSON.stringify(VALID) + '\n```';
    expect(JSON.parse(extractJsonBlock(raw))).toEqual(VALID);
  });

  it('strips bare ``` fences', () => {
    const raw = '```\n' + JSON.stringify(VALID) + '\n```';
    expect(JSON.parse(extractJsonBlock(raw))).toEqual(VALID);
  });

  it('trims prose around the JSON object', () => {
    const raw = 'Sure! Here you go:\n' + JSON.stringify(VALID) + '\nHope that helps!';
    expect(JSON.parse(extractJsonBlock(raw))).toEqual(VALID);
  });
});

describe('parseTutorReply', () => {
  it('parses a valid reply', () => {
    const reply = parseTutorReply(JSON.stringify(VALID));
    expect(reply).toEqual(VALID);
  });

  it('parses a fenced reply', () => {
    const reply = parseTutorReply('```json\n' + JSON.stringify(VALID) + '\n```');
    expect(reply.spanish_phrase).toBe(VALID.spanish_phrase);
  });

  it('defaults is_extension to false when missing or non-boolean', () => {
    const {is_extension: _omit, ...withoutFlag} = VALID;
    expect(parseTutorReply(JSON.stringify(withoutFlag)).is_extension).toBe(false);
    expect(
      parseTutorReply(JSON.stringify({...VALID, is_extension: 'yes'})).is_extension,
    ).toBe(false);
    expect(
      parseTutorReply(JSON.stringify({...VALID, is_extension: true})).is_extension,
    ).toBe(true);
  });

  it('throws on malformed JSON', () => {
    expect(() => parseTutorReply('this is not json at all')).toThrow();
    expect(() => parseTutorReply('{"spanish_phrase": "hola",')).toThrow();
  });

  it('throws on JSON that is not an object', () => {
    expect(() => parseTutorReply('[1, 2, 3]')).toThrow();
    expect(() => parseTutorReply('"just a string"')).toThrow();
  });

  it('throws when required fields are missing', () => {
    expect(() =>
      parseTutorReply(JSON.stringify({spanish_phrase: 'hola'})),
    ).toThrow('missing required fields');
  });

  it('defaults coach_line_spanish and user_input_spanish to empty strings when missing or non-string', () => {
    const {coach_line_spanish: _a, user_input_spanish: _b, ...withoutTranslations} = VALID;
    const reply = parseTutorReply(JSON.stringify(withoutTranslations));
    expect(reply.coach_line_spanish).toBe('');
    expect(reply.user_input_spanish).toBe('');

    const nonString = parseTutorReply(
      JSON.stringify({...VALID, coach_line_spanish: 42, user_input_spanish: null}),
    );
    expect(nonString.coach_line_spanish).toBe('');
    expect(nonString.user_input_spanish).toBe('');
  });

  it('parses valid coach_line_spanish and user_input_spanish', () => {
    const reply = parseTutorReply(JSON.stringify(VALID));
    expect(reply.coach_line_spanish).toBe(VALID.coach_line_spanish);
    expect(reply.user_input_spanish).toBe(VALID.user_input_spanish);
  });

  it('defaults words to an empty array when missing or not an array', () => {
    const {words: _omit, ...withoutWords} = VALID;
    expect(parseTutorReply(JSON.stringify(withoutWords)).words).toEqual([]);
    expect(
      parseTutorReply(JSON.stringify({...VALID, words: 'not an array'})).words,
    ).toEqual([]);
  });

  it('parses a valid words array', () => {
    const reply = parseTutorReply(JSON.stringify(VALID));
    expect(reply.words).toEqual(VALID.words);
  });

  it('drops malformed word entries but keeps valid ones', () => {
    const reply = parseTutorReply(
      JSON.stringify({
        ...VALID,
        words: [
          {word: 'hola', meaning: 'hi'},
          {word: 'oops'}, // missing meaning
          {meaning: 'oops'}, // missing word
          {word: '  ', meaning: 'blank word'}, // blank after trim
          'not an object',
          null,
        ],
      }),
    );
    expect(reply.words).toEqual([{word: 'hola', meaning: 'hi'}]);
  });
});
