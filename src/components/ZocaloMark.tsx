import {StyleSheet, View} from 'react-native';

import {colors} from '../theme';

interface ZocaloMarkProps {
  /** Width of the longest (coral) bar; the other two scale proportionally, matching the original 56/34/18 ratio. */
  size?: number;
}

/** The static 3-bar zócalo stripe: coral, sunshine, turquoise, decreasing width. The brand's signature mark (see ListenBars for its live counterpart). */
export function ZocaloMark({size = 56}: ZocaloMarkProps) {
  const scale = size / 56;
  return (
    <View style={styles.row}>
      <View style={[styles.bar, {width: size, backgroundColor: colors.accent}]} />
      <View style={[styles.bar, {width: 34 * scale, backgroundColor: colors.sunshine}]} />
      <View style={[styles.bar, {width: 18 * scale, backgroundColor: colors.turquoise}]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 5,
  },
  bar: {
    height: 8,
    borderRadius: 4,
  },
});
