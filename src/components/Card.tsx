import {StyleSheet, View, ViewProps} from 'react-native';

import {colors} from '../theme';

interface CardProps extends ViewProps {
  /** Border color override, e.g. sunshine for a perfect-score card. Defaults to a neutral raised-tone border. */
  borderColor?: string;
  /** Adds the soft drop shadow used by score/next-step cards in the mockup. */
  elevated?: boolean;
}

/** Shared white card container: rounded, bordered, optionally shadowed. */
export function Card({borderColor, elevated, style, ...rest}: CardProps) {
  return (
    <View
      style={[
        styles.card,
        {borderColor: borderColor ?? '#EADFCB'},
        elevated && styles.elevated,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  elevated: {
    shadowColor: '#462D19',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
    elevation: 3,
  },
});
