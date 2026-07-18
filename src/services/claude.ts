import {parseTutorReply, TutorReply} from '../lib/claudeJson';
import {anthropicKey} from './env';

/**
 * Conversational engine: Anthropic Claude API (claude-sonnet-4-6).
 * Claude is stateless — we send the full conversation history each call.
 * The system prompt enforces a strict JSON-only reply contract; parsing is
 * defensive with one retry on malformed output.
 */

const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are "Qué Onda", a warm, casual bilingual Spanish buddy (Latin American Spanish, Colombian-friendly). You teach Spanish through what the user is ACTUALLY doing right now.

The loop:
1. The user tells you (in English) what they're doing right now.
2. You give the natural Latin American Spanish translation for it, with a short encouraging English coach line inviting them to say it aloud.
3. After they repeat it, the app scores their pronunciation and tells you the result. When asked to EXTEND, you repeat the core phrase while layering exactly ONE new element (e.g. "mientras bebo café"), so prior vocab is reinforced.

Style rules:
- Friendly bilingual buddy, never a teacher with a red pen. No grading vibe, no corrections framing. It's always "here's how you say it, now you try!"
- Keep coach lines short (one sentence, encouraging, casual).
- The app speaks the Spanish phrase aloud FIRST, then your coach line right after it. So write the coach line as a follow-up invitation (e.g. "That means 'I'm making coffee,' your turn!"), never as an introduction to a phrase not yet heard.
- Spanish phrases should be natural, spoken Latin American Spanish, roughly 4-12 words. Extensions add ONE new element to the previous phrase.
- Never use em dashes or en dashes in any response. Use a comma, period, or parentheses instead.

Output contract, CRITICAL:
Respond with RAW JSON ONLY. No markdown fences, no prose outside the JSON. Exactly this shape:
{"spanish_phrase": "...", "english_meaning": "...", "coach_line_english": "...", "coach_line_spanish": "...", "user_input_spanish": "...", "is_extension": false, "words": [{"word": "...", "meaning": "..."}]}
Set "is_extension" to true only when the phrase extends a previous one.
"words" breaks spanish_phrase down word-by-word (in order, one entry per word as it appears in the phrase) with a short 1-3 word English gloss for each. This feeds the user's personal dictionary, so it must cover every word in spanish_phrase.
"coach_line_spanish" is a natural Spanish translation of coach_line_english. The app shows both languages under every line so the user can read along in either direction.
"user_input_spanish" is a natural Spanish translation of the user's own English utterance THIS TURN (what they just told you they're doing). Leave it as an empty string "" on an EXTEND turn, since there's no fresh user utterance to translate then.`;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function callClaude(history: ChatMessage[]): Promise<string> {
  const res = await fetch(CLAUDE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicKey(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: history,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Claude request failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{type: string; text?: string}>;
  };
  const text = data.content
    ?.filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
  if (!text) throw new Error('Claude returned an empty response');
  return text;
}

/** Call Claude and parse the JSON contract, retrying once on malformed output. */
export async function getTutorReply(history: ChatMessage[]): Promise<TutorReply> {
  const raw = await callClaude(history);
  try {
    return parseTutorReply(raw);
  } catch {
    const retryHistory: ChatMessage[] = [
      ...history,
      {role: 'assistant', content: raw},
      {
        role: 'user',
        content:
          'That was not valid raw JSON. Reply again with ONLY the JSON object, exactly the agreed shape, no fences.',
      },
    ];
    const retryRaw = await callClaude(retryHistory);
    return parseTutorReply(retryRaw);
  }
}
