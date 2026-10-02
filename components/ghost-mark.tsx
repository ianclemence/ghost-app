import React from "react";
import { View, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Ghost } from "@/constants/theme";

/**
 * Ghost visual mark: five bars, like a line of text with a gap, and an amber
 * light in the gap. The same artwork as the app icon and the console.
 *
 *   <GhostMark size={24} />
 *   <GhostMark size={16} color={Ghost.text.secondary} />
 *   <GhostMark size={24} dot={Ghost.text.tertiary} />   // a different light
 *   <GhostMark size={24} dot={false} />                 // bars only
 */

interface GhostMarkProps {
  size?: number;
  color?: string;
  /** The light in the gap: a colour, or false for none. Amber by default. */
  dot?: string | false;
  style?: ViewStyle;
}

export function GhostMark({ size = 24, color, dot, style }: GhostMarkProps) {
  const c = color ?? Ghost.text.primary;
  const light = dot === undefined ? Ghost.ember : dot;
  return (
    <View
      style={[
        { width: size, height: size, alignItems: "center", justifyContent: "center" },
        style,
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <Path
          d="M4.859 7.401v2.115h13.256v-4.231h-13.256v2.115zM22.91 7.401v2.115h4.231v-4.231h-4.231v2.115zM4.859 16.427v2.115h22.282v-4.231h-22.282v2.115zM4.859 25.311v1.974h8.744v-3.949h-8.744v1.975zM18.398 25.311v1.974h8.744v-3.949h-8.744v1.975z"
          fill={c}
        />
        {light ? <Circle cx={20.5} cy={7.4} r={1.6} fill={light} /> : null}
      </Svg>
    </View>
  );
}
