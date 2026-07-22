import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ConversationSession,
  bestDayThisWeek,
  clearSessions,
  dateKey,
  daysActiveThisMonth,
  daysActiveThisWeek,
  lastSevenDays,
  loadSessions,
  minuteTier,
  minutesThisWeek,
  monthCalendar,
  recordSession,
} from '../src/lib/sessionStore';

beforeEach(async () => {
  await AsyncStorage.clear();
});

// A fixed reference instant: Sunday 2026-07-19 15:00:00 local time.
const NOW = new Date(2026, 6, 19, 15, 0, 0).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

describe('dateKey', () => {
  it('formats as YYYY-MM-DD in local time', () => {
    expect(dateKey(new Date(2026, 6, 5, 23, 59).getTime())).toBe('2026-07-05');
  });

  it('pads single-digit months and days', () => {
    expect(dateKey(new Date(2026, 0, 9).getTime())).toBe('2026-01-09');
  });
});

describe('recordSession / loadSessions', () => {
  it('returns an empty list when nothing is stored', async () => {
    expect(await loadSessions()).toEqual([]);
  });

  it('records a new session for a fresh day', async () => {
    const sessions = await recordSession(NOW, 5);
    expect(sessions).toEqual([{date: dateKey(NOW), minutes: 5}]);
  });

  it('merges multiple sessions on the same day by summing minutes', async () => {
    await recordSession(NOW, 5);
    const sessions = await recordSession(NOW + 60_000, 3);
    expect(sessions).toEqual([{date: dateKey(NOW), minutes: 8}]);
  });

  it('creates separate entries for different days', async () => {
    await recordSession(NOW, 5);
    const sessions = await recordSession(NOW + DAY_MS, 4);
    expect(sessions).toHaveLength(2);
  });

  it('ignores zero or negative minutes', async () => {
    const sessions = await recordSession(NOW, 0);
    expect(sessions).toEqual([]);
  });

  it('clears all sessions', async () => {
    await recordSession(NOW, 5);
    await clearSessions();
    expect(await loadSessions()).toEqual([]);
  });
});

describe('lastSevenDays', () => {
  it('returns 7 days ending today, oldest first', () => {
    const days = lastSevenDays([], NOW);
    expect(days).toHaveLength(7);
    expect(days[6].isToday).toBe(true);
    expect(days[6].date).toBe(dateKey(NOW));
    expect(days[0].date).toBe(dateKey(NOW - 6 * DAY_MS));
  });

  it('marks only today as isToday', () => {
    const days = lastSevenDays([], NOW);
    expect(days.filter((d) => d.isToday)).toHaveLength(1);
  });

  it('fills in minutes from matching sessions, zero otherwise', () => {
    const sessions: ConversationSession[] = [
      {date: dateKey(NOW), minutes: 12},
      {date: dateKey(NOW - 2 * DAY_MS), minutes: 7},
    ];
    const days = lastSevenDays(sessions, NOW);
    expect(days[6].minutes).toBe(12);
    expect(days[4].minutes).toBe(7);
    expect(days[5].minutes).toBe(0);
  });

  it('ignores sessions outside the 7-day window', () => {
    const sessions: ConversationSession[] = [{date: dateKey(NOW - 10 * DAY_MS), minutes: 99}];
    const days = lastSevenDays(sessions, NOW);
    expect(days.every((d) => d.minutes === 0)).toBe(true);
  });
});

describe('daysActiveThisWeek / minutesThisWeek', () => {
  it('counts zero for an empty history', () => {
    expect(daysActiveThisWeek([], NOW)).toBe(0);
    expect(minutesThisWeek([], NOW)).toBe(0);
  });

  it('counts active days and sums minutes within the window', () => {
    const sessions: ConversationSession[] = [
      {date: dateKey(NOW), minutes: 10},
      {date: dateKey(NOW - 1 * DAY_MS), minutes: 5},
      {date: dateKey(NOW - 3 * DAY_MS), minutes: 8},
      {date: dateKey(NOW - 10 * DAY_MS), minutes: 100}, // outside window
    ];
    expect(daysActiveThisWeek(sessions, NOW)).toBe(3);
    expect(minutesThisWeek(sessions, NOW)).toBe(23);
  });
});

describe('bestDayThisWeek', () => {
  it('returns null when no sessions this week', () => {
    expect(bestDayThisWeek([], NOW)).toBeNull();
  });

  it('returns the weekday name with the most minutes', () => {
    const friday = NOW - 1 * DAY_MS; // NOW is Sunday, so -1 day is Saturday... verify below
    const sessions: ConversationSession[] = [
      {date: dateKey(NOW - 2 * DAY_MS), minutes: 20}, // Friday
      {date: dateKey(NOW - 1 * DAY_MS), minutes: 5}, // Saturday
    ];
    expect(bestDayThisWeek(sessions, NOW)).toBe('Fri');
    expect(new Date(friday).getDay()).toBe(6); // sanity check: NOW-1day is Saturday, not Friday
  });
});

describe('minuteTier', () => {
  it('tiers minutes into 0-3 matching the mockup thresholds', () => {
    expect(minuteTier(0)).toBe(0);
    expect(minuteTier(5)).toBe(1);
    expect(minuteTier(15)).toBe(2);
    expect(minuteTier(25)).toBe(3);
  });
});

describe('monthCalendar', () => {
  it('returns every day in the current month with correct length', () => {
    const days = monthCalendar([], NOW);
    expect(days).toHaveLength(31); // July has 31 days
  });

  it('marks exactly one day as today', () => {
    const days = monthCalendar([], NOW);
    expect(days.filter((d) => d.isToday)).toHaveLength(1);
    expect(days.find((d) => d.isToday)?.date).toBe(dateKey(NOW));
  });

  it('applies session minutes and tiers per day', () => {
    const sessions: ConversationSession[] = [{date: dateKey(NOW), minutes: 25}];
    const days = monthCalendar(sessions, NOW);
    const today = days.find((d) => d.isToday);
    expect(today?.minutes).toBe(25);
    expect(today?.tier).toBe(3);
  });
});

describe('daysActiveThisMonth', () => {
  it('counts distinct active days in the current month', () => {
    const sessions: ConversationSession[] = [
      {date: dateKey(NOW), minutes: 5},
      {date: dateKey(NOW - 2 * DAY_MS), minutes: 5},
      {date: dateKey(NOW - 40 * DAY_MS), minutes: 5}, // different month
    ];
    expect(daysActiveThisMonth(sessions, NOW)).toBe(2);
  });
});
