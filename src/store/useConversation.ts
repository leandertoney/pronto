import {create} from 'zustand';

import {ChatMessage, getPhrase, getPhraseDetails} from '../services/claude';
import {speakEnglish, speakSpanish} from '../services/tts';
import {transcribe} from '../services/whisper';
import {savePhrase, loadPhrases} from '../lib/phraseStore';
import {diffWords, scoreAttempt, tierForScore, WordHit} from '../lib/similarity';
import {recordWords} from '../lib/wordStore';
import {PhraseReply} from '../lib/claudeJson';

/**
 * The core loop as a state machine:
 * greet -> record English -> Whisper -> Claude Spanish -> TTS ->
 * record repeat -> score -> (retry | choose: extend / new topic) -> ...
 */

export type Phase =
  | 'idle'
  | 'greeting'
  | 'awaiting-english' // waiting for user to tap mic and say what they're doing
  | 'recording'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'awaiting-repeat' // waiting for user to repeat the Spanish phrase
  | 'scoring'
  | 'choosing'; // phrase learned — user picks: build on it or new topic

/** What the user tapped after completing a phrase. */
export type NextChoice =
  | {kind: 'extend'; element?: string}
  | {kind: 'new-topic'};

export interface TranscriptEntry {
  id: string;
  kind: 'coach' | 'user-english' | 'spanish' | 'score' | 'user-attempt';
  text: string;
  englishMeaning?: string; // English translation, shown under a Spanish line
  spanishTranslation?: string; // Spanish translation, shown under an English line
  score?: number;
  heard?: string; // what Whisper transcribed from the attempt
  targetWords?: WordHit[]; // per-word hit/miss vs the target phrase
}

interface ConversationState {
  phase: Phase;
  transcript: TranscriptEntry[];
  claudeHistory: ChatMessage[];
  currentTarget: {spanish: string; english: string} | null;
  retries: number;
  learnedCount: number;
  error: string | null;
  preRecordPhase: Phase | null;

  startSession: () => Promise<void>;
  setRecording: () => void;
  cancelRecording: () => void;
  handleEnglishRecording: (uri: string) => Promise<void>;
  handleEnglishText: (english: string) => Promise<void>;
  handleRepeatRecording: (uri: string) => Promise<void>;
  chooseNext: (choice: NextChoice) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

let entryId = 0;
const nextId = () => `entry-${++entryId}`;

// A warm paisa opener ("what's up") plus the actual prompt ("what are you
// doing"). Teaching two useful things at the start, and the ES/EN pair now
// matches line-for-line (the old single "¿Qué más, pues?" didn't translate to
// "What are you doing right now?"). "¿Qué estás haciendo?" also echoes the
// Home screen prompt, so it's a phrase the app leans on.
const GREETING_ES = '¿Qué más, pues? ¿Qué estás haciendo?';
const GREETING_EN = "What's up? What are you doing right now?";
const NEW_TOPIC_ES = '¡Muy bien! ¿Qué más?';
const NEW_TOPIC_EN = "What else are you up to?";
// Short "your turn" nudge spoken right after a freshly-taught Spanish phrase,
// so the moment doesn't fall into silence. Deliberately in ENGLISH, not
// Spanish: a Spanish cue ("Te toca") back-to-back with the target phrase is
// confusable — a learner might repeat the CUE instead of the phrase. English
// is self-evidently not the thing to repeat. And kept to two words, not the
// full coach paragraph that was cut earlier for friction.
const YOUR_TURN_EN = 'Now you try';

interface Bilingual {
  en: string;
  es: string;
}

/**
 * Varied celebration lines so a perfect score never sounds canned. Each pair
 * is a FAITHFUL translation of the other (not just two independently upbeat
 * phrases) — this is the line the user reads to correlate Spanish/English,
 * so a mismatch here would silently teach the wrong meaning.
 */
const PERFECT_LINES: Bilingual[] = [
  {es: '¡Perfecto!', en: 'Perfect!'},
  {es: '¡Eso es!', en: "That's it!"},
  {es: '¡Qué bien!', en: 'Nicely done!'},
  {es: '¡Increíble!', en: 'Incredible!'},
  {es: '¡Así se hace!', en: "That's how it's done!"},
];

function pickPerfectLine(): Bilingual {
  return PERFECT_LINES[Math.floor(Math.random() * PERFECT_LINES.length)];
}

const MOVING_ON_LINE: Bilingual = {
  en: "Great effort, you'll get more reps at this. Let's keep going!",
  es: '¡Buen esfuerzo! Vas a practicar esto más. ¡Sigamos!',
};

/**
 * Fire-and-forget background half of the two-call split: fetch the coach
 * line + word breakdown for a phrase the app has ALREADY spoken, and feed the
 * words into the personal dictionary. Runs while the user hears/repeats the
 * phrase, so its latency is hidden. Fully best-effort and touches ONLY the
 * word store — never claudeHistory, currentTarget, phase, or error — so it's
 * safe for it to resolve even after the user has moved on or left. A failure
 * just means no dictionary words for this phrase, never a broken loop.
 */
function fetchDetailsAndRecordWords(history: ChatMessage[], reply: PhraseReply): void {
  getPhraseDetails(history, reply)
    .then((details) => {
      if (details.words.length === 0) return;
      return recordWords(details.words, Date.now(), reply.spanish_phrase);
    })
    .catch(() => {
      // Dictionary is a nice-to-have; the phrase was already taught fine.
    });
}

export const useConversation = create<ConversationState>((set, get) => ({
  phase: 'idle',
  transcript: [],
  claudeHistory: [],
  currentTarget: null,
  retries: 0,
  learnedCount: 0,
  error: null,
  preRecordPhase: null,

  startSession: async () => {
    const existing = await loadPhrases();
    set({
      phase: 'greeting',
      transcript: [
        {
          id: nextId(),
          kind: 'coach',
          text: GREETING_EN,
          spanishTranslation: GREETING_ES,
        },
      ],
      claudeHistory: [],
      currentTarget: null,
      retries: 0,
      learnedCount: existing.length,
      error: null,
    });
    await speakSpanish(GREETING_ES);
    await speakEnglish(GREETING_EN);
    set({phase: 'awaiting-english'});
  },

  // Stash the phase we were in before recording started — cancelRecording
  // needs it to know where to return, since by the time it runs the store's
  // `phase` has already been overwritten to 'recording' and can no longer
  // tell "choosing" apart from "awaiting-repeat"/"awaiting-english".
  setRecording: () =>
    set((s) => ({phase: 'recording', preRecordPhase: s.phase, error: null})),

  cancelRecording: () => {
    const {preRecordPhase, currentTarget} = get();
    const returnTo =
      preRecordPhase ?? (currentTarget ? 'awaiting-repeat' : 'awaiting-english');
    set({phase: returnTo, preRecordPhase: null});
  },

  handleEnglishRecording: async (uri: string) => {
    try {
      set({phase: 'transcribing'});
      const english = await transcribe(uri, 'en');
      if (!english) {
        set({
          phase: 'awaiting-english',
          error: "I couldn't hear that. Try again a bit closer to the mic.",
        });
        return;
      }
      await get().handleEnglishText(english);
    } catch (e) {
      set({
        phase: 'awaiting-english',
        error: e instanceof Error ? e.message : 'Something went wrong, try again.',
      });
    }
  },

  // Split out from handleEnglishRecording so the transcription step and the
  // teach step are separable (the recording path transcribes, then calls this).
  handleEnglishText: async (english: string) => {
    try {
      const userEntryId = nextId();
      set((s) => ({
        transcript: [
          ...s.transcript,
          {id: userEntryId, kind: 'user-english', text: english},
        ],
        phase: 'thinking',
      }));

      const history: ChatMessage[] = [
        ...get().claudeHistory,
        {role: 'user', content: `I'm doing this right now: "${english}". Teach me to say it in Spanish.`},
      ];
      // FAST call: just the phrase, so we can speak it in ~1.5-2s instead of
      // waiting for the full reply. Everything the speak->repeat->score loop
      // needs comes from this call.
      const reply = await getPhrase(history);

      set((s) => ({
        claudeHistory: [
          ...history,
          {role: 'assistant', content: JSON.stringify(reply)},
        ],
        currentTarget: {
          spanish: reply.spanish_phrase,
          english: reply.english_meaning,
        },
        retries: 0,
        transcript: [
          ...s.transcript.map((entry) =>
            entry.id === userEntryId && reply.user_input_spanish
              ? {...entry, spanishTranslation: reply.user_input_spanish}
              : entry,
          ),
          {
            id: nextId(),
            kind: 'spanish',
            text: reply.spanish_phrase,
            englishMeaning: reply.english_meaning,
          },
        ],
        phase: 'speaking',
      }));

      // Kick off the BACKGROUND call (coach line + word breakdown) now, so it
      // runs while the user is hearing and repeating the phrase. It only
      // writes to the dictionary — never conversation state — so it's safe if
      // it resolves after the user has already moved on.
      fetchDetailsAndRecordWords(history, reply);

      // Only the Spanish phrase is spoken and shown; the meaning is on the
      // card's englishMeaning subtitle, and the user already knows it (they
      // just said it themselves in English).
      await speakSpanish(reply.spanish_phrase);
      await speakEnglish(YOUR_TURN_EN); // short "your turn" nudge, not silence
      set({phase: 'awaiting-repeat'});
    } catch (e) {
      set({
        phase: 'awaiting-english',
        error: e instanceof Error ? e.message : 'Something went wrong, try again.',
      });
    }
  },

  handleRepeatRecording: async (uri: string) => {
    const target = get().currentTarget;
    if (!target) return;
    try {
      set({phase: 'transcribing'});
      const attempt = await transcribe(uri, 'es');

      set((s) => ({
        transcript: attempt
          ? [
              ...s.transcript,
              {
                id: nextId(),
                kind: 'user-attempt',
                text: attempt,
                // The meaning they were aiming for, not a literal translation
                // of what Whisper heard — useful even when the attempt misses.
                englishMeaning: target.english,
              },
            ]
          : s.transcript,
        phase: 'scoring',
      }));

      const score = attempt ? scoreAttempt(target.spanish, attempt) : 0;
      const tier = tierForScore(score);
      const retries = get().retries;
      const movingOn = tier === 'perfect' || retries >= 2;
      const feedback: Bilingual =
        tier === 'perfect' ? pickPerfectLine() : movingOn ? MOVING_ON_LINE : feedbackFor(tier);
      const words = attempt ? diffWords(target.spanish, attempt) : undefined;

      set((s) => ({
        transcript: [
          ...s.transcript,
          {
            id: nextId(),
            kind: 'score',
            text: feedback.en,
            spanishTranslation: feedback.es,
            score,
            heard: attempt || undefined,
            targetWords: words,
          },
        ],
      }));

      if (movingOn) {
        // Learned (or moving on positively after max retries) — persist,
        // celebrate, then let the USER decide what's next (chips in the UI).
        const savedAt = Date.now();
        await savePhrase({
          spanish: target.spanish,
          english: target.english,
          bestScore: score,
          learnedAt: savedAt,
          lastSaidAt: savedAt,
        });
        set((s) => ({learnedCount: s.learnedCount + 1}));

        await speakEnglish(feedback.en);
        await speakSpanish(feedback.es);

        set({phase: 'choosing'});
      } else if (tier === 'close') {
        set({retries: retries + 1, phase: 'speaking'});
        await speakEnglish(feedback.en);
        await speakSpanish(target.spanish);
        set({phase: 'awaiting-repeat'});
      } else {
        set({retries: retries + 1, phase: 'speaking'});
        await speakEnglish(feedback.en);
        await speakSpanish(target.spanish, true);
        set({phase: 'awaiting-repeat'});
      }
    } catch (e) {
      set({
        phase: 'awaiting-repeat',
        error: e instanceof Error ? e.message : 'Something went wrong, try again.',
      });
    }
  },

  chooseNext: async (choice: NextChoice) => {
    const target = get().currentTarget;
    try {
      if (choice.kind === 'new-topic') {
        set((s) => ({
          currentTarget: null,
          retries: 0,
          transcript: [
            ...s.transcript,
            {
              id: nextId(),
              kind: 'coach',
              text: NEW_TOPIC_EN,
              spanishTranslation: NEW_TOPIC_ES,
            },
          ],
          phase: 'speaking',
          error: null,
        }));
        await speakSpanish(NEW_TOPIC_ES);
        await speakEnglish(NEW_TOPIC_EN);
        set({phase: 'awaiting-english'});
        return;
      }

      if (!target) return;
      set({phase: 'thinking', error: null});

      const elementInstruction = choice.element
        ? `adding exactly one new element, specifically ${choice.element}`
        : 'adding exactly one new element of your choice';
      const history: ChatMessage[] = [
        ...get().claudeHistory,
        {
          role: 'user',
          content: `Now EXTEND the phrase "${target.spanish}" by ${elementInstruction}, repeating the core phrase.`,
        },
      ];
      // Same two-call split as the initial teach path: fast phrase call to
      // speak quickly, background details call for the dictionary.
      const reply = await getPhrase(history);

      set((s) => ({
        claudeHistory: [
          ...history,
          {role: 'assistant', content: JSON.stringify(reply)},
        ],
        currentTarget: {
          spanish: reply.spanish_phrase,
          english: reply.english_meaning,
        },
        retries: 0,
        transcript: [
          ...s.transcript,
          {
            id: nextId(),
            kind: 'spanish',
            text: reply.spanish_phrase,
            englishMeaning: reply.english_meaning,
          },
        ],
        phase: 'speaking',
      }));

      fetchDetailsAndRecordWords(history, reply);

      // Only the Spanish phrase is spoken and shown, same as the initial
      // teach path — the extended phrase's meaning stays readable on the
      // card's englishMeaning subtitle.
      await speakSpanish(reply.spanish_phrase);
      await speakEnglish(YOUR_TURN_EN); // short "your turn" nudge, not silence
      set({phase: 'awaiting-repeat'});
    } catch (e) {
      set({
        phase: 'choosing',
        error: e instanceof Error ? e.message : 'Something went wrong, try again.',
      });
    }
  },

  clearError: () => set({error: null}),

  reset: () =>
    set({
      phase: 'idle',
      transcript: [],
      claudeHistory: [],
      currentTarget: null,
      retries: 0,
      error: null,
    }),
}));

function feedbackFor(tier: 'close' | 'retry'): Bilingual {
  switch (tier) {
    case 'close':
      return {
        en: 'Close! Listen again and give it one more try.',
        es: '¡Casi! Escucha otra vez e inténtalo una vez más.',
      };
    case 'retry':
      return {
        en: "Let's hear it slowly one more time, then you try.",
        es: 'Vamos a escucharlo despacio una vez más, luego tú lo intentas.',
      };
  }
}
