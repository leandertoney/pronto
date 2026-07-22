import {Ionicons} from '@expo/vector-icons';
import {useFocusEffect, useRouter} from 'expo-router';
import {useCallback, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {AppText} from '../src/components/AppText';
import {Card} from '../src/components/Card';
import {ScreenHeader} from '../src/components/ScreenHeader';
import {LearnedPhrase, loadPhrases, rustiestPhrase} from '../src/lib/phraseStore';
import {
  ConversationSession,
  MonthDay,
  WeekDay,
  bestDayThisWeek,
  currentWeek,
  daysActiveThisMonth,
  daysActiveThisWeek,
  loadSessions,
  minutesThisWeek,
  monthCalendar,
} from '../src/lib/sessionStore';
import {speakSpanish, stopSpeaking} from '../src/services/tts';
import {colors} from '../src/theme';

/**
 * My week: a presence tracker, deliberately NOT a streak (per
 * momentum-dictionary-mockups.html). Missing a day breaks nothing — there's
 * no fire to lose. Shows the current calendar week (Mon-Sun, resets softly
 * each Monday), three at-a-glance stats, a month heatmap, and a one-tap way
 * back into a phrase that's going stale.
 */

// Fixed Monday-first labels, matching the mockup's M-T-W-T-F-S-S row and the
// Monday-start week that currentWeek() returns.
const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// Cycles the same three brand colors as the week dots in the mockup —
// purely decorative variety across the row, not tied to any data.
const DOT_COLORS = [colors.accent, colors.sunshine, colors.turquoise];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function Week() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [phrases, setPhrases] = useState<LearnedPhrase[]>([]);
  const [playing, setPlaying] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadSessions(), loadPhrases()]).then(([s, p]) => {
        setSessions(s);
        setPhrases(p);
      });
    }, []),
  );

  const now = Date.now();
  const week = currentWeek(sessions, now);
  const daysActive = daysActiveThisWeek(sessions, now);
  const minutes = minutesThisWeek(sessions, now);
  const bestDay = bestDayThisWeek(sessions, now);
  const newPhrasesThisWeek = phrases.filter(
    (p) => now - p.learnedAt <= 7 * 24 * 60 * 60 * 1000,
  ).length;
  const month = monthCalendar(sessions, now);
  const monthName = MONTH_NAMES[new Date(now).getMonth()];
  const activeDaysThisMonth = daysActiveThisMonth(sessions, now);
  const rusty = rustiestPhrase(phrases, now);

  const sayRustyPhrase = useCallback(async () => {
    if (!rusty) return;
    // A new tap interrupts whatever's currently playing, same as the other
    // replay buttons across the app (profile.tsx, phrases.tsx).
    stopSpeaking();
    setPlaying(true);
    try {
      await speakSpanish(rusty.phrase.spanish);
    } finally {
      setPlaying(false);
    }
  }, [rusty]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader
        title={
          <>
            My <AppText variant="title" color={colors.accent}>week</AppText>
          </>
        }
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <AppText variant="title" style={styles.heroLine}>
          You showed up{' '}
          <AppText variant="title" color={colors.accent} style={styles.heroLine}>
            {daysActive} {daysActive === 1 ? 'day' : 'days'}
          </AppText>{' '}
          this week.
        </AppText>
        <AppText variant="caption" color={colors.textSecondary} style={styles.heroSub}>
          No streaks. Missing a day breaks nothing.
        </AppText>

        <Card style={styles.weekCard}>
          <AppText variant="caption" color={colors.textSecondary} style={styles.cardLabel}>
            THIS WEEK
          </AppText>
          <View style={styles.weekRow}>
            {week.map((day, i) => (
              <WeekDot
                key={day.date}
                day={day}
                label={WEEKDAY_LABELS[i]}
                color={DOT_COLORS[i % DOT_COLORS.length]}
              />
            ))}
          </View>
        </Card>

        <View style={styles.statsRow}>
          <StatTile value={minutes} label="Min talked" color={colors.turquoise} />
          <StatTile value={newPhrasesThisWeek} label="New phrases" color={colors.sunshine} />
          <StatTile value={bestDay ?? '--'} label="Best day" color={colors.scoreGood} />
        </View>

        <Card style={styles.monthCard}>
          <AppText variant="caption" color={colors.textSecondary} style={styles.cardLabel}>
            {monthName.toUpperCase()}
          </AppText>
          <View style={styles.monthGrid}>
            {chunkIntoRows(month, 7).map((row, i) => (
              <View key={i} style={styles.monthRow}>
                {row.map((day) => (
                  <MonthTile key={day.date} day={day} />
                ))}
                {/* Pad a short last row so its tiles stay the same size as full rows rather than stretching to fill the width. */}
                {Array.from({length: 7 - row.length}).map((_, j) => (
                  <View key={`pad-${j}`} style={styles.monthTileSpacer} />
                ))}
              </View>
            ))}
          </View>
          <AppText variant="caption" color={colors.textSecondary} style={styles.monthCaption}>
            Deeper turquoise, longer talk. {activeDaysThisMonth}{' '}
            {activeDaysThisMonth === 1 ? 'day' : 'days'} this month.
          </AppText>
        </Card>

        {rusty && (
          <Pressable
            style={({pressed}) => [styles.rustyCard, pressed && styles.pressed]}
            onPress={sayRustyPhrase}
          >
            <AppText variant="caption" color="#8A6F32" style={styles.rustyLabel}>
              GETTING RUSTY · LAST SAID {rusty.daysSinceSaid} {rusty.daysSinceSaid === 1 ? 'DAY' : 'DAYS'} AGO
            </AppText>
            <AppText variant="title" color={colors.spanishText} style={styles.rustyPhrase}>
              {rusty.phrase.spanish}
            </AppText>
            <View style={styles.rustyGo}>
              <Ionicons name="play" size={12} color={colors.textOnAccent} />
              <AppText variant="caption" color={colors.textOnAccent} style={styles.rustyGoText}>
                Say it again
              </AppText>
            </View>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function WeekDot({day, label, color}: {day: WeekDay; label: string; color: string}) {
  return (
    <View style={styles.dayCol}>
      <View
        style={[
          styles.dot,
          day.minutes > 0 && {backgroundColor: color},
          day.minutes === 0 && !day.isToday && styles.dotOff,
          day.isToday && styles.dotToday,
        ]}
      >
        {day.minutes > 0 && (
          <Ionicons name="checkmark" size={14} color={colors.textOnAccent} />
        )}
      </View>
      <AppText variant="caption" color={colors.textSecondary} style={styles.dayLabel}>
        {label}
      </AppText>
    </View>
  );
}

/** Split a flat list into fixed-size rows — sidesteps percentage-width-plus-gap math being unreliable for a grid in RN. */
function chunkIntoRows<T>(items: T[], perRow: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += perRow) {
    rows.push(items.slice(i, i + perRow));
  }
  return rows;
}

function MonthTile({day}: {day: MonthDay}) {
  const opacityByTier = [0, 0.35, 0.65, 1];
  return (
    <View
      style={[
        styles.monthTile,
        day.tier > 0 && {backgroundColor: colors.turquoise, opacity: opacityByTier[day.tier]},
        day.isToday && styles.monthTileToday,
      ]}
    />
  );
}

function StatTile({
  value,
  label,
  color,
}: {
  value: number | string;
  label: string;
  color: string;
}) {
  return (
    <Card style={styles.statTile}>
      <AppText variant="display" color={color} style={styles.statValue}>
        {value}
      </AppText>
      <AppText variant="caption" color={colors.textSecondary} style={styles.statLabel}>
        {label.toUpperCase()}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 32,
    gap: 14,
  },
  heroLine: {
    fontSize: 20,
    lineHeight: 26,
  },
  heroSub: {
    marginTop: -8,
  },
  cardLabel: {
    fontSize: 10.5,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  weekCard: {},
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: {
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOff: {
    backgroundColor: colors.surfaceRaised,
  },
  dotToday: {
    backgroundColor: colors.surface,
    borderWidth: 2.5,
    borderColor: colors.accent,
    borderStyle: 'dashed',
  },
  dayLabel: {
    fontSize: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 9,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
  },
  statValue: {
    fontSize: 22,
    letterSpacing: 0,
  },
  statLabel: {
    fontSize: 9.5,
    letterSpacing: 0.3,
    marginTop: 4,
  },
  monthCard: {},
  monthGrid: {
    gap: 5,
  },
  monthRow: {
    flexDirection: 'row',
    gap: 5,
  },
  monthTile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 7,
    backgroundColor: colors.surfaceRaised,
  },
  monthTileSpacer: {
    flex: 1,
  },
  monthTileToday: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.accent,
    borderStyle: 'dashed',
  },
  monthCaption: {
    fontSize: 10.5,
    marginTop: 8,
  },
  rustyCard: {
    backgroundColor: '#FFF2D1',
    borderWidth: 1,
    borderColor: '#F0D48A',
    borderRadius: 16,
    padding: 13,
  },
  rustyLabel: {
    fontSize: 10.5,
    letterSpacing: 0.3,
    fontWeight: '700',
  },
  rustyPhrase: {
    fontSize: 15,
    marginTop: 4,
  },
  rustyGo: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 9,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  rustyGoText: {
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
