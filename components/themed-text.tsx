import { Text, type TextProps, type StyleProp, type TextStyle } from "react-native";

import { useThemeColor } from "@/hooks/use-theme-color";
import { Fonts, Type } from "@/constants/theme";

export type TextType =
  | "default"
  | "display"
  | "title"
  | "subtitle"
  | "body"
  | "bodyStrong"
  | "secondary"
  | "caption"
  | "micro"
  | "link"
  | "mono";

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: TextType;
};

function typeStyle(type: TextType): StyleProp<TextStyle> {
  switch (type) {
    case "display":
      return Type.display;
    case "title":
      return Type.title;
    case "subtitle":
      return Type.subtitle;
    case "body":
      return Type.body;
    case "bodyStrong":
      return Type.bodyStrong;
    case "secondary":
      return Type.secondary;
    case "caption":
      return Type.caption;
    case "micro":
      return { ...Type.micro, textTransform: "uppercase" as const };
    case "link":
      return { fontSize: 16, lineHeight: 24, color: "#6FBE8E", textDecorationLine: "underline" };
    case "mono":
      return { fontSize: 14, fontFamily: Fonts.mono, color: "#A79C8C" };
    default:
      return Type.body;
  }
}

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = "default",
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, "text");
  return (
    <Text
      style={[{ color, fontFamily: Fonts.sans }, typeStyle(type), style]}
      {...rest}
    />
  );
}

/** Alias used by the new design system. */
export const GhostText = ThemedText;
export default ThemedText;
