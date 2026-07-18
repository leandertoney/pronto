import {create} from 'zustand';

import {ChatMessage, getTutorReply} from '../services/claude';
import {speakEnglish, speakSpanish} from '../services/tts';
import {transcribe} from '../services/whisper';
import {savePhrase, loadPhrases} from '../lib/phraseStore';
import {diffWords, scoreAttempt, tierForScore, WordHit} from '../lib/similarity';
import {recordWords} from '../lib/wordStore';
import {TutorReply} from '../lib/claudeJson';

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
  hasTaughtNextCommands: boolean;
  preRecordPhase: Phase | null;

  startSession: () => Promise<void>;
  setRecording: () => void;
  cancelRecording: () => void;
  handleEnglishRecording: (uri: string) => Promise<void>;
  handleEnglishText: (english: string) => Promise<void>;
  handleRepeatRecording: (uri: string) => Promise<void>;
  chooseNext: (choice: NextChoice) => Promise<void>;
  replayTarget: (slow: boolean) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

let entryId = 0;
const nextId = () => `entry-${++entryId}`;

const GREETING_ES = '¿Qué onda?';
const GREETING_EN = 'What are you doing right now?';
const NEW_TOPIC_ES = '¡Muy bien! ¿Qué más?';
const NEW_TOPIC_EN = "What else are you up to?";
const NEXT_COMMANDS_TEACH_EN =
  'Quick tip: from here you can just talk to me. Say "continúa" to build on this, or "progreso" to see how you\'re doing.';
const NEXT_COMMANDS_TEACH_ES = 'Continúa. Progreso.';

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

/** Feed a fresh phrase's per-word glosses into the personal dictionary. Best-effort — a storage hiccup shouldn't break the conversation. */
async function recordReplyWords(reply: TutorReply): Promise<void> {
  if (reply.words.length === 0) return;
  try {
    await recordWords(reply.words, Date.now());
  } catch {
    // Dictionary is a nice-to-have; conversation flow must not break on it.
  }
}

export const useConversation = create<ConversationState>((set, get) => ({
  phase: 'idle',
  transcript: [],
  claudeHistory: [],
  currentTarget: null,
  retries: 0,
  learnedCount: 0,
  error: null,
  hasTaughtNextCommands: false,
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

  // Shared with the "choosing" spoken-command path, which already has a
  // transcript from its own command-recognition pass — this skips a second,
  // redundant Whisper call on the same audio clip.
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
      const reply = await getTutorReply(history);
      await recordReplyWords(reply);

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
          {
            id: nextId(),
            kind: 'coach',
            text: reply.coach_line_english,
            spanishTranslation: reply.coach_line_spanish || undefined,
          },
        ],
        phase: 'speaking',
      }));

      // She says the phrase FIRST, then invites you to say it.
      await speakSpanish(reply.spanish_phrase);
      await speakEnglish(reply.coach_line_english);
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
        await savePhrase({
          spanish: target.spanish,
          english: target.english,
          bestScore: score,
          learnedAt: Date.now(),
        });
        set((s) => ({learnedCount: s.learnedCount + 1}));

        await speakEnglish(feedback.en);
        await speakSpanish(feedback.es);

        if (!get().hasTaughtNextCommands) {
          set({hasTaughtNextCommands: true});
          await speakEnglish(NEXT_COMMANDS_TEACH_EN);
          await speakSpanish(NEXT_COMMANDS_TEACH_ES);
        }

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
      const reply = await getTutorReply(history);
      await recordReplyWords(reply);

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
          {
            id: nextId(),
            kind: 'coach',
            text: reply.coach_line_english,
            spanishTranslation: reply.coach_line_spanish || undefined,
          },
        ],
        phase: 'speaking',
      }));

      // Phrase first, then the invitation to say it.
      await speakSpanish(reply.spanish_phrase);
      await speakEnglish(reply.coach_line_english);
      set({phase: 'awaiting-repeat'});
    } catch (e) {
      set({
        phase: 'choosing',
        error: e instanceof Error ? e.message : 'Something went wrong, try again.',
      });
    }
  },

  replayTarget: async (slow: boolean) => {
    const target = get().currentTarget;
    if (!target) return;
    await speakSpanish(target.spanish, slow);
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
