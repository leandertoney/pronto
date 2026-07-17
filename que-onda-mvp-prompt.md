# GOAL: Build "Qué Onda" — Contextual Spanish Learning App (Expo MVP)

## Context

I'm building an app called **Qué Onda** that teaches Spanish through real-life context. Unlike Duolingo/Babbel/Jumpspeak which use preset scenarios, this app asks the user what they're *actually doing right now* and teaches them to say it in Spanish. The user learns phrases they'll immediately reuse in daily life, reinforced through conversational extension (spaced repetition built into the dialogue).

**CRITICAL CONSTRAINT: I test exclusively in Expo Go on my iPhone. NO custom native modules, NO development builds, NO Xcode, NO `expo prebuild`, NO EAS builds. Every library used must work inside stock Expo Go. If a library requires a dev build, it is banned from this project.**

## The Core Loop (this is the entire product)

1. App opens → AI greets user with **"¿Qué onda? What are you doing right now?"** (spoken aloud + on screen)
2. User answers in **English** via voice (e.g., "I'm working on my laptop")
3. AI responds with the **Spanish translation** — displayed on screen AND spoken aloud in a Spanish voice (e.g., "Estoy trabajando en mi laptop — now you try it!")
4. User **repeats the Spanish phrase** via voice
5. App scores the attempt (pronunciation closeness, 0–100) and gives brief encouraging feedback
6. AI **extends the phrase** by adding ONE new element (e.g., "Now say it while drinking coffee: Estoy trabajando en mi laptop mientras bebo café") — repeating the core phrase while layering new vocab
7. Loop continues — each turn reinforces prior phrases + adds one new piece

**No grading vibe. No corrections framing. It's "here's how you say it, now you try" — a friendly bilingual buddy, not a teacher with a red pen.**

## Tech Stack (Expo Go compatible ONLY)

- **Expo SDK (latest stable) + TypeScript + expo-router**, single iPhone-first layout
- **Voice capture:** `expo-audio` (or `expo-av` if more stable on current SDK) — record the user's speech to an audio file. There is NO on-device speech recognition in Expo Go, so recording + cloud transcription is the architecture, full stop.
- **Speech-to-text:** OpenAI **Whisper API** (`whisper-1`, ~$0.006/min). Send the recorded audio file, get the transcript. Use `language: "en"` for the user's English input and `language: "es"` for their Spanish repeat attempts so transcription is locked to the right language per step.
- **Text-to-speech:** `expo-speech` — free, works in Expo Go, uses the device's built-in voices. Speak Spanish phrases with `language: "es-MX"` (fallback `"es-ES"`), English coaching lines with `"en-US"`. Slightly reduce rate (~0.85) on Spanish phrases so learners can hear them clearly. Add a "replay slowly" option at rate ~0.6.
- **Conversational engine:** Anthropic Claude API (`claude-sonnet-4-6`) — handles translation, conversation flow, phrase extension, and session context.
- **API keys:** loaded from `.env` via `process.env.EXPO_PUBLIC_*`, with `.env` gitignored and a `.env.example` committed. Add a clear README warning that client-side keys are for personal testing only and a proxy backend is the v2 path before any public release. Do NOT build a backend now.
- **Pronunciation scoring (MVP version):** Whisper-transcribe the user's Spanish attempt, then compare against the target phrase using normalized similarity (lowercase, strip accents/punctuation, token-level Levenshtein). Map to 0–100. ≥80 = "¡Perfecto!", 50–79 = "Close! Listen again and try once more" (auto-replay TTS), <50 = replay slowly and re-prompt. Max 2 retries, then move on positively.
- **State:** React state + a lightweight store (Zustand). Persist learned phrases with timestamps to `AsyncStorage` (`@react-native-async-storage/async-storage` — Expo Go compatible) as the seed for future spaced repetition.
- **No backend, no database, no auth, no Supabase, no push notifications.**

## Claude API Integration Details

- Single system prompt establishing: bilingual Spanish tutor persona, warm/casual tone, Latin American Spanish (Colombian-friendly), the exact loop above, responses in strict JSON.
- Every Claude response must return **JSON only**, no markdown fences:
```json
{
  "spanish_phrase": "Estoy trabajando en mi laptop",
  "english_meaning": "I'm working on my laptop",
  "coach_line_english": "Nice! Here's how you say that — give it a try:",
  "is_extension": false
}
```
- Send full conversation history each call (Claude is stateless).
- Parse defensively: strip any ```json fences before `JSON.parse`, wrap in try/catch with one retry on malformed output.

## Screens (2 total — that's it)

1. **Home:** App name + wave logo placeholder, single "Start Talking" button.
2. **Conversation:** Chat-style transcript (English in one bubble style, Spanish highlighted in another), a large mic button with clear states (idle / recording / transcribing / thinking / speaking), pronunciation score shown as a simple ring/percentage after each attempt, replay + replay-slow buttons on every Spanish phrase.

## Design Direction

Dark, cinematic, premium. Near-black background, one accent color (electric teal or warm coral — pick one), clean type, subtle wave motif tied to the "onda" name. No cartoon mascots, no gamification UI, no streaks, no confetti.

## Explicitly OUT of scope (do not build)

- Accounts, login, onboarding beyond the mic permission ask
- Subscriptions/paywall/in-app purchases
- Streaks, XP, levels, leaderboards
- Any library requiring a development build or native module linking
- Backend/proxy server (v2)
- Android-specific polish, tablet layouts
- Settings screen (hardcode sensible defaults)
- Offline dictionary (v2)

## Success Criteria (definition of done)

- [ ] Fresh clone: `npm install` then `npx expo start` boots with zero errors, scannable in Expo Go with only `.env` values added
- [ ] `npx tsc --noEmit` passes clean
- [ ] Unit tests pass (`npm test`) covering: similarity scorer, Claude JSON parsing (including malformed input), and phrase persistence
- [ ] Full loop implemented end-to-end: greet → record English → Whisper transcript → Claude Spanish response spoken via expo-speech → record repeat → score shown → extended phrase offered
- [ ] Spanish TTS uses a Spanish language voice, never an English voice reading Spanish text
- [ ] Mic permission denial handled gracefully with a friendly prompt
- [ ] Learned phrases persist between app restarts via AsyncStorage
- [ ] README with setup steps (env vars, run instructions) and the client-side-key warning

## Build Order

1. Expo project scaffold (TypeScript, expo-router) + mic permissions flow
2. TTS service via expo-speech (verify Spanish voice selection logic first)
3. Audio recording service (start/stop, file handling, cleanup)
4. Whisper transcription client (per-language)
5. Claude API client with JSON contract + defensive parsing + retry
6. Conversation state machine (the loop) in Zustand
7. Pronunciation similarity scorer + unit tests
8. UI (Home + Conversation screens, dark cinematic styling, mic states)
9. AsyncStorage phrase persistence
10. README + polish pass against success criteria

Build this in one shot. Ask me zero questions — make reasonable decisions and note them in a DECISIONS.md at the repo root.
