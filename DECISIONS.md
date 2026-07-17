# DECISIONS

Judgment calls made while building the MVP in one shot, per the brief's "ask zero questions" instruction.

## Stack & libraries

- **Expo SDK 57** (latest stable at build time) with the blank TypeScript template plus expo-router added; `main` is `expo-router/entry`.
- **`expo-audio` over `expo-av`** for recording — it's the current, supported audio API on SDK 57 (expo-av is deprecated) and works in Expo Go.
- **Raw `fetch` for both OpenAI and Anthropic** instead of their SDKs. Keeps the bundle small, avoids any Node-shim risk inside Expo Go, and the brief's contract (send full history, strip fences, defensive parse) is inherently manual anyway. The Anthropic call includes the `anthropic-dangerous-direct-browser-access` header, which is accurate: this is a client-side key for personal testing (see README warning).
- **Model `claude-sonnet-4-6`** exactly as specified in the brief (verified as a current, active Anthropic model ID).
- **Zustand** holds the whole conversation state machine (`src/store/useConversation.ts`); the screens are thin views over it.

## Design

- **Guatapé palette (revised 2026-07-17, by request).** The original build followed the brief's "dark, cinematic" direction; Leander asked for something that feels fun and colorful like Hispanic culture — he's headed to Medellín, with Guatapé nearby. The redesign takes the zócalo houses of Guatapé as the reference: warm whitewashed-cream background (`#FFF7EC`) with three saturated trim colors — zócalo coral (`#F25C3A`, CTA + mic), sunshine yellow (`#FFB627`), and turquoise (`#12A5A0`). Tasteful means the cream canvas does most of the work and the color stays in the trim: bubbles are soft tints (turquoise for Spanish, sunshine for the user), text is deep coffee brown, and only the mic/CTA is fully saturated.
- **Wave motif** is now a three-color zócalo stripe (coral, sunshine, turquoise bars) on the Home screen, with "onda" picked out in coral in the wordmark.
- **Score ring** is a color-coded circular badge with the numeric score (green ≥80, amber 50–79, red <50). A true animated progress ring would need `react-native-svg`; the simple ring satisfies "simple ring/percentage" without another dependency.

## Loop mechanics

- **Hands-free conversation (revised 2026-07-17, by request).** The original tap-to-start/tap-to-stop mic felt like a walkie-talkie, not a conversation. Now the app auto-starts listening whenever it's the user's turn and uses metering-based voice activity detection (expo-audio `isMeteringEnabled`): speech above −35 dB marks the utterance started; 1.3 s below −40 dB after speech ends it and sends to Whisper. Guards: 8 s of pure silence recycles the listener, 25 s hard cap per utterance, sub-0.5 s recordings are discarded. The mic button remains as "send now"; a header toggle switches back to tap-to-talk (`auto 🎙️` / `tap 🎙️`). Same recording routes to English-input or Spanish-repeat depending on whether a target phrase is active.
- **Scoring**: Whisper transcribes the attempt locked to `language: "es"`, then token-level Levenshtein over normalized text (lowercase, accents/punctuation stripped) mapped to 0–100. Tiers: ≥80 "¡Perfecto!", 50–79 replay + retry, <50 slow replay + retry. **Max 2 retries**, then the app moves on positively (phrase is still saved with its best score) and extends anyway — no failure dead-end, matching the "no red pen" vibe.
- **Extensions** are requested from Claude with an explicit instruction to repeat the core phrase and add exactly one element; the extension becomes the new target and the loop continues indefinitely.
- **Phrase persistence**: a phrase is saved to AsyncStorage when the user completes it (perfect score or moved-on after retries), deduplicated by Spanish text keeping the best score. This is the spaced-repetition seed; no review UI in MVP (out of scope).
- **Claude history**: assistant turns are stored as the parsed JSON (re-serialized) rather than raw model output, so a malformed-then-retried reply never pollutes the history.

## Voice

- **Natural Spanish voice via OpenAI TTS (revised 2026-07-17, by request).** The original build used `expo-speech` for everything, but the device's default Spanish voice sounds robotic — not the native Latina voice Leander wanted. Spanish phrases now go through OpenAI's `gpt-4o-mini-tts` with the `nova` voice (warm younger woman), steered toward Latin American / Colombian Spanish via the `instructions` field. ElevenLabs was considered and rejected — its free tier is a tiny one-time trial and bans commercial use, so it's not viable without paying.
- **On-device audio cache** (`src/services/openaiTts.ts`): TTS is deterministic, so each phrase's MP3 is saved to `Paths.cache/tts-cache/` under a stable DJB2-hash filename keyed by normalized text + voice. Replays hit the cached file for free; only brand-new phrases call the API. At ~$0.0006/phrase this keeps a whole trip's practice to a few cents. The 0.6× **slow replay reuses the same cached file** via `setPlaybackRate` — no second API call.
- **Graceful fallback**: if the TTS API or playback fails, `speakSpanish` falls back to the free device Spanish voice (still resolved es-MX → es-ES → es-*), so a phrase is always spoken even offline.
- **One voice everywhere (revised 2026-07-17, by request).** Leander wanted a single consistent voice; the mismatch (natural Spanish + robotic device English) sounded "creepy." English coaching lines now also go through OpenAI `nova`, steered to warm American English via a per-language `instructions` map. Same cache mechanism, keyed by text + language + voice (so the same word spoken in es vs en caches separately). Device voice remains only as the offline fallback (Spanish rate 0.85, slow 0.6).

## Whisper hallucination handling (2026-07-17)

Whisper hallucinates YouTube-caption boilerplate ("thanks for watching", "gracias por ver", "please subscribe", "you") when fed silence or near-silence. In hands-free mode this created a broken loop: a near-empty clip → Whisper invents "thanks for watching" → Claude translates to "gracias por ver" → the app coaches a phrase the user never said (with its Replay/Slow buttons, which the user heard as the app "saying Replay or slow"). Fixes:
- **`src/lib/whisperHallucination.ts`**: normalizes the whole transcript (lowercase, strip accents/punctuation) and, if it exactly matches a known hallucination phrase (or is empty), treats it as "nothing said" (returns ''). Matches the full transcript, never substrings, so a real sentence containing "gracias" survives.
- **Whisper call** now sends `temperature: 0` for deterministic decoding (less prone to hallucination) and passes the transcript through the filter.
- **VAD hardening** in the conversation screen: only transcribe when sustained speech was actually detected (`heardSpeech`) AND the clip is ≥700ms; the auto-listen start is delayed 550ms so the mic doesn't catch the tail of the app's own TTS (which would feed Whisper garbage). Together these keep silent clips out of Whisper entirely, with the phrase filter as the backstop.
- **Audio session juggling**: `allowsRecording` is enabled only while actually recording and disabled right after stopping, so TTS playback comes out of the main speaker at full volume (iOS routes audio to the quiet earpiece when a recording session is active).

## Testing

- **jest-expo** preset; AsyncStorage uses its official jest mock (wired in `jest.setup.js`).
- Unit tests cover the three brief-mandated areas: the similarity scorer (normalization, Levenshtein, score bands), Claude JSON parsing (fences, prose, malformed input, missing fields), and phrase persistence (round-trip, dedupe, corrupted storage).
- The UI screens and network services are intentionally untested — MVP tests target the pure logic, per the brief.

## Explicitly skipped (per the brief)

Accounts, onboarding beyond the mic ask, gamification, settings, backend/proxy, Android polish, offline dictionary.
