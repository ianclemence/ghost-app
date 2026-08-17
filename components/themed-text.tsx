
import { Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { Fonts } from '@/constants/theme';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link' | 'mono';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  return (
    <Text
      style={[
        { color, fontFamily: Fonts?.mono }, // Default to mono for everything
        type === 'default' ? { fontSize: 16, lineHeight: 24 } : undefined,
        type === 'title' ? { fontSize: 24, lineHeight: 32, fontWeight: 'bold' } : undefined,
        type === 'defaultSemiBold' ? { fontSize: 16, lineHeight: 24, fontWeight: '600' } : undefined,
        type === 'subtitle' ? { fontSize: 18, fontWeight: 'bold' } : undefined,
        type === 'link' ? { fontSize: 16, lineHeight: 30, color: '#0a7ea4', textDecorationLine: 'underline' } : undefined,
        type === 'mono' ? { fontSize: 14 } : undefined,
        style,
      ]}
      {...rest}
    />
  );
}
