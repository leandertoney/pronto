/**
 * API keys are read from EXPO_PUBLIC_* env vars (see .env.example).
 * Client-side keys are for personal testing ONLY — see README warning.
 */

export function openAiKey(): string {
  const key = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      'Missing EXPO_PUBLIC_OPENAI_API_KEY, copy .env.example to .env and add your key.',
    );
  }
  return key;
}

export function anthropicKey(): string {
  const key = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      'Missing EXPO_PUBLIC_ANTHROPIC_API_KEY, copy .env.example to .env and add your key.',
    );
  }
  return key;
}
