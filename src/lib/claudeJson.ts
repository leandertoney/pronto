/**
 * Defensive parsing of Claude's JSON-only reply contract.
 * The model is instructed to return raw JSON, but we strip markdown fences
 * and surrounding prose just in case, and validate the shape.
 */

export interface TutorReply {
  spanish_phrase: string;
  english_meaning: string;
  coach_line_english: string;
  is_extension: boolean;
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
  };
}
