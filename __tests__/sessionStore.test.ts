import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  BACKFILL_ESTIMATED_MINUTES,
  ConversationSession,
  backfillMissingSessions,
  backfillSessionsFromPhrases,
  bestDayThisWeek,
  clearSessions,
  currentWeek,
  dateKey,
  daysActiveThisMonth,
  daysActiveThisWeek,
  loadSessions,
  minuteTier,
  minutesThisWeek,
  monthCalendar,
  recordSession,
} from '../src/lib/sessionStore';

beforeEach(async () => {
  await AsyncStorage.clear();
});

// A fixed reference instant: Sunday 2026-07-19 15:00:00 local time. In a
// Monday-start week, this Sunday is the LAST day of the week running
// Mon 2026-07-13 through Sun 2026-07-19.
const NOW = new Date(2026, 6, 19, 15, 0, 0).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MONDAY = '2026-07-13';

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

describe('currentWeek', () => {
  it('returns the Mon-Sun week containing today, Monday first', () => {
    const days = currentWeek([], NOW);
    expect(days).toHaveLength(7);
    expect(days[0].date).toBe(WEEK_MONDAY); // Monday 2026-07-13
    expect(days[6].date).toBe(dateKey(NOW)); // Sunday 2026-07-19 (today)
    expect(days[6].isToday).toBe(true);
  });

  it('marks only today as isToday', () => {
    const days = currentWeek([], NOW);
    expect(days.filter((d) => d.isToday)).toHaveLength(1);
  });

  it('anchors to the same Monday regardless of which day of the week now is', () => {
    // Wednesday 2026-07-15 is in the same Mon-Sun week as NOW (Sunday).
    const wednesday = new Date(2026, 6, 15, 9, 0, 0).getTime();
    expect(currentWeek([], wednesday)[0].date).toBe(WEEK_MONDAY);
    // Today is Wednesday, so isToday lands on index 2 (Mon=0, Tue=1, Wed=2).
    expect(currentWeek([], wednesday)[2].isToday).toBe(true);
  });

  it('fills in minutes from matching sessions, zero otherwise', () => {
    const sessions: ConversationSession[] = [
      {date: dateKey(NOW), minutes: 12}, // Sunday, index 6
      {date: '2026-07-13', minutes: 7}, // Monday, index 0
    ];
    const days = currentWeek(sessions, NOW);
    expect(days[6].minutes).toBe(12);
    expect(days[0].minutes).toBe(7);
    expect(days[3].minutes).toBe(0);
  });

  it('ignores sessions from before this calendar week', () => {
    // 2026-07-12 is the Sunday of the PREVIOUS week.
    const sessions: ConversationSession[] = [{date: '2026-07-12', minutes: 99}];
    const days = currentWeek(sessions, NOW);
    expect(days.every((d) => d.minutes === 0)).toBe(true);
  });
});

describe('daysActiveThisWeek / minutesThisWeek', () => {
  it('counts zero for an empty history', () => {
    expect(daysActiveThisWeek([], NOW)).toBe(0);
    expect(minutesThisWeek([], NOW)).toBe(0);
  });

  it('counts active days and sums minutes within this calendar week', () => {
    const sessions: ConversationSession[] = [
      {date: dateKey(NOW), minutes: 10}, // Sun, in week
      {date: dateKey(NOW - 1 * DAY_MS), minutes: 5}, // Sat, in week
      {date: dateKey(NOW - 3 * DAY_MS), minutes: 8}, // Thu, in week
      {date: '2026-07-12', minutes: 100}, // prev week Sunday, excluded
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
    // Friday 2026-07-17 is NOW - 2 days. Saturday 2026-07-18 is NOW - 1 day.
    const sessions: ConversationSession[] = [
      {date: dateKey(NOW - 2 * DAY_MS), minutes: 20}, // Friday
      {date: dateKey(NOW - 1 * DAY_MS), minutes: 5}, // Saturday
    ];
    expect(bestDayThisWeek(sessions, NOW)).toBe('Fri');
    // sanity check the fixture: NOW-2days really is a Friday.
    expect(new Date(NOW - 2 * DAY_MS).getDay()).toBe(5);
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

describe('backfillMissingSessions (pure)', () => {
  it('adds a session for each distinct active day with no existing record', () => {
    const day1 = new Date(2026, 6, 10, 9).getTime();
    const day2 = new Date(2026, 6, 12, 18).getTime();
    const result = backfillMissingSessions([], [day1, day2]);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.date).sort()).toEqual(['2026-07-10', '2026-07-12']);
    expect(result.every((s) => s.minutes === BACKFILL_ESTIMATED_MINUTES)).toBe(true);
  });

  it('collapses multiple timestamps on the same day into one session', () => {
    const morning = new Date(2026, 6, 10, 9).getTime();
    const evening = new Date(2026, 6, 10, 21).getTime();
    const result = backfillMissingSessions([], [morning, evening]);
    expect(result).toHaveLength(1);
    expect(result[0].minutes).toBe(BACKFILL_ESTIMATED_MINUTES);
  });

  it('never touches a day that already has a record', () => {
    const existing: ConversationSession[] = [{date: '2026-07-10', minutes: 42}];
    const sameDay = new Date(2026, 6, 10, 9).getTime();
    const result = backfillMissingSessions(existing, [sameDay]);
    expect(result).toHaveLength(1);
    expect(result[0].minutes).toBe(42); // real minutes untouched, no fake minutes added
  });

  it('only fills the genuinely-missing days when some already exist', () => {
    const existing: ConversationSession[] = [{date: '2026-07-10', minutes: 42}];
    const existingDay = new Date(2026, 6, 10, 9).getTime();
    const newDay = new Date(2026, 6, 11, 9).getTime();
    const result = backfillMissingSessions(existing, [existingDay, newDay]);
    expect(result).toHaveLength(2);
    expect(result.find((s) => s.date === '2026-07-10')?.minutes).toBe(42);
    expect(result.find((s) => s.date === '2026-07-11')?.minutes).toBe(BACKFILL_ESTIMATED_MINUTES);
  });

  it('is idempotent: re-running over its own output adds nothing', () => {
    const day = new Date(2026, 6, 10, 9).getTime();
    const once = backfillMissingSessions([], [day]);
    const twice = backfillMissingSessions(once, [day]);
    expect(twice).toEqual(once);
  });
});

describe('backfillSessionsFromPhrases (persisted)', () => {
  it('writes backfilled days and does not double up on a second run', async () => {
    const day = new Date(2026, 6, 10, 9).getTime();
    await backfillSessionsFromPhrases([day]);
    const afterFirst = await loadSessions();
    expect(afterFirst).toHaveLength(1);

    await backfillSessionsFromPhrases([day]);
    const afterSecond = await loadSessions();
    expect(afterSecond).toEqual(afterFirst);
  });

  it('leaves a pre-existing real session untouched', async () => {
    await recordSession(new Date(2026, 6, 10, 9).getTime(), 30);
    await backfillSessionsFromPhrases([new Date(2026, 6, 10, 15).getTime()]);
    const sessions = await loadSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].minutes).toBe(30);
  });
});
