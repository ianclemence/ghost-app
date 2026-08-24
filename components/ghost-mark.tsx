import React from "react";
import { View, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Ghost } from "@/constants/theme";

/**
 * Ghost visual mark.
 *
 * A simple, restrained ghost silhouette.
 * Quiet, editorial, timeless. Works at 16–64px.
 *
 * Usage:
 *   <GhostMark size={24} />
 *   <GhostMark size={16} color={Ghost.text.secondary} />
 */

interface GhostMarkProps {
  size?: number;
  color?: string;
  style?: ViewStyle;
}

export function GhostMark({ size = 24, color, style }: GhostMarkProps) {
  const c = color ?? Ghost.text.primary;
  return (
    <View
      style={[
        { width: size, height: size, alignItems: "center", justifyContent: "center" },
        style,
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <Path
          d="M24 4C15.2 4 8 11.2 8 20v16c0 1.6 1.3 2.9 2.9 2.9 2.4 0 4.3-1.9 4.3-4.3 0-1.2.5-2.3 1.3-3.1.4-.4 1-.6 1.6-.6 1.2 0 2.2 1 2.2 2.2v2.9c0 1.6 1.3 2.9 2.9 2.9s2.9-1.3 2.9-2.9v-2.9c0-1.2 1-2.2 2.2-2.2.6 0 1.2.2 1.6.6.8.8 1.3 1.9 1.3 3.1 0 2.4 1.9 4.3 4.3 4.3 1.6 0 2.9-1.3 2.9-2.9V20C40 11.2 32.8 4 24 4zM19 22c-1.6 0-2.9-1.3-2.9-2.9S17.4 16.2 19 16.2s2.9 1.3 2.9 2.9S20.6 22 19 22zm10 0c-1.6 0-2.9-1.3-2.9-2.9S27.4 16.2 29 16.2s2.9 1.3 2.9 2.9S30.6 22 29 22z"
          fill={c}
        />
      </Svg>
    </View>
  );
}
