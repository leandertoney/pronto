/**
 * Defensive parsing of Claude's JSON-only reply contract.
 * The model is instructed to return raw JSON, but we strip markdown fences
 * and surrounding prose just in case, and validate the shape.
 */

export interface WordGloss {
  word: string; // Spanish word, as it appears in spanish_phrase
  meaning: string; // short English gloss (1-3 words)
}

export interface TutorReply {
  spanish_phrase: string;
  english_meaning: string;
  coach_line_english: string;
  is_extension: boolean;
  words: WordGloss[];
}

/** Strip ```json fences and any text outside the outermost JSON object. */
export function extractJsonBlock(raw: string): string {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    text = fenced[1].trim();
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }
  return text;
}

export function parseTutorReply(raw: string): TutorReply {
  const jsonText = extractJsonBlock(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Claude returned malformed JSON: ${raw.slice(0, 120)}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Claude reply is not a JSON object');
  }

  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj.spanish_phrase !== 'string' ||
    typeof obj.english_meaning !== 'string' ||
    typeof obj.coach_line_english !== 'string'
  ) {
    throw new Error('Claude reply is missing required fields');
  }

  return {
    spanish_phrase: obj.spanish_phrase,
    english_meaning: obj.english_meaning,
    coach_line_english: obj.coach_line_english,
    is_extension: obj.is_extension === true,
    words: parseWords(obj.words),
  };
}

/** Defensive parse of the per-word gloss array — any malformed entry is dropped rather than failing the whole reply. */
function parseWords(raw: unknown): WordGloss[] {
  if (!Array.isArray(raw)) return [];
  const words: WordGloss[] = [];
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as Record<string, unknown>).word === 'string' &&
      typeof (entry as Record<string, unknown>).meaning === 'string'
    ) {
      const {word, meaning} = entry as Record<string, string>;
      if (word.trim() && meaning.trim()) {
        words.push({word: word.trim(), meaning: meaning.trim()});
      }
    }
  }
  return words;
}
