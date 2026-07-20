import {Text, TextProps} from 'react-native';

import {colors, fonts} from '../theme';

export type TextVariant = keyof typeof fonts;

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
}

/** Text with a theme font variant applied. Default variant is `body`, default color is `textPrimary`. */
export function AppText({variant = 'body', color, style, ...rest}: AppTextProps) {
  return (
    <Text
      style={[fonts[variant], {color: color ?? colors.textPrimary}, style]}
      {...rest}
    />
  );
}
