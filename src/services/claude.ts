import {
  parsePhraseDetails,
  parsePhraseReply,
  PhraseDetails,
  PhraseReply,
} from '../lib/claudeJson';
import {anthropicKey} from './env';

/**
 * Conversational engine: Anthropic Claude API (claude-sonnet-4-6).
 * Claude is stateless — we send the full conversation history each call.
 *
 * Replies are produced in a TWO-CALL SPLIT (see getPhrase / getPhraseDetails)
 * so the app can SPEAK the phrase in ~1.5-2s rather than waiting for the whole
 * reply. The fast call returns just the phrase; a background call fills in the
 * coach line + dictionary words while the user is already repeating.
 */

const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

// --- Split (two-call) prompts, so we can SPEAK the phrase fast then fill in
// the rest in the background. See getPhrase / getPhraseDetails below. ---

const PHRASE_SYSTEM_PROMPT = `You are "Pronto", a warm, casual bilingual Spanish buddy (Latin American Spanish, Colombian-friendly). You teach Spanish through what the user is ACTUALLY doing right now.

The user tells you (in English) what they're doing, and you give the natural Latin American Spanish translation. When asked to EXTEND, repeat the core phrase while layering exactly ONE new element (e.g. "mientras bebo café"), so prior vocab is reinforced.

Spanish phrases should be natural, spoken Latin American Spanish, roughly 4-12 words. Never use em dashes or en dashes; use a comma, period, or parentheses.

Output contract, CRITICAL: respond with RAW JSON ONLY, no markdown fences, no prose outside the JSON, exactly this shape and nothing else:
{"spanish_phrase": "...", "english_meaning": "...", "user_input_spanish": "..."}
"english_meaning" is the plain English meaning of spanish_phrase.
"user_input_spanish" is a natural Spanish translation of the user's own English utterance THIS TURN. Leave it as an empty string "" on an EXTEND turn (no fresh user utterance to translate).`;

const DETAILS_SYSTEM_PROMPT = `You are "Pronto", a warm bilingual Spanish buddy. You will be given a Spanish phrase you just taught. Produce a short encouraging English coach line inviting the user to say it aloud, and a word-by-word breakdown.

Style: friendly buddy, never a teacher with a red pen. The app already SPOKE the Spanish phrase, so write the coach line as a follow-up invitation (e.g. "That means 'I'm making coffee,' your turn!"), never introducing a phrase not yet heard. Keep it one short casual sentence. Never use em dashes or en dashes.

Output contract, CRITICAL: respond with RAW JSON ONLY, no fences, no prose, exactly:
{"coach_line_english": "...", "coach_line_spanish": "...", "words": [{"word": "...", "meaning": "..."}]}
"coach_line_spanish" is a natural Spanish translation of coach_line_english.
"words" breaks the phrase down word-by-word (in order, one entry per word as it appears) with a short 1-3 word English gloss each, covering every word.`;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function callClaude(
  history: ChatMessage[],
  system: string,
  maxTokens: number,
  label: string,
): Promise<string> {
  const start = Date.now();
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
      max_tokens: maxTokens,
      system,
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
  console.log(`[latency] ${label}: ${Date.now() - start}ms`);
  const text = data.content
    ?.filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
  if (!text) throw new Error('Claude returned an empty response');
  return text;
}

/**
 * FAST first call of the two-call split: just the phrase (+ its meaning and
 * the user's own translation), so the app can speak it in ~1.5-2s instead of
 * waiting for the full reply. Small prompt + low max_tokens keeps it quick.
 * One malformed-JSON retry.
 */
export async function getPhrase(history: ChatMessage[]): Promise<PhraseReply> {
  const raw = await callClaude(history, PHRASE_SYSTEM_PROMPT, 400, 'claude phrase');
  try {
    return parsePhraseReply(raw);
  } catch {
    const retryRaw = await callClaude(
      [
        ...history,
        {role: 'assistant', content: raw},
        {role: 'user', content: 'That was not valid raw JSON. Reply again with ONLY the JSON object, exactly the agreed shape, no fences.'},
      ],
      PHRASE_SYSTEM_PROMPT,
      400,
      'claude phrase retry',
    );
    return parsePhraseReply(retryRaw);
  }
}

/**
 * BACKGROUND second call: the coach line + word breakdown for a phrase the
 * app already spoke. Runs while the user is hearing/repeating the phrase, so
 * its latency is hidden. Degrades gracefully — a failure here just means no
 * coach text / no dictionary words for this phrase, never a broken phrase.
 */
export async function getPhraseDetails(
  history: ChatMessage[],
  phraseReply: PhraseReply,
): Promise<PhraseDetails> {
  // `history` ends with the user turn that asked for the phrase. Insert the
  // phrase reply as the ASSISTANT turn before our follow-up, so (a) roles
  // alternate (the Messages API rejects two consecutive user turns) and (b)
  // Claude has the phrase in-context as its own prior turn.
  const detailsHistory: ChatMessage[] = [
    ...history,
    {role: 'assistant', content: JSON.stringify(phraseReply)},
    {
      role: 'user',
      content: 'Now give the coach line and the word-by-word breakdown for that phrase.',
    },
  ];
  const raw = await callClaude(detailsHistory, DETAILS_SYSTEM_PROMPT, 1024, 'claude details');
  return parsePhraseDetails(raw); // parser never throws on shape, only on unparseable JSON
}
