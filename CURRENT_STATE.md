# Pronto — Current State

Exhaustive, factual snapshot of the codebase as of 2026-07-19, written as the baseline for a UI overhaul. Every claim below is drawn directly from the source files, not from memory of how the app was built. No code was changed to produce this document.

---

## 1. What the app is

A contextual Spanish-learning app. The user tells the app (by voice, in English) what they're doing right now; the app teaches them the natural Latin American Spanish way to say it, has them repeat it, scores their pronunciation, and keeps extending the phrase with one new element per turn so vocabulary compounds indefinitely. Runs entirely in stock Expo Go — no dev client, no native modules beyond what Expo Go ships with.

**Stack**: Expo SDK ~54 (package.json pins `^54.0.36`; `app.json`/README reference "SDK 57" from an earlier point — see §7 discrepancy note), expo-router (file-based navigation), TypeScript (strict mode), Zustand (state), raw `fetch` calls to Anthropic and OpenAI (no SDKs).

---

## 2. Every screen

There are exactly 4 route files under `app/`, all function components, all default exports, all using `StyleSheet.create` (no external styling library).

### 2.1 `app/_layout.tsx` — Root layout
- Wraps every screen in an Expo Router `<Stack>`.
- `headerShown: false` globally (every screen draws its own header).
- `contentStyle.backgroundColor` = `colors.background` (the cream color) globally.
- `animation: 'fade'` for screen transitions.
- Renders `<StatusBar style="dark" />` (dark status bar icons, for the light cream background).

### 2.2 `app/index.tsx` — Home
The landing screen. Single `SafeAreaView`, `justify-content: space-between` column: a hero block (top, centered) and a buttons block (bottom).

**Hero block:**
- A 3-bar "wave" motif: three horizontal pills of decreasing width (56/34/18px, 8px tall, 4px radius, 6px gap), colored accent/sunshine/turquoise respectively — a zócalo-stripe motif.
- Wordmark: `¿qué onda?` — 44px display font, `onda` colored in the accent coral, rest in `textPrimary`.
- Subtitle: "Learn the Spanish for what you're doing right now." in `textSecondary`, 24px line height.

**Buttons block:**
- Primary CTA "Start Talking" (solid coral background, 16px radius, 18px vertical padding, white text) → navigates to `/conversation`.
- Secondary button "Mi progreso · N" (turquoise 2px outline, transparent fill) → navigates to `/profile`. **Conditionally rendered**: only shows when `phraseCount > 0`. The count is loaded via `loadPhrases()` on every screen focus (`useFocusEffect`), so a brand-new user sees exactly one button.
- Both buttons dim to 85% opacity while pressed.

No header on this screen at all — it's the only screen with zero top chrome.

### 2.3 `app/conversation.tsx` — Conversation (the core screen)
By far the largest file (855 lines). Full breakdown in §4 (conversation flow) and §5 (transcript rendering). Structural summary:

- **Header row**: back chevron (‹, navigates back) — centered uppercase letter-spaced "QUÉ ONDA" title — an `auto 🎙️` / `tap 🎙️` toggle (turquoise when auto, gray when tap) that flips the `autoListen` boolean.
- **Transcript**: a `FlatList` of `TranscriptEntry` objects, auto-scrolls to end 80ms after any new entry lands.
- **Error banner**: a red caption-sized text row, shown only when the store's `error` field is non-null.
- **NextChips row**: conditionally rendered only while `choosingActive` is true (see §4.7) — five extend/new-topic chips plus one "📊 Progress" chip, wrapped and centered.
- **Mic button area**: a label line above a circular button. The button pulses (scale 1↔1.15, 600ms each way, looped) while recording; shows 🎙️ normally, ➤ while recording; background changes color for recording (turquoise) vs. busy/transcribing-thinking-scoring (light tan) vs. normal (coral); dims to 50% opacity when disabled.
- **Permission-denied state**: if mic permission is denied, the entire screen is replaced by a centered message ("We need your voice 🎙️" + explanation) and a "Back to Home" button — none of the conversation UI renders at all in this case.

### 2.4 `app/phrases.tsx` — Mis frases (phrase browser)
- Header: back chevron, "Mis frases" title (frases in coral), and a turquoise pill badge showing the total count.
- **Empty state** (when `loaded && phrases.length === 0`): centered message "Nothing saved yet" + explanation + a "Start Talking" CTA that does `router.replace('/conversation')`.
- **Populated state**: a `FlatList` of phrase cards, newest-first (sorted by `learnedAt` descending). Each card:
  - A 40px score ring (colored green/amber/red by `bestScore` band) with the numeric score.
  - Spanish text (bold, `spanishText` color) + English meaning underneath (`textSecondary`, caption size).
  - Two action buttons: 🐢 (slow replay) and ✕ (remove, calls `removePhrase`).
  - Tapping the card body itself (not the action buttons) plays the phrase at normal speed; the card visually highlights (turquoise border + tinted background) while playing or pressed.
- Loads via `loadPhrases()` once on mount (`useEffect`, not focus-based — unlike Home and Profile).

### 2.5 `app/profile.tsx` — Mi progreso (progress hub)
- Header: back chevron, "Mi progreso" title (progreso in coral), and an empty 44px-wide spacer view (keeps the title visually centered against the back button).
- **Stats row**: three equal-width tiles side by side — phrase count (turquoise), word count (sunshine), average score (color-coded green/amber/red, or gray em-dash if no phrases yet).
- **Empty state** (when `loaded && phrases.length === 0`): "Nothing to show yet" message + "Start Talking" CTA (`router.replace('/conversation')`).
- **"Needs practice" section** (only rendered if there's at least one phrase scored below 80): a `Section` component (colored dot + title) containing `PracticeRow`s — sorted worst-score-first. Each row: a 36px mini score ring, Spanish + English text, a "▶" play hint. Tapping plays the phrase (normal speed only, no slow option here).
- **"Mi diccionario" section** (only rendered if at least one word exists): a wrapped grid of `WordChip`s, each showing the Spanish word (bold), its English meaning (tiny caption), and a "×N" badge if seen more than once — sorted by `timesSeen` descending. Tapping a chip speaks the word.
- **"Browse all phrases in Mis frases →" link row**: only shown if there's at least one phrase; navigates to `/phrases`.
- Loads both `loadPhrases()` and `loadWords()` in parallel via `useFocusEffect` (re-fetches every time the screen gains focus, unlike `phrases.tsx`).
- Only one thing can play audio at a time across both the practice list and the word grid (shared `playing` state, keyed by the Spanish text being played).

---

## 3. Every non-screen component (all defined inline inside `conversation.tsx` — there is no separate `components/` directory anywhere in the project)

- **`TranscriptRow`** — a switch over `entry.kind` that renders one of: a coach block, a user bubble (english or attempt), a Spanish bubble, or a `ScoreRow`. Returns `null` for unrecognized kinds (defensive, should never trigger).
- **`ScoreRow`** — spring-animated (`Animated.spring`, friction 3.5 for perfect scores vs. 6 otherwise, tension 90) card showing the score ring, feedback text + Spanish translation, and — only when the attempt missed at least one target word AND a Whisper transcript exists — a "why" box showing the target phrase with missed words underlined in red (`whyMiss`) and hit words in green (`whyHit`), plus an italic "I heard: '...'" line quoting the raw transcript.
- **`NextChips`** — renders the 5 extend/new-topic chips (from a hardcoded `NEXT_CHIPS` array) plus a hardcoded 6th "📊 Progress" chip appended separately.
- **`MicButton`** — the pulsing circular mic button; label text comes from a `MIC_LABELS` record keyed by `Phase`, overridden by a recording-specific label when actively recording.

There is no shared design-system component library (no `Button`, `Card`, `Text` wrapper components) — every screen defines its own local `StyleSheet` and reuses raw `Pressable`/`View`/`Text` primitives from React Native directly, pulling only `colors`/`fonts` from the shared theme module.

---

## 4. The conversation flow, step by step

The entire loop is a state machine (`src/store/useConversation.ts`, Zustand), with the screen (`app/conversation.tsx`) as a thin view plus the audio-recording/VAD logic (which lives in the screen, not the store).

### 4.1 Phase enum
```
'idle' | 'greeting' | 'awaiting-english' | 'recording' | 'transcribing'
| 'thinking' | 'speaking' | 'awaiting-repeat' | 'scoring' | 'choosing'
```

### 4.2 Mount / greeting
1. Screen mounts → requests mic permission (`requestMicPermission()`, wraps `AudioModule.requestRecordingPermissionsAsync()`).
2. If denied → `micPermission` state = `'denied'` → the whole screen renders only the permission-explanation UI (§2.3).
3. If granted → `exitRecordingMode()` is called explicitly (sets `allowsRecording: false` before the very first thing is ever spoken, so playback routes to the main speaker instead of the earpiece) → then `startSession()` runs.
4. `startSession()`: loads existing phrase count (for the `learnedCount` display, not currently rendered on this screen), pushes one `coach`-kind transcript entry (English text "What are you doing right now?" with Spanish translation "¿Qué onda?" as `spanishTranslation`), sets phase to `'greeting'`, speaks Spanish first then English (`speakSpanish` then `speakEnglish`), then sets phase to `'awaiting-english'`.

### 4.3 Listening for the user's English input (`awaiting-english`)
- If `autoListen` is true (default) and mic permission is granted, listening auto-starts 250ms (`LISTEN_START_DELAY_MS`) after entering this phase (or `awaiting-repeat` or `choosing`).
- `startListening()`: enters recording audio mode, prepares + starts the recorder, resets VAD tracking refs (speech-detected flag, silence-since timestamp, calibrated noise floor), sets phase to `'recording'` — and stashes the *pre-recording* phase into a new store field `preRecordPhase` (critical: this is what lets `cancelRecording`/`wasRepeat` know what phase preceded recording, since by the time those run, the live `phase` has already become `'recording'`).
- **Voice activity detection** (adaptive, not fixed-dB — see §6.3 for the history): the first 300ms of every recording calibrates a noise floor (tracks the minimum metering value seen). After that, speech is detected when metering rises more than 12dB above the floor; silence is detected once metering drops back to within 6dB of the floor, held for 1300ms straight, at which point the recording is sent for processing. Diagnostic `console.log`/`console.warn` lines are emitted (throttled to ~400ms) showing the live metering value, floor, and whether speech has been detected — plus a warning if the 25-second hard cap (`MAX_UTTERANCE_MS`) is ever hit, which would mean silence detection failed.
- If no speech at all is detected within 8 seconds (`NO_SPEECH_TIMEOUT_MS`), the listener recycles (discards, doesn't process). Clips shorter than 500ms (`MIN_UTTERANCE_MS`) are also discarded as blips.
- Once a valid clip is captured, `finishListening(true)` routes it based on `preRecordPhase` and whether `choosingActive` (see §4.7):
  - If not in a choosing session and `preRecordPhase !== 'awaiting-repeat'` → `handleEnglishRecording(uri)`.

### 4.4 Processing English input
`handleEnglishRecording(uri)`:
1. Sets phase to `'transcribing'`.
2. Calls `transcribe(uri, 'en')` (Whisper, `language: 'en'`, `temperature: 0`, passed through the hallucination filter — see §6.1).
3. If empty (nothing intelligible heard, or filtered as a hallucination), sets an error message and returns to `'awaiting-english'`.
4. Otherwise delegates to `handleEnglishText(english)` (shared with the spoken-command fallback path — see §4.7):
   - Creates a `user-english` transcript entry with the raw text (translation attached later once Claude replies).
   - Sets phase to `'thinking'`.
   - Sends the full `claudeHistory` plus a new user message (`I'm doing this right now: "${english}". Teach me to say it in Spanish.`) to `getTutorReply()` (Claude — see §6.2 for the exact contract).
   - Records every word from the reply into the word dictionary (best-effort, non-blocking on failure — see §4.9).
   - Patches the `user-english` entry with `spanishTranslation` (from `reply.user_input_spanish`) if present.
   - Adds a new `spanish`-kind entry (the target phrase + its English meaning) and a `coach`-kind entry (the coach line + its Spanish translation).
   - Sets `currentTarget = {spanish, english}` and resets `retries` to 0.
   - Sets phase to `'speaking'`, speaks the Spanish phrase **first**, then the English coach line, then sets phase to `'awaiting-repeat'`.

### 4.5 Listening for the repeat attempt (`awaiting-repeat`)
- Same auto-listen/VAD mechanics as §4.3.
- On a valid clip, since `preRecordPhase === 'awaiting-repeat'` and `currentTarget !== null`, `finishListening` routes to `handleRepeatRecording(uri)`.

### 4.6 Scoring the repeat attempt
`handleRepeatRecording(uri)`:
1. Sets phase to `'transcribing'`.
2. Calls `transcribe(uri, 'es')`.
3. If a transcript was captured, adds a `user-attempt` entry (the raw attempt text + `englishMeaning: target.english` — the *intended* meaning, not a re-translation of what was actually said, so it stays useful even on a miss).
4. Sets phase to `'scoring'`.
5. Scores the attempt: `scoreAttempt(target.spanish, attempt)` — normalized token-level Levenshtein similarity, 0–100 (see §6.4 for the exact algorithm). `tierForScore`: ≥80 = `'perfect'`, 50–79 = `'close'`, <50 = `'retry'`.
6. `movingOn` = true if the tier is perfect OR the user has already retried twice (`retries >= 2`).
7. Feedback line selected: perfect → a random pick from 5 faithful bilingual celebration pairs (`PERFECT_LINES`); moving-on-but-imperfect → a fixed bilingual "great effort" line (`MOVING_ON_LINE`); otherwise → tier-specific bilingual feedback (`feedbackFor`).
8. `diffWords(target.spanish, attempt)` computes a per-word hit/miss array (LCS alignment on normalized tokens — order matters).
9. Adds a `score`-kind transcript entry: the feedback text + its Spanish translation, the numeric score, the raw Whisper transcript (`heard`), and the per-word hit/miss array (`targetWords`).
10. **If `movingOn`**: saves the phrase to `phraseStore` (deduped by Spanish text, keeping the best score — see §6.5), increments `learnedCount`, speaks the feedback in English then Spanish, and — the *first* time this ever happens in the app's lifetime (`hasTaughtNextCommands` flag) — speaks a one-time bilingual tip teaching the user they can now just talk instead of tapping ("Quick tip: from here you can just talk to me. Say 'continúa'... Continúa. Progreso."). Then sets phase to `'choosing'`.
11. **If tier is `'close'`**: increments `retries`, speaks the feedback, replays the target phrase at normal speed, returns to `'awaiting-repeat'`.
12. **Otherwise (`'retry'` tier)**: increments `retries`, speaks the feedback, replays the target phrase **slowly** (0.6× rate), returns to `'awaiting-repeat'`.

### 4.7 The "choosing" phase — deciding what's next
Entered once a phrase is completed (§4.6 step 10). This is the most structurally involved phase:

- **`choosingActive`** (a screen-level derived boolean, not store state) = `phase === 'choosing' || (phase === 'recording' && preRecordPhase === 'choosing')`. This exists specifically so the chip row and mic label don't disappear the instant auto-listen kicks in and flips `phase` to `'recording'` — a real bug found and fixed this session (see §7).
- While `choosingActive`, both the tap-a-chip path and the talk-instead path are live simultaneously:
  - **Chips** (`NextChips`): ➕ Build on it (`{kind:'extend'}`), 📍 Add where (`{kind:'extend', element:'a location...'}`), 🕐 Add when (time of day), 😊 Add a feeling, 🔄 New topic (`{kind:'new-topic'}`), and 📊 Progress (navigates directly, not via `chooseNext`). Tapping any chip first stops an in-flight recording (discarding the clip, `finishListening(false)`) before acting.
  - **Spoken commands** (`recognizeCommand`, `src/lib/nextCommand.ts`): if the user talks instead, the clip is transcribed once with `language: 'en'` (a deliberate latency tradeoff — see §7 for the unresolved risk this carries) and matched by **exact** normalized-text equality (never substring) against a phrase list: "continúa"/"sigue"/"continue"/"more" → extend; "dónde" → extend-with-location; "cuándo" → extend-with-time; "como me siento" → extend-with-feeling; "nuevo tema"/"new topic" → new-topic; "progreso"/"progress" → jump to profile. If nothing matches, the speech is treated as a fresh English utterance (routed through `handleEnglishText`, skipping a second Whisper call).
- **`chooseNext(choice)`**:
  - `new-topic`: clears `currentTarget`, adds a bilingual coach entry ("¡Muy bien! ¿Qué más?" / "What else are you up to?"), speaks Spanish then English, returns to `'awaiting-english'`.
  - `extend` (with or without a specific `element`): sends Claude an EXTEND instruction referencing the current target phrase and (if given) which element to add, records the reply's words into the dictionary, adds new `spanish` and `coach` entries, speaks Spanish then English, returns to `'awaiting-repeat'`.

### 4.8 Replay controls
- `replayTarget(slow)`: re-speaks the current target phrase (used by the ▶ Replay / 🐢 Slow buttons under any `spanish`-kind bubble).
- The mic button and auto-listen toggle are independent of this — replay never affects recording state.

### 4.9 Error handling
- Every async store action wraps its body in try/catch; on failure, sets a human-readable `error` string and returns the phase to a sensible recoverable state (`awaiting-english`, `awaiting-repeat`, or `choosing` depending on where the failure occurred).
- The error is cleared (`clearError`) whenever a new attempt begins; it's rendered as a single red caption line above the mic button.
- Word-dictionary recording failures are deliberately swallowed (best-effort, never surfaced as a user-facing error) — the dictionary is explicitly a "nice to have," per the code comment.

---

## 5. Transcript entry rendering (data model → visual mapping)

`TranscriptEntry` fields: `id`, `kind` (`'coach' | 'user-english' | 'spanish' | 'score' | 'user-attempt'`), `text`, `englishMeaning?`, `spanishTranslation?`, `score?`, `heard?`, `targetWords?`.

| Kind | Primary text color/style | Translation shown | Extra UI |
|---|---|---|---|
| `coach` | `textSecondary`, body font | `spanishTranslation` (italic turquoise) if present | none |
| `user-english` | `textPrimary`, right-aligned bubble (cream/tan bg) | `spanishTranslation` (italic gray) if present | none |
| `user-attempt` | same bubble style as `user-english` | `englishMeaning` (italic gray) if present — this is always `target.english`, not a literal re-translation | none |
| `spanish` | `spanishText` color, title-sized font, left-aligned bubble (turquoise-tinted bg + border) | `englishMeaning` (gray caption) if present | ▶ Replay / 🐢 Slow buttons |
| `score` | `textSecondary` caption (bold + 🎉 prefix if score ≥80) | `spanishTranslation` (italic turquoise) if present | score ring, spring-in animation, sunshine-bordered card if perfect, "why" box (missed-word breakdown + raw transcript) if the attempt missed a word |

Every one of the 5 kinds now carries a same-content reverse translation as of this session's work — this was the single most recent feature added (see §7).

---

## 6. API integrations — what's called, where, and exactly how

### 6.1 OpenAI Whisper (speech-to-text) — `src/services/whisper.ts`
- Endpoint: `POST https://api.openai.com/v1/audio/transcriptions`, model `whisper-1`.
- Called from: `handleEnglishRecording` (`language: 'en'`), `handleRepeatRecording` (`language: 'es'`), and the choosing-phase spoken-command check in `conversation.tsx` (`language: 'en'`, deliberately, for latency — one transcription pass instead of two; see §7 for the unverified risk this carries with Spanish command words).
- Sends the recorded file as multipart form data (`attempt.m4a`, `audio/m4a`), `temperature: 0` for deterministic output, `response_format: 'json'`.
- Every transcript is passed through `isHallucinatedTranscript()` (`src/lib/whisperHallucination.ts`) before being returned — if the *entire* normalized transcript exactly matches one of ~20 known Whisper hallucination phrases (English "thank you for watching" / "please subscribe" variants, Spanish "gracias por ver" / "suscríbete" variants, or empty), it's treated as if nothing was said. Substring matches don't count — only whole-transcript equality.

### 2.2 Anthropic Claude (conversation engine) — `src/services/claude.ts`
- Endpoint: `POST https://api.anthropic.com/v1/messages`, model `claude-sonnet-4-6`, `max_tokens: 2048`.
- Header `anthropic-dangerous-direct-browser-access: true` — this is a client-side API key call, documented in the README as acceptable only for personal testing (a proxy backend is explicitly called out as required before any public release).
- Called from `getTutorReply(history)`, invoked at 3 sites: `handleEnglishText` (initial teach), `chooseNext`'s extend branch, and indirectly via the retry-on-malformed-JSON path inside `getTutorReply` itself (one retry, appends the invalid raw output + a re-ask instruction to history, then re-parses).
- Full conversation history is sent every call (Claude is stateless); assistant turns are stored as the **re-serialized parsed JSON**, not the raw model output, so a malformed-then-retried reply never pollutes history.
- **System prompt** establishes: a warm, casual bilingual persona ("Pronto"), the 3-step loop (teach → score → extend), style rules (no red-pen/grading framing, short coach lines, Spanish phrase spoken before the coach line so the coach line must read as a follow-up not an introduction, 4-12 word natural Latin American Spanish phrases), and a strict JSON-only output contract:
  ```
  {"spanish_phrase": "...", "english_meaning": "...", "coach_line_english": "...",
   "coach_line_spanish": "...", "user_input_spanish": "...", "is_extension": false,
   "words": [{"word": "...", "meaning": "..."}]}
  ```
  - `words`: word-by-word breakdown of `spanish_phrase`, one entry per word in order, short English gloss each — feeds the personal dictionary.
  - `coach_line_spanish`: Spanish translation of the coach line.
  - `user_input_spanish`: Spanish translation of the user's own English utterance that turn; explicitly instructed to be `""` on an EXTEND call (no fresh user utterance to translate then).
- Parsing (`src/lib/claudeJson.ts`, `parseTutorReply`): strips markdown fences and surrounding prose, JSON-parses, and requires `spanish_phrase`/`english_meaning`/`coach_line_english` to be strings (throws otherwise). Every other field is defensively defaulted if missing/wrong-typed: `coach_line_spanish`/`user_input_spanish` → `''`, `is_extension` → `false` unless literally `true`, `words` → `[]` (with each individual word entry independently validated — malformed entries are dropped, not fatal to the whole reply).

### 6.3 OpenAI TTS (voice) — `src/services/openaiTts.ts` + `src/services/tts.ts`
- Endpoint: `POST https://api.openai.com/v1/audio/speech`, model `gpt-4o-mini-tts`, voice `nova` — used for **every** spoken line in the app, Spanish and English alike, so there's one consistent voice throughout (this was a deliberate fix after the two languages once sounded like different people — see §7).
- Per-language `instructions` field steers only the accent/language, anchored by a shared sentence ("You are the same warm, upbeat young bilingual woman throughout...") specifically so the model doesn't drift into two different-sounding characters across languages.
- **On-device caching**: TTS output is deterministic, so every line's MP3 is saved under `Paths.cache/tts-cache/` with a filename keyed by a DJB2 hash of the normalized text, plus voice name, plus language, plus a `VOICE_PROFILE_VERSION` integer (currently `2`) — bumped whenever the `instructions` wording changes, so old cached audio from a previous wording is automatically orphaned rather than served stale. Replays and the slow-mode variant (`setPlaybackRate(0.6)` on the same cached file) never re-hit the API.
- **Fallback**: if the API call or playback fails for any reason, `speakNova` falls back to the free on-device voice (`expo-speech`, resolved `es-MX → es-ES → es-*` for Spanish, `en-US` for English) — logged via `console.warn` so a silent voice-swap is now visible in the Metro terminal (this logging was added after a real incident where it happened silently — see §7).
- `stopSpeaking()` exists (wraps `Speech.stop()`) but is not currently called anywhere in the app.

### 6.4 Similarity scoring — `src/lib/similarity.ts` (pure logic, no API)
- `normalize(text)`: lowercase, NFD-decompose and strip combining accent marks, strip `¿¡`, strip all non-letter/non-digit/non-space characters (Unicode-aware), collapse whitespace.
- `levenshtein(a, b)`: standard token-array edit distance (not character-level).
- `scoreAttempt(target, attempt)`: normalize both, tokenize by whitespace, compute Levenshtein distance over tokens, similarity = `1 - distance/maxLength`, scaled to 0–100 and rounded, clamped to [0,100]. Returns 0 if either side tokenizes to nothing.
- `diffWords(target, attempt)`: longest-common-subsequence alignment between normalized target tokens and normalized attempt tokens (dynamic-programming LCS table, then backtracked), producing a hit/miss flag per target word **in the target's original spelling/accents** — order-sensitive (a shuffled attempt won't fully match even with the same words). Tokens that normalize to empty (pure punctuation) are never marked as "missed."
- `tierForScore(score)`: ≥80 `'perfect'`, ≥50 `'close'`, else `'retry'`.

### 6.5 Persistence — AsyncStorage, two independent stores, no backend/database
- **`src/lib/phraseStore.ts`** (`@queonda/learned-phrases` key): array of `{spanish, english, bestScore, learnedAt}`. `savePhrase` dedupes by exact Spanish text, keeping the higher of the two scores on a repeat. `removePhrase`, `clearPhrases` also provided. Corrupted/missing storage silently returns `[]`.
- **`src/lib/wordStore.ts`** (`@queonda/word-dictionary` key): array of `{word, meaning, timesSeen, firstSeenAt}`. `recordWords` dedupes by *normalized* word (accent/case-insensitive), incrementing `timesSeen` on a repeat while preserving the original spelling and the original meaning (not overwritten by a later gloss). `removeWord`, `clearWords` also provided, same corrupted-storage safety.
- No shared/synced backend of any kind — everything is per-device, per-install.

### 6.6 Audio session management — `src/services/audioSession.ts`
- `requestMicPermission()`: wraps `AudioModule.requestRecordingPermissionsAsync()`.
- `enterRecordingMode()` / `exitRecordingMode()`: toggle `setAudioModeAsync({allowsRecording, playsInSilentMode: true})`. Recording mode is entered only while actively recording and exited immediately after, because iOS routes audio to the quiet earpiece whenever the session allows recording — exiting it is what makes TTS come out of the main speaker at full volume. This toggle is called explicitly once at mount (before the very first-ever spoken line) in addition to its normal per-recording-cycle calls (see §7 for why that mount-time call was added and what's still unverified about volume consistency).

---

## 7. History of iteration this session (from DECISIONS.md, summarized)

DECISIONS.md is the running log of every judgment call and bug fix made across this project's life, most recently a single dense day (2026-07-19) of live-testing feedback. Summarized chronologically:

1. **Initial MVP build**: Expo SDK, `expo-audio` over deprecated `expo-av`, raw `fetch` for both APIs (no SDKs, avoids Node-shim risk in Expo Go), `claude-sonnet-4-6` model, Zustand for the whole state machine.
2. **Guatapé palette redesign**: originally dark/cinematic per the brief, changed to a warm-cream-plus-three-saturated-accents palette referencing the painted zócalo houses near Medellín/Guatapé, per Leander's request ahead of a Colombia trip.
3. **Hands-free conversational flow**: originally tap-to-start/tap-to-stop (felt like a walkie-talkie); rebuilt as always-listening with metering-based VAD.
4. **Natural voice via OpenAI TTS**: originally `expo-speech` everywhere (robotic); Spanish moved to OpenAI `nova`, then English moved to the same voice too once the mixed robotic-English/natural-Spanish combination was reported as "creepy."
5. **Whisper hallucination handling**: near-silent clips were causing Whisper to invent caption-boilerplate text ("thanks for watching"), which then got treated as real user speech; fixed with the hallucination filter, `temperature: 0`, and VAD hardening (minimum speech duration, delayed listen-start after the app's own TTS).
6. **Mis frases review screen**: the app had no way to look back at saved phrases; added a dedicated browsing screen.
7. **Live-testing feedback round**: speaking order flipped (Spanish phrase before the English coach line, to match how it's actually read on screen); added the per-word hit/miss breakdown ("why" box) so a low score explains itself; added spring-in score animation and rotating celebration lines; replaced auto-extend with the `choosing` phase and its chips, giving the user explicit control over what happens next.
8. **Conversational feel tuning**: shortened the silence-hold and listen-restart delays to reduce dead air between turns; in the same pass, discovered and fixed a regression where the newly-added `choosing` phase had accidentally disabled auto-listen entirely.
9. **Spanish/English voice mismatch**: despite both using `nova`, the two languages sounded like different people; root-caused to (a) a silent TTS-failure fallback to the robotic device voice with no logging, and (b) per-language `instructions` text describing two different personas rather than one bilingual anchor. Fixed both, plus added cache-key versioning so instruction-wording changes actually take effect instead of serving stale cached audio.
10. **Word dictionary, progress hub, spoken meta-commands**: added the per-word breakdown to Claude's contract and the `wordStore`; built the `/profile` hub; added spoken alternatives to the chip taps. **In the course of this work, adversarial review caught a real regression**: an earlier attempt at distinguishing "choosing-phase speech" from "a real repeat attempt" had made `wasRepeat` read the store's live `phase`, which by call-time was always `'recording'` — meaning **every repeat attempt was silently misrouted as a new topic instead of being scored**, for however long that code had been live. Root-fixed by adding `preRecordPhase` to the store, captured at the moment recording starts, so downstream logic reads the *correct* prior phase rather than a phase already overwritten by `setRecording()`.
11. **Adaptive VAD rewrite**: a report of ~25-30 second listens (matching the hard cap almost exactly) revealed that the original fixed dB thresholds (-35 speech / -40 silence) never matched real ambient noise, so silence was never detected at all; rewritten to calibrate a per-recording noise floor and judge speech/silence relative to that, plus added diagnostic logging.
12. **Quiet/inconsistent greeting volume**: root-caused (for the *first* spoken line only) to the recording-mode toggle never having been called before that first line; fixed by calling it explicitly at mount. **Explicitly flagged as unresolved**: whether later lines in a real conversation are also inconsistently quiet is a *different*, unconfirmed problem (most likely iOS route-change latency), not yet diagnosed or fixed.
13. **Bilingual subtitle feature** (the most recent substantive feature): every transcript kind extended to show a reverse translation underneath the primary line. Claude's JSON contract gained `coach_line_spanish` and `user_input_spanish`. In the course of this, a **first-pass bug was caught before shipping**: the score-row celebration lines were mechanically split into English/Spanish "pairs" that were not actually translations of each other (e.g. "¡Eso es!" was paired with "That was spot on." — a different phrase) — corrected to genuinely faithful pairs before committing, specifically because a false correspondence in a language-correlation feature would actively teach the wrong thing.

**Currently open/unverified items** (explicitly called out in DECISIONS.md, not yet confirmed on-device as of this writing):
- Whether later conversational lines (beyond the very first greeting) have consistent playback volume, or whether iOS route-change latency is still causing quiet-then-loud jumps within a single line.
- Whether the choosing-phase spoken-command recognition actually works reliably given the `'en'`-language Whisper hint applied to what are actually Spanish command words.
- Whether `recorderState.metering`'s real value range/scale on-device matches the dB-style assumptions the adaptive VAD margins are built on.
- A known, deliberately-left-alone cosmetic inconsistency: the greeting is *spoken* Spanish-first but *displayed* English-primary/Spanish-subtitle (matching every other `coach`-kind entry's field convention), a minor mismatch between speech order and reading order.

---

## 8. Theme / styling approach

Single source of truth: `src/theme.ts`, exporting two plain objects, no theming library, no dark mode, no design tokens beyond this file.

```ts
export const colors = {
  background: '#FFF7EC',       // warm whitewashed cream — the canvas
  surface: '#FFFFFF',
  surfaceRaised: '#F9E9D2',
  accent: '#F25C3A',           // "zócalo coral" — CTA + mic + primary actions
  turquoise: '#12A5A0',
  sunshine: '#FFB627',
  textPrimary: '#33241C',      // deep coffee brown
  textSecondary: '#8A6F5C',
  textOnAccent: '#FFFFFF',
  spanishBubble: '#E0F5F2',
  spanishBorder: '#12A5A0',
  spanishText: '#0B7C77',
  englishBubble: '#FFF2D1',
  danger: '#D93A2B',
  scoreGood: '#2BA84A',
  scoreMid: '#F5A623',
  scoreLow: '#D93A2B',
} as const;

export const fonts = {
  display: {fontSize: 34, fontWeight: '700', letterSpacing: -0.5},
  title:   {fontSize: 22, fontWeight: '600'},
  body:    {fontSize: 17, fontWeight: '400'},
  caption: {fontSize: 13, fontWeight: '500'},
};
```

**Design philosophy** (per DECISIONS.md): named the "Guatapé zócalo palette," referencing the painted houses of Guatapé near Medellín. The cream background is meant to do most of the visual work; saturated color (coral/turquoise/sunshine) is deliberately confined to trim — CTAs, the mic button, score rings, borders — not large fill areas. Bubbles use soft *tints* of the accent colors (`spanishBubble`/`englishBubble`) rather than the saturated colors themselves.

**No system font override, no custom font files loaded** — `fonts` are plain size/weight/letterSpacing combinations applied via spread (`...fonts.body`) on top of the platform default font. Every screen's `StyleSheet.create` object independently spreads these into its own local text styles (there is no shared `<Text>` wrapper component).

**Iconography**: entirely emoji (🎙️, ➤, 🐢, ✕, 📊, ➕, 📍, 🕐, 😊, 🔄, ▶, 🎉, ‹) — no icon font or SVG icon set anywhere in the project.

**Animation**: React Native's built-in `Animated` API only (no Reanimated, no Lottie). Two uses: the mic button's pulse loop while recording, and the score row's spring-in pop.

---

## 9. Every installed dependency (from `package.json`)

**Runtime dependencies:**
| Package | Version | Purpose |
|---|---|---|
| `@react-native-async-storage/async-storage` | 2.2.0 | All local persistence (phrases, words) |
| `expo` | ^54.0.36 | Framework |
| `expo-audio` | ~1.1.1 | Recording (with metering) + audio-file playback; replaces deprecated `expo-av` |
| `expo-constants` | ~18.0.13 | Expo config access (not directly imported in any file read) |
| `expo-file-system` | ~19.0.23 | TTS cache directory/file read-write (`Directory`/`File`/`Paths` from `openaiTts.ts`) |
| `expo-linking` | ~8.0.12 | Deep-link scheme support (config only — `queonda://`, not directly imported in any file read) |
| `expo-router` | ~6.0.24 | File-based navigation, all 4 screens + root layout |
| `expo-speech` | ~14.0.8 | Free on-device TTS fallback when OpenAI TTS fails |
| `expo-status-bar` | ~3.0.9 | Status bar styling in root layout |
| `react` | 19.1.0 | — |
| `react-native` | 0.81.5 | — |
| `react-native-safe-area-context` | ~5.6.0 | `SafeAreaView` on every screen |
| `react-native-screens` | ~4.16.0 | Native screen primitives (expo-router dependency, not directly imported) |
| `zustand` | ^5.0.14 | The entire conversation state machine |

**Dev dependencies:**
| Package | Version | Purpose |
|---|---|---|
| `@types/jest` | 29.5.14 | — |
| `@types/react` | ~19.1.10 | — |
| `jest` | ~29.7.0 | Test runner |
| `jest-expo` | ~54.0.17 | Expo-flavored Jest preset (`package.json`'s `jest.preset`) |
| `typescript` | ~5.9.2 | — |

**Notably absent**: no navigation library beyond expo-router itself, no animation library beyond RN's built-in `Animated`, no icon library, no charting/SVG library, no HTTP client library (raw `fetch` throughout), no form library, no state-persistence middleware for Zustand (manual AsyncStorage calls instead), no design-system/component library, no backend SDK for either OpenAI or Anthropic (raw REST calls).

**Test coverage**: 7 test files, all under `src/lib/` (pure logic only) — `claudeJson`, `nextCommand`, `openaiTts` (cache filename logic only, not the network call), `phraseStore`, `similarity`, `whisperHallucination`, `wordStore`. Per README/DECISIONS.md, this is deliberate: UI screens and the network-calling service files (`claude.ts`, `whisper.ts`, `tts.ts`, `audioSession.ts`) are intentionally untested — tests target pure logic only.

---

## 10. Configuration surface

- **`app.json`**: app name "Pronto", slug `que-onda`, scheme `queonda`, portrait-only, light-only `userInterfaceStyle`, `#FFF7EC` background color on both platforms' native splash/adaptive-icon config, iOS mic-usage description, Android `RECORD_AUDIO` permission + `predictiveBackGestureEnabled: false`, `expo-router` + `expo-audio` (with its own mic-permission-string config) + `expo-asset` (auto-added by `npx expo install`, ships a real config plugin) as config plugins.
- **`tsconfig.json`**: extends `expo/tsconfig.base`, `strict: true`. (The unused `@/*` → `./src/*` path alias has been removed — see §11.)
- **Environment**: two required env vars, `EXPO_PUBLIC_OPENAI_API_KEY` and `EXPO_PUBLIC_ANTHROPIC_API_KEY`, read via `src/services/env.ts` (throws a descriptive error if either is missing). Documented in the README as `EXPO_PUBLIC_*` variables that get bundled directly into client JS — explicitly flagged as personal-testing-only, with a proxy backend called out as required before any public release.
- **`.expo/devices.json`** exists (local Expo tooling state, not app configuration).

---

## 11. Discrepancies from §11 — resolved 2026-07-19

All four items originally flagged here have been fixed:

- **SDK version discrepancy**: `expo-doctor` was run to find the *actual* failing check, which turned out to be a missing peer dependency (`expo-audio` requires `expo-asset`, which wasn't installed) rather than the SDK-number text mismatch itself — `npx expo-doctor` doesn't check prose in README/DECISIONS.md. Installed `expo-asset` via `npx expo install expo-asset` (added as both a `package.json` dependency and an `app.json` config plugin, which is correct — `expo-asset` ships a real plugin). `expo-doctor` now reports 18/18 checks passing. Separately, corrected the stale "SDK 57" text in README.md to "SDK 54" (matching the actually-installed `expo: ^54.0.36`), and annotated the SDK 57 references in DECISIONS.md as historical (a prior commit explicitly downgraded 57→54 to match the installed Expo Go version) rather than deleting the history.
- **Unused `@/*` path alias**: removed from `tsconfig.json` entirely — no file in the project used it.
- **Unused `stopSpeaking()` export**: removed from `src/services/tts.ts`. The `expo-speech` import it partially relied on (`Speech`) is still used elsewhere in the same file (`resolveSpanishVoice`, `speakDevice`), so no dangling import resulted.
- **`expo-constants`/`expo-linking` direct-import question**: left as-is (not actually a problem) — both are legitimate transitive/config-only dependencies (Linking config via `scheme` in app.json, Constants as an Expo-internal dependency), not dead weight to remove.

`npx tsc --noEmit` and `npx jest` (70 tests, 7 suites) both pass clean after all four fixes.
