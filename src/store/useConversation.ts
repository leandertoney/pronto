import {create} from 'zustand';

import {ChatMessage, getTutorReply} from '../services/claude';
import {speakEnglish, speakSpanish} from '../services/tts';
import {transcribe} from '../services/whisper';
import {savePhrase, loadPhrases} from '../lib/phraseStore';
import {diffWords, scoreAttempt, tierForScore, WordHit} from '../lib/similarity';

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
  englishMeaning?: string;
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

  startSession: () => Promise<void>;
  setRecording: () => void;
  cancelRecording: () => void;
  handleEnglishRecording: (uri: string) => Promise<void>;
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

/** Varied celebration lines so a perfect score never sounds canned. */
const PERFECT_LINES = [
  '¡Perfecto! You nailed it.',
  '¡Eso es! That was spot on.',
  '¡Qué bien! You sound like a local.',
  '¡Increíble! First-try energy.',
  '¡Así se hace! Beautiful.',
];

function pickPerfectLine(): string {
  return PERFECT_LINES[Math.floor(Math.random() * PERFECT_LINES.length)];
}

export const useConversation = create<ConversationState>((set, get) => ({
  phase: 'idle',
  transcript: [],
  claudeHistory: [],
  currentTarget: null,
  retries: 0,
  learnedCount: 0,
  error: null,

  startSession: async () => {
    const existing = await loadPhrases();
    set({
      phase: 'greeting',
      transcript: [
        {id: nextId(), kind: 'coach', text: `${GREETING_ES} ${GREETING_EN}`},
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

  setRecording: () => set({phase: 'recording', error: null}),

  cancelRecording: () => {
    const {phase, currentTarget} = get();
    if (phase === 'choosing') {
      set({phase: 'choosing'});
    } else {
      set({phase: currentTarget ? 'awaiting-repeat' : 'awaiting-english'});
    }
  },

  handleEnglishRecording: async (uri: string) => {
    try {
      set({phase: 'transcribing'});
      const english = await transcribe(uri, 'en');
      if (!english) {
        set({
          phase: 'awaiting-english',
          error: "I couldn't hear that — try again a bit closer to the mic.",
        });
        return;
      }

      set((s) => ({
        transcript: [
          ...s.transcript,
          {id: nextId(), kind: 'user-english', text: english},
        ],
        phase: 'thinking',
      }));

      const history: ChatMessage[] = [
        ...get().claudeHistory,
        {role: 'user', content: `I'm doing this right now: "${english}". Teach me to say it in Spanish.`},
      ];
      const reply = await getTutorReply(history);

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
          {id: nextId(), kind: 'coach', text: reply.coach_line_english},
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
        error: e instanceof Error ? e.message : 'Something went wrong — try again.',
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
          ? [...s.transcript, {id: nextId(), kind: 'user-attempt', text: attempt}]
          : s.transcript,
        phase: 'scoring',
      }));

      const score = attempt ? scoreAttempt(target.spanish, attempt) : 0;
      const tier = tierForScore(score);
      const retries = get().retries;
      const movingOn = tier === 'perfect' || retries >= 2;
      const feedback =
        tier === 'perfect'
          ? pickPerfectLine()
          : movingOn
            ? "Great effort — you'll get more reps at this. Let's keep going!"
            : feedbackFor(tier);
      const words = attempt ? diffWords(target.spanish, attempt) : undefined;

      set((s) => ({
        transcript: [
          ...s.transcript,
          {
            id: nextId(),
            kind: 'score',
            text: feedback,
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

        await speakEnglish(feedback);
        set({phase: 'choosing'});
      } else if (tier === 'close') {
        set({retries: retries + 1, phase: 'speaking'});
        await speakEnglish(feedback);
        await speakSpanish(target.spanish);
        set({phase: 'awaiting-repeat'});
      } else {
        set({retries: retries + 1, phase: 'speaking'});
        await speakEnglish(feedback);
        await speakSpanish(target.spanish, true);
        set({phase: 'awaiting-repeat'});
      }
    } catch (e) {
      set({
        phase: 'awaiting-repeat',
        error: e instanceof Error ? e.message : 'Something went wrong — try again.',
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
            {id: nextId(), kind: 'coach', text: `${NEW_TOPIC_ES} ${NEW_TOPIC_EN}`},
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
        ? `adding exactly one new element — specifically ${choice.element}`
        : 'adding exactly one new element of your choice';
      const history: ChatMessage[] = [
        ...get().claudeHistory,
        {
          role: 'user',
          content: `Now EXTEND the phrase "${target.spanish}" by ${elementInstruction}, repeating the core phrase.`,
        },
      ];
      const reply = await getTutorReply(history);

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
          {id: nextId(), kind: 'coach', text: reply.coach_line_english},
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
        error: e instanceof Error ? e.message : 'Something went wrong — try again.',
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

function feedbackFor(tier: 'close' | 'retry'): string {
  switch (tier) {
    case 'close':
      return 'Close! Listen again and give it one more try.';
    case 'retry':
      return "Let's hear it slowly one more time — then you try.";
  }
}
