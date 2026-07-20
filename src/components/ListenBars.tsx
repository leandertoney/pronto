import {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, StyleSheet, View} from 'react-native';

import {colors} from '../theme';

export type ListenBarsState = 'rippling' | 'breathing' | 'frozen' | 'hidden';

interface ListenBarsProps {
  state: ListenBarsState;
}

const BAR_COLORS = [
  colors.accent,
  colors.sunshine,
  colors.turquoise,
  colors.accent,
  colors.sunshine,
];
const BAR_COUNT = BAR_COLORS.length;
const MID_SCALE = 0.55; // frozen/reduced-motion resting height

/**
 * The living zócalo: 5 bars above the mic button, the visible signal that
 * the app is always listening (see ui-redesign-prompt-v2.md §4). Built on
 * the built-in Animated API only, no new dependency.
 *
 * - rippling: staggered scaleY loops, 300-500ms each, offset per bar (recording)
 * - breathing: one slow, gentle, synchronized scaleY loop (awaiting, auto-listen armed)
 * - frozen: held at a low, fixed height (busy: transcribing/thinking/scoring)
 * - hidden: not rendered at all (tap mode off and idle)
 *
 * Reduced motion: bars render frozen at MID_SCALE regardless of `state`,
 * except `hidden`, which still hides.
 */
export function ListenBars({state}: ListenBarsProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const scales = useRef(
    Array.from({length: BAR_COUNT}, () => new Animated.Value(MID_SCALE)),
  ).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion || state === 'hidden') {
      scales.forEach((v) => v.stopAnimation(() => v.setValue(MID_SCALE)));
      return undefined;
    }

    if (state === 'frozen') {
      scales.forEach((v) => v.stopAnimation(() => v.setValue(MID_SCALE)));
      return undefined;
    }

    if (state === 'breathing') {
      // All 5 bars breathe together, synchronized, one slow gentle loop.
      const loops = scales.map((v) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(v, {toValue: 0.75, duration: 900, useNativeDriver: true}),
            Animated.timing(v, {toValue: MID_SCALE, duration: 900, useNativeDriver: true}),
          ]),
        ),
      );
      loops.forEach((l) => l.start());
      return () => loops.forEach((l) => l.stop());
    }

    // rippling
    const loops = scales.map((v, i) => {
      const peak = 0.85 + (i % 3) * 0.15; // slight per-bar variation, not perfectly uniform
      const duration = 300 + (i % 3) * 100; // 300-500ms per the spec
      return Animated.loop(
        Animated.sequence([
          Animated.delay(i * 90),
          Animated.timing(v, {toValue: peak, duration, useNativeDriver: true}),
          Animated.timing(v, {toValue: MID_SCALE * 0.7, duration, useNativeDriver: true}),
        ]),
      );
    });
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [state, reduceMotion, scales]);

  if (state === 'hidden') return null;

  return (
    <View style={styles.row}>
      {scales.map((scale, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {backgroundColor: BAR_COLORS[i], transform: [{scaleY: scale}]},
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'flex-end',
    height: 26,
  },
  bar: {
    width: 7,
    height: 24,
    borderRadius: 4,
  },
});
