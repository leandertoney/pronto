import {Pressable, PressableProps, StyleSheet} from 'react-native';

import {colors, fonts} from '../theme';
import {AppText} from './AppText';

interface PrimaryButtonProps extends PressableProps {
  label: string;
}

/** Solid coral CTA button with a soft coral shadow, per ui-redesign-prompt-v2.md's Home CTA. */
export function PrimaryButton({label, style, ...rest}: PrimaryButtonProps) {
  return (
    <Pressable
      style={({pressed}) => [
        styles.button,
        pressed && styles.pressed,
        typeof style === 'function' ? undefined : style,
      ]}
      {...rest}
    >
      <AppText variant="button" color={colors.textOnAccent} style={fonts.button}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: 8},
    elevation: 4,
  },
  pressed: {
    opacity: 0.85,
  },
});
