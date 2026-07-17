import {create} from 'zustand';

import {ChatMessage, getTutorReply} from '../services/claude';
import {speakEnglish, speakSpanish} from '../services/tts';
import {transcribe} from '../services/whisper';
import {savePhrase, loadPhrases} from '../lib/phraseStore';
import {scoreAttempt, tierForScore} from '../lib/similarity';

/**
 * The core loop as a state machine:
 * greet -> record English -> Whisper -> Claude Spanish -> TTS ->
 * record repeat -> score -> (retry | extend) -> ...
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
  | 'scoring';

export interface TranscriptEntry {
  id: string;
  kind: 'coach' | 'user-english' | 'spanish' | 'score' | 'user-attempt';
  text: string;
  englishMeaning?: string;
  score?: number;
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
  replayTarget: (slow: boolean) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

let entryId = 0;
const nextId = () => `entry-${++entryId}`;

const GREETING_ES = '¿Qué onda?';
const GREETING_EN = 'What are you doing right now?';

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
    const {currentTarget} = get();
    set({phase: currentTarget ? 'awaiting-repeat' : 'awaiting-english'});
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
          {id: nextId(), kind: 'coach', text: reply.coach_line_english},
          {
            id: nextId(),
            kind: 'spanish',
            text: reply.spanish_phrase,
            englishMeaning: reply.english_meaning,
          },
        ],
        phase: 'speaking',
      }));

      await speakEnglish(reply.coach_line_english);
      await speakSpanish(reply.spanish_phrase);
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
          ? feedbackFor('perfect')
          : movingOn
            ? "Great effort — you'll get more reps at this. Let's keep going!"
            : feedbackFor(tier);

      set((s) => ({
        transcript: [
          ...s.transcript,
          {id: nextId(), kind: 'score', text: feedback, score},
        ],
      }));

      if (movingOn) {
        // Learned (or moving on positively after max retries) — persist, then extend.
        await savePhrase({
          spanish: target.spanish,
          english: target.english,
          bestScore: score,
          learnedAt: Date.now(),
        });
        set((s) => ({learnedCount: s.learnedCount + 1}));

        await speakEnglish(feedback);
        set({phase: 'thinking'});

        const history: ChatMessage[] = [
          ...get().claudeHistory,
          {
            role: 'user',
            content: `My pronunciation scored ${score}/100. Now EXTEND the phrase "${target.spanish}" by adding exactly one new element, repeating the core phrase.`,
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
            {id: nextId(), kind: 'coach', text: reply.coach_line_english},
            {
              id: nextId(),
              kind: 'spanish',
              text: reply.spanish_phrase,
              englishMeaning: reply.english_meaning,
            },
          ],
          phase: 'speaking',
        }));

        await speakEnglish(reply.coach_line_english);
        await speakSpanish(reply.spanish_phrase);
        set({phase: 'awaiting-repeat'});
      } else if (tier === 'close') {
        set({retries: retries + 1, phase: 'speaking'});
        await speakEnglish(feedbackFor(tier));
        await speakSpanish(target.spanish);
        set({phase: 'awaiting-repeat'});
      } else {
        set({retries: retries + 1, phase: 'speaking'});
        await speakEnglish(feedbackFor(tier));
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

function feedbackFor(tier: 'perfect' | 'close' | 'retry'): string {
  switch (tier) {
    case 'perfect':
      return '¡Perfecto! You nailed it.';
    case 'close':
      return 'Close! Listen again and give it one more try.';
    case 'retry':
      return "Let's hear it slowly one more time — then you try.";
  }
}
