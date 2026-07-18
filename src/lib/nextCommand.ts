import {normalize} from './similarity';

/**
 * Recognizes a spoken "what next" command during the `choosing` phase — the
 * voice equivalent of tapping a chip (see NextChoice / chooseNext). Coach
 * encourages saying these in Spanish, so Spanish phrasings are primary; a
 * few English fallbacks are included for when the user is just getting
 * started and reaches for English out of habit.
 */

export type SpokenCommand =
  | {kind: 'extend'; element?: string}
  | {kind: 'new-topic'}
  | {kind: 'progress'};

interface CommandMatch {
  command: SpokenCommand;
  phrases: string[];
}

const MATCHES: CommandMatch[] = [
  {
    command: {kind: 'extend', element: 'a location, where this is happening'},
    phrases: ['donde', 'agrega donde', 'agrega un lugar', 'un lugar'],
  },
  {
    command: {kind: 'extend', element: 'a time of day'},
    phrases: ['cuando', 'que hora', 'la hora', 'agrega la hora', 'un momento'],
  },
  {
    command: {kind: 'extend', element: 'how the user feels about it'},
    phrases: ['como me siento', 'un sentimiento', 'mis sentimientos'],
  },
  {
    command: {kind: 'extend'},
    phrases: ['continua', 'sigue', 'mas', 'continuar', 'seguir', 'continue', 'more'],
  },
  {
    command: {kind: 'new-topic'},
    phrases: [
      'nuevo tema',
      'otro tema',
      'cambiar de tema',
      'cambia el tema',
      'new topic',
      'change topic',
    ],
  },
  {
    command: {kind: 'progress'},
    phrases: ['progreso', 'mi progreso', 'progress', 'my progress'],
  },
];

/**
 * Match a transcript against known command phrases. Exact match only (after
 * normalization) against the whole transcript — never a substring — so a
 * real sentence that happens to contain "mas" isn't misread as a command.
 */
export function recognizeCommand(transcript: string): SpokenCommand | null {
  const normalized = normalize(transcript);
  if (!normalized) return null;
  for (const {command, phrases} of MATCHES) {
    if (phrases.some((p) => normalize(p) === normalized)) {
      return command;
    }
  }
  return null;
}
