import {StyleSheet, View} from 'react-native';

import {colors, fonts} from '../theme';
import {AppText} from './AppText';

/** Single source of truth for score-band coloring, used by ScoreRing and anything else that colors a score. */
export function scoreColorFor(score: number): string {
  if (score >= 80) return colors.scoreGood;
  if (score >= 50) return colors.scoreMid;
  return colors.scoreLow;
}

interface ScoreRingProps {
  score: number;
  size?: number;
  borderWidth?: number;
}

/** Circular score badge, colored by band. Size and border width scale together by default. */
export function ScoreRing({score, size = 46, borderWidth}: ScoreRingProps) {
  const color = scoreColorFor(score);
  const resolvedBorderWidth = borderWidth ?? Math.max(2.5, Math.round(size / 15));
  return (
    <View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: resolvedBorderWidth,
          borderColor: color,
        },
      ]}
    >
      <AppText
        variant="title"
        color={color}
        style={[fonts.title, {fontSize: Math.max(11, Math.round(size / 3))}]}
      >
        {score}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
