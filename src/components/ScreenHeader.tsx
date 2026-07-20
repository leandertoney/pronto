import {Ionicons} from '@expo/vector-icons';
import {ReactNode} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';

import {colors} from '../theme';
import {AppText} from './AppText';

interface ScreenHeaderProps {
  title: ReactNode;
  onBack: () => void;
  /** Right-side slot, e.g. a count badge, toggle, or a same-size spacer to keep the title centered. */
  right?: ReactNode;
}

/** Shared header: back chevron in a soft card square, centered title, a right slot. */
export function ScreenHeader({title, onBack, right}: ScreenHeaderProps) {
  return (
    <View style={styles.head}>
      <Pressable style={styles.back} onPress={onBack} hitSlop={8}>
        <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
      </Pressable>
      <AppText variant="title" style={styles.title}>
        {title}
      </AppText>
      <View style={styles.right}>{right ?? <View style={styles.spacer} />}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#EADFCB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
  },
  right: {
    minWidth: 38,
    alignItems: 'flex-end',
  },
  spacer: {
    width: 38,
    height: 38,
  },
});
