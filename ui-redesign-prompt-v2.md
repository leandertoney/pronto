# GOAL: UI Overhaul v2 ("Pronto" refresh)

This is a pure presentation-layer renovation of the existing app, designed against CURRENT_STATE.md. Functionality is frozen: do NOT modify the state machine (useConversation.ts), VAD/recording logic, audioSession.ts, whisper.ts, claude.ts, tts.ts/openaiTts.ts network logic, similarity.ts, phraseStore.ts, or wordStore.ts, except for the two narrowly scoped copy changes listed in "Copy rules" below. All 70 tests must stay green.

## 1. Rename (chrome only)

- App display name becomes **Pronto**. Put the name, the wordmark styling split ("pron" + "to", second half in coral), the subtitle "AI Spanish Tutor", and the tagline "Spanish for right now." in a new `src/constants/brand.ts` so a future rename is a one-file change. Update app.json `name` (leave `slug` and `scheme` as-is to avoid breaking the installed dev setup; note this in DECISIONS.md).
- Screen titles and navigation copy go English: "Mis frases" becomes "My phrases", "Mi progreso" becomes "My progress", the conversation header "QUÉ ONDA" becomes "Right now". The accent-colored word treatment stays (phrases/progress in coral).
- Spanish remains everywhere it is CONTENT (greetings, coach lines, phrases, dictionary). Only navigation chrome changes language.

## 2. Component extraction (do this first)

Create `src/components/` and extract shared primitives currently duplicated across the four screens: `AppText` (applies theme fonts), `Card`, `PrimaryButton`, `OutlineButton`, `ScoreRing` (size + score props, band coloring from one function), `ScreenHeader` (back chevron, title, right slot), `ZocaloMark` (see §4), `ListenBars` (see §4). Refactor all four screens to use them. Keep StyleSheet.create, keep the existing colors export shape in theme.ts so nothing else breaks.

## 3. Typography

Add `expo-font` with `@expo-google-fonts/bricolage-grotesque` (700, 800) and `@expo-google-fonts/instrument-sans` (400, 500, 600, 700). Both load in Expo Go. Load in _layout.tsx with a splash hold until ready.

Update `fonts` in theme.ts:
- display: Bricolage Grotesque 800, 36px, letterSpacing -0.8 (Home greeting)
- title: Bricolage Grotesque 700, 20px (screen titles, Spanish phrase text)
- body: Instrument Sans 400, 16px
- caption: Instrument Sans 500, 13px
- button: Bricolage Grotesque 700, 16px

Rule: Spanish phrase text always renders in the title face at `spanishText` color. Bilingual subtitles stay italic caption size (turquoise under coach lines, gray under user bubbles, exactly as the current kind-mapping table in CURRENT_STATE.md §5).

## 4. The signature element: the living zócalo

The existing 3-bar Home motif (coral 56 / sunshine 34 / turquoise 18) becomes the brand system, one component, two modes:

- **`ZocaloMark`** (static): Home hero, exactly as today but sized via props.
- **`ListenBars`** (live): 5 vertical bars in the zócalo colors above the mic button. Animate with the built-in `Animated` API only (staggered loops of scaleY, 300 to 500ms, offset per bar): rippling while `phase === 'recording'`, gentle slow breathe while awaiting (auto-listen armed), frozen low while busy (transcribing/thinking/scoring), hidden when tap mode is off and idle. Respect the reduced-motion accessibility setting (freeze bars at mid height).

This replaces nothing functional; it sits above the existing mic button and makes the always-listening state visible.

## 5. Screen-by-screen changes

### Home (app/index.tsx)
- ZocaloMark, then wordmark "pronto" (Bricolage 800, "to" in coral) with a small uppercase "AI SPANISH TUTOR" caption beside or beneath it, then the greeting "¿Qué estás haciendo?" in display type with "haciendo?" in coral, then the subtitle line: "Spanish for right now." in bold followed by "Tell me what you're doing, I'll teach you to say it." in textDim.
- Stat line above the CTA when phraseCount > 0: big turquoise count + "phrases you actually use" caption.
- CTA "Start talking" (coral, radius 16, soft coral shadow). Secondary outline button becomes "My progress · N", same conditional render as today.

### Conversation (app/conversation.tsx)
- ScreenHeader: back chevron in a soft card square, centered "Right now", right slot = the auto/tap toggle restyled as a two-segment pill (turquoise fill on the active segment, keep the exact same boolean behavior).
- Transcript kinds keep their exact data mapping (CURRENT_STATE.md §5), with ONE mapping change: user bubbles lose their subtitles entirely. `user-english` bubbles render the English text only (drop the Spanish subtitle; the spanish card that follows delivers the translation, and duplicating it kills the reveal). `user-attempt` bubbles render the transcribed Spanish only (drop the English subtitle; the why box already covers what was heard). The rule: translations appear on what the app teaches, never on what the user says. Coach-line subtitles stay exactly as they are. Restyle only:
  - `spanish` bubbles: turquoise-tinted card, 1.5px turquoise border, phrase in title face, Replay and Slow as bordered white pills.
  - `score` entries: white Card, ScoreRing left, verdict text right with its Spanish subtitle. Perfect scores keep the sunshine border and spring-in animation. The why box becomes the centerpiece when present: label "What I heard, word by word", then the target words as chips (hit = turquoise tint bg with es-text color, missed = soft coral bg, danger text, wavy underline), then the italic 'I heard: "..."' line. This is a featured element now, not fine print.
- Mic zone: ListenBars above the button, label below the bars, then the existing mic button restyled (72px, coral idle, turquoise while recording, tan while busy, same state logic and pulse). Labels come from the existing MIC_LABELS record; reword per §7.
- Error banner: keep position and trigger, restyle as a soft coral-tinted card with danger text instead of bare red text.

### Choosing state (inside conversation.tsx)
- NextChips becomes a "Where to next?" white Card: label, then chips ("＋ Build on it" solid coral primary; "📍 Add where", "🕐 Add when", "😊 Add a feeling", "🔄 New topic", "📊 Progress" as bordered chips on cream). Same handlers, same discard-in-flight-recording behavior.
- NEW microcopy line at the card bottom: `or just say it: "continúa" · "nuevo tema" · "progreso"` with the Spanish words italic in es-text color. This makes the spoken commands discoverable on screen; the existing one-time spoken tip stays.

### My phrases (app/phrases.tsx)
- Title "My phrases" + turquoise count badge. Cards restyled: ScoreRing 40px, Spanish in title face, English caption, slow and remove as soft icon squares. Same tap-to-play, same highlight-while-playing, same removePhrase.
- Empty state copy: "Nothing saved yet. Everything you learn lands here." + "Start talking" CTA.

### My progress (app/profile.tsx)
- Title "My progress". Three stat tiles restyled as white Cards (turquoise phrases, sunshine words, band-colored avg; the no-data placeholder for avg becomes "--" not an em dash).
- "Needs practice" keeps worst-first sort, rows restyled with mini ScoreRing and coral play glyph.
- "Mi diccionario" section title becomes "My dictionary". WordChips restyled: white pill, Spanish bold in es-text, meaning caption, sunshine "×N" count badge. Same tap-to-speak, same single-playing rule.
- Link row copy: "Browse all phrases in My phrases →".

## 6. Iconography

Use `@expo/vector-icons` (already bundled with Expo, zero new native code) for structural chrome: back chevron, mic, play, close/remove. Emoji stays ONLY where it is expressive content: celebration lines, the chip emojis, the turtle on Slow buttons. No other emoji in chrome.

## 7. Copy rules (the only allowed touches outside the UI layer)

1. **No em dashes or en dashes anywhere**: sweep every user-facing string in all screens, MIC_LABELS, PERFECT_LINES, MOVING_ON_LINE, feedbackFor, chip labels, empty states, error strings. Rewrite with commas, periods, or the "·" separator where a divider is genuinely needed. Also add one rule line to the Claude system prompt in src/services/claude.ts: never use em dashes or en dashes in any field of the JSON reply. Change nothing else in that prompt.
2. Keep all bilingual pairs faithful translations of each other (the DECISIONS.md lesson). If a reworded line breaks its pair, fix the pair.

## 8. Explicitly untouched

- VAD constants, thresholds, and diagnostics (there are open on-device questions; do not disturb)
- Whisper language hints, the choosing-phase 'en' tradeoff, hallucination filter
- TTS voice, instructions, caching, fallback chain
- Phase enum, preRecordPhase mechanics, retry logic, scoring algorithm, tiers
- Both AsyncStorage stores and their keys (keep `@queonda/...` keys as-is so no user data is lost; note in DECISIONS.md)
- The permission-denied screen behavior (restyle its visuals to match the new system, change nothing else)

## Definition of Done

- [ ] `npx tsc --noEmit` clean, `npx jest` all 70 tests pass, `npx expo-doctor` still 18/18
- [ ] src/components/ exists and all four screens consume it; no screen defines its own button/card/ring styles anymore
- [ ] Fonts load and render on all screens; no system-font fallbacks visible
- [ ] ListenBars animates correctly across recording / awaiting / busy states and respects reduced motion
- [ ] All copy changes applied; a grep for em and en dashes across src/ and app/ user-facing strings returns nothing
- [ ] The spoken-command hint renders in the choosing card
- [ ] App boots and runs a full conversation loop in Expo Go with zero errors
- [ ] DECISIONS.md updated with every judgment call, including the slug/scheme and storage-key decisions

Ask me zero questions. Build it.
