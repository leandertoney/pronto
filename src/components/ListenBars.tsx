import {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, StyleSheet, View} from 'react-native';

import {colors} from '../theme';

export type ListenBarsState = 'rippling' | 'breathing' | 'frozen' | 'hidden';

interface ListenBarsProps {
  state: ListenBarsState;
  /** Live 0..1 mic level, used only in the 'rippling' (recording) state so the bars react to actual audio. Ignored otherwise. */
  audioLevel?: number;
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
export function ListenBars({state, audioLevel = 0}: ListenBarsProps) {
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

    // rippling is audio-driven — handled by the separate effect below so it
    // reacts to the live level rather than running a canned loop here.
    return undefined;
  }, [state, reduceMotion, scales]);

  // Audio-reactive rippling: while recording, drive the bars from the live
  // mic level so the user can SEE it's actually hearing them, not just a
  // decorative loop. Each bar gets slight variation so it reads as a lively
  // equalizer, not five identical bars. Skipped under reduced motion.
  useEffect(() => {
    if (state !== 'rippling' || reduceMotion) return;
    scales.forEach((v, i) => {
      // Per-bar variation: center bars react a touch stronger, and a small
      // per-bar offset keeps them from moving in perfect lockstep.
      const variation = 0.8 + ((i * 7) % 5) * 0.1;
      const target = MID_SCALE * 0.6 + audioLevel * variation;
      Animated.timing(v, {
        toValue: Math.max(0.2, Math.min(1, target)),
        duration: 110, // just under the ~120ms metering tick, so it keeps up smoothly
        useNativeDriver: true,
      }).start();
    });
  }, [state, reduceMotion, audioLevel, scales]);

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
