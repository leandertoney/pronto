import {Pressable, PressableProps, StyleSheet} from 'react-native';

import {colors} from '../theme';
import {AppText} from './AppText';

interface OutlineButtonProps extends PressableProps {
  label: string;
}

/** Turquoise-outline secondary button, per ui-redesign-prompt-v2.md's Home secondary CTA. */
export function OutlineButton({label, style, ...rest}: OutlineButtonProps) {
  return (
    <Pressable
      style={({pressed}) => [
        styles.button,
        pressed && styles.pressed,
        typeof style === 'function' ? undefined : style,
      ]}
      {...rest}
    >
      <AppText variant="button" color={colors.turquoise}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.turquoise,
  },
  pressed: {
    opacity: 0.85,
  },
});
