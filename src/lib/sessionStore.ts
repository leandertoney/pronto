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

export interface WeekDay {
  date: string; // YYYY-MM-DD
  minutes: number; // 0 if no session that day
  isToday: boolean;
}

/**
 * The last 7 calendar days ending today, oldest first (Mon-Sun ordering
 * isn't assumed — this is a rolling 7-day window, not a fixed week grid,
 * so "today" always lands on the right and there's no Monday-vs-Sunday
 * start-of-week question to get wrong).
 */
export function lastSevenDays(sessions: ConversationSession[], nowMs: number): WeekDay[] {
  const byDate = new Map(sessions.map((s) => [s.date, s.minutes]));
  const todayKey = dateKey(nowMs);
  const days: WeekDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayMs = nowMs - i * 24 * 60 * 60 * 1000;
    const key = dateKey(dayMs);
    days.push({date: key, minutes: byDate.get(key) ?? 0, isToday: key === todayKey});
  }
  return days;
}

/** How many of the last 7 days had any session at all. */
export function daysActiveThisWeek(sessions: ConversationSession[], nowMs: number): number {
  return lastSevenDays(sessions, nowMs).filter((d) => d.minutes > 0).length;
}

/** Total minutes talked across the last 7 days. */
export function minutesThisWeek(sessions: ConversationSession[], nowMs: number): number {
  return lastSevenDays(sessions, nowMs).reduce((sum, d) => sum + d.minutes, 0);
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The weekday name (e.g. "Fri") with the most minutes talked this week, or null if the week was empty. */
export function bestDayThisWeek(sessions: ConversationSession[], nowMs: number): string | null {
  const days = lastSevenDays(sessions, nowMs).filter((d) => d.minutes > 0);
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
