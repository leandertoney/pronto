import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persist one entry per conversation session: the calendar day it happened
 * and how many minutes it lasted. This is the data behind "My week" (per
 * momentum-dictionary-mockups.html) — a presence tracker, not a streak.
 * Showing up is what's tracked; missing a day breaks nothing.
 */

const STORAGE_KEY = '@queonda/sessions';

export interface ConversationSession {
  /** Calendar day the session happened, as YYYY-MM-DD in the device's local time. */
  date: string;
  minutes: number;
}

/** YYYY-MM-DD for a given timestamp, in local time (not UTC) — a session at 11pm and one at 1am the next day are different days. */
export function dateKey(timestampMs: number): string {
  const d = new Date(timestampMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function loadSessions(): Promise<ConversationSession[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ConversationSession[]) : [];
  } catch {
    return [];
  }
}

/**
 * Record a session. Sessions on the same calendar day are merged (minutes
 * summed) rather than creating multiple rows per day — "My week" cares
 * about which days you showed up and how long, not how many separate app
 * opens that took.
 */
export async function recordSession(
  startedAtMs: number,
  minutes: number,
): Promise<ConversationSession[]> {
  if (minutes <= 0) return loadSessions();
  const existing = await loadSessions();
  const key = dateKey(startedAtMs);
  const idx = existing.findIndex((s) => s.date === key);
  let next: ConversationSession[];
  if (idx >= 0) {
    next = [...existing];
    next[idx] = {...next[idx], minutes: next[idx].minutes + minutes};
  } else {
    next = [...existing, {date: key, minutes}];
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function clearSessions(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/** Flat minutes estimate for a backfilled historical day. The DAY is real (a phrase was learned then); the minute count is an estimate, so it's kept modest and uniform (tier 1 on the heatmap). */
export const BACKFILL_ESTIMATED_MINUTES = 5;

/**
 * Derive session records for past days the user was active but that predate
 * session tracking, WITHOUT touching any day that already has a record.
 *
 * `activityTimestamps` are real timestamps of past activity (in practice,
 * phrase `learnedAt` values). Each distinct calendar day among them that
 * has no existing session gets one backfilled session at a modest estimated
 * minute count. Days that already have a real (or previously-backfilled)
 * record are left exactly as they are.
 *
 * Fill-missing-only makes this idempotent by construction: running it twice
 * adds nothing the second time, and it can never inflate a real session's
 * minutes. Returns the FULL merged list (existing + any new backfilled
 * entries), unsorted.
 */
export function backfillMissingSessions(
  existing: ConversationSession[],
  activityTimestamps: number[],
): ConversationSession[] {
  const existingDays = new Set(existing.map((s) => s.date));
  const daysToAdd = new Set<string>();
  for (const ts of activityTimestamps) {
    const key = dateKey(ts);
    if (!existingDays.has(key)) {
      daysToAdd.add(key);
    }
  }
  const added: ConversationSession[] = Array.from(daysToAdd).map((date) => ({
    date,
    minutes: BACKFILL_ESTIMATED_MINUTES,
  }));
  return [...existing, ...added];
}

/**
 * Fill in session records for past active days (from phrase-learned
 * timestamps) that predate session tracking. Idempotent — safe to call more
 * than once; only ever adds days that have no record, never modifies an
 * existing day.
 */
export async function backfillSessionsFromPhrases(
  activityTimestamps: number[],
): Promise<ConversationSession[]> {
  const existing = await loadSessions();
  const next = backfillMissingSessions(existing, activityTimestamps);
  if (next.length !== existing.length) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export interface WeekDay {
  date: string; // YYYY-MM-DD
  minutes: number; // 0 if no session that day
  isToday: boolean;
}

/** Midnight (local) of the Monday starting the calendar week that contains `nowMs`. */
function startOfWeek(nowMs: number): Date {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0=Sun..6=Sat. Shift so Monday is the start (Sunday counts as 6 days after Monday).
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

/**
 * The current calendar week, Monday through Sunday, as 7 WeekDay entries.
 * This is a FIXED week (per momentum-dictionary-mockups.html: "the week
 * resets softly", plus the mockup's fixed M-T-W-T-F-S-S label row), so it
 * resets every Monday rather than sliding — early in the week it correctly
 * shows fewer days.
 */
export function currentWeek(sessions: ConversationSession[], nowMs: number): WeekDay[] {
  const byDate = new Map(sessions.map((s) => [s.date, s.minutes]));
  const todayKey = dateKey(nowMs);
  const monday = startOfWeek(nowMs);
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = dateKey(d.getTime());
    days.push({date: key, minutes: byDate.get(key) ?? 0, isToday: key === todayKey});
  }
  return days;
}

/** How many days this calendar week (Mon-Sun) had any session at all. */
export function daysActiveThisWeek(sessions: ConversationSession[], nowMs: number): number {
  return currentWeek(sessions, nowMs).filter((d) => d.minutes > 0).length;
}

/** Total minutes talked this calendar week (Mon-Sun). */
export function minutesThisWeek(sessions: ConversationSession[], nowMs: number): number {
  return currentWeek(sessions, nowMs).reduce((sum, d) => sum + d.minutes, 0);
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The weekday name (e.g. "Fri") with the most minutes talked this week, or null if the week was empty. */
export function bestDayThisWeek(sessions: ConversationSession[], nowMs: number): string | null {
  const days = currentWeek(sessions, nowMs).filter((d) => d.minutes > 0);
  if (days.length === 0) return null;
  const best = days.reduce((a, b) => (b.minutes > a.minutes ? b : a));
  const [year, month, day] = best.date.split('-').map(Number);
  return WEEKDAY_NAMES[new Date(year, month - 1, day).getDay()];
}

/** Minute-talked tier for the month calendar's turquoise-depth heatmap (mirrors momentum-dictionary-mockups.html's t1/t2/t3 opacity steps). */
export function minuteTier(minutes: number): 0 | 1 | 2 | 3 {
  if (minutes <= 0) return 0;
  if (minutes < 10) return 1;
  if (minutes < 20) return 2;
  return 3;
}

export interface MonthDay {
  date: string; // YYYY-MM-DD
  minutes: number;
  tier: 0 | 1 | 2 | 3;
  isToday: boolean;
}

/** Every day in the calendar month containing `nowMs`, in order, for the month heatmap grid. */
export function monthCalendar(sessions: ConversationSession[], nowMs: number): MonthDay[] {
  const byDate = new Map(sessions.map((s) => [s.date, s.minutes]));
  const now = new Date(nowMs);
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dateKey(nowMs);
  const days: MonthDay[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(new Date(year, month, day).getTime());
    const minutes = byDate.get(key) ?? 0;
    days.push({date: key, minutes, tier: minuteTier(minutes), isToday: key === todayKey});
  }
  return days;
}

/** How many distinct days this month had any session. */
export function daysActiveThisMonth(sessions: ConversationSession[], nowMs: number): number {
  return monthCalendar(sessions, nowMs).filter((d) => d.minutes > 0).length;
}
