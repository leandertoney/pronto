# Qué Onda 🌊

Contextual Spanish learning: the app asks what you're *actually doing right now* and teaches you to say it in Spanish, then keeps extending the phrase one element at a time so every turn reinforces what you already learned.

Built with Expo (SDK 57) + TypeScript + expo-router. Runs entirely in **stock Expo Go** — no dev builds, no native modules.

## The loop

1. App greets you: **"¿Qué onda? What are you doing right now?"** (on screen + spoken)
2. You answer in English by voice
3. The app shows and speaks the Spanish translation (Latin American Spanish voice)
4. You repeat the Spanish out loud
5. You get a pronunciation score (0–100) and friendly feedback
6. The phrase gets extended with one new element — and the loop continues

## Setup

```bash
npm install
cp .env.example .env   # then add your keys (see below)
npx expo start
```

Scan the QR code with **Expo Go** on your iPhone. That's the whole install.

### Environment variables

| Variable | Used for |
| --- | --- |
| `EXPO_PUBLIC_OPENAI_API_KEY` | Whisper speech-to-text (`whisper-1`, ~$0.006/min) |
| `EXPO_PUBLIC_ANTHROPIC_API_KEY` | Claude conversation engine (`claude-sonnet-4-6`) |

`.env` is gitignored; `.env.example` documents the shape. After editing `.env`, restart `npx expo start` so the values are picked up.

### ⚠️ Client-side API key warning

`EXPO_PUBLIC_*` variables are **bundled into the JavaScript sent to the phone**. Anyone with the bundle can extract these keys. This is acceptable for personal testing on your own device only. Before any public release, v2 must move both API calls behind a proxy backend and remove the keys from the client entirely.

## Scripts

```bash
npm test           # unit tests (similarity scorer, Claude JSON parsing, phrase persistence)
npx tsc --noEmit   # typecheck
```

## What's stored

Learned phrases (Spanish, English meaning, best score, timestamp) persist to AsyncStorage on the device — the seed data for future spaced repetition.

## Project layout

```
app/                 expo-router screens (Home, Conversation)
src/lib/             pure logic: similarity scorer, Claude JSON parsing, phrase persistence
src/services/        expo-speech TTS, expo-audio session, Whisper + Claude clients
src/store/           Zustand conversation state machine
__tests__/           jest unit tests
```

See `DECISIONS.md` for the judgment calls made during the build.
