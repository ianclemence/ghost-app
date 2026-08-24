import { Text, type TextProps, type StyleProp, type TextStyle } from "react-native";

import { useThemeColor } from "@/hooks/use-theme-color";
import { Fonts, Type } from "@/constants/theme";

export type TextType =
  | "default"
  | "display"
  | "largeTitle"
  | "title"
  | "headline"
  | "body"
  | "callout"
  | "subhead"
  | "footnote"
  | "caption"
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
    case "largeTitle":
      return Type.largeTitle;
    case "title":
      return Type.title;
    case "headline":
      return Type.headline;
    case "body":
      return Type.body;
    case "callout":
      return Type.callout;
    case "subhead":
      return Type.subhead;
    case "footnote":
      return Type.footnote;
    case "caption":
      return Type.caption;
    case "link":
      return {
        fontSize: 16,
        lineHeight: 24,
        color: "#3D7A5F",
        textDecorationLine: "underline",
      };
    case "mono":
      return {
        fontSize: 14,
        fontFamily: Fonts.mono,
        color: "#6B6560",
      };
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

/** Alias used by the design system. */
export const GhostText = ThemedText;
export default ThemedText;
