import React, { useEffect, useRef } from "react";
import { Animated, Easing, View, type ViewStyle } from "react-native";
import { Ghost } from "@/constants/theme";

/**
 * Ember — Ghost's presence light.
 *
 * A small breathing dot that indicates Ghost is alive.
 * Speeds up when thinking (streaming), dims when offline.
 */

type EmberState = "idle" | "thinking" | "offline";

interface EmberIndicatorProps {
  state?: EmberState;
  size?: number;
  style?: ViewStyle;
}

export function EmberIndicator({
  state = "idle",
  size = 8,
  style,
}: EmberIndicatorProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.65)).current;

  useEffect(() => {
    if (state === "offline") {
      scale.setValue(1);
      glowOpacity.setValue(0);
      return;
    }

    const duration = state === "thinking" ? 1400 : 4200;

    const breathe = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.045,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 1,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.65,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    breathe.start();
    return () => breathe.stop();
  }, [state]);

  const color =
    state === "offline"
      ? Ghost.text.tertiary
      : Ghost.ember;

  const glowSize = size * 3;

  return (
    <View
      style={[
        {
          width: glowSize,
          height: glowSize,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {/* Glow halo */}
      {state !== "offline" && (
        <Animated.View
          style={{
            position: "absolute",
            width: glowSize,
            height: glowSize,
            borderRadius: glowSize / 2,
            backgroundColor: Ghost.ember,
            opacity: glowOpacity.interpolate({
              inputRange: [0.65, 1],
              outputRange: [0.12, 0.22],
            }),
            transform: [{ scale: scale.interpolate({
              inputRange: [1, 1.045],
              outputRange: [0.96, 1.08],
            }) }],
          }}
        />
      )}
      {/* Core dot */}
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{ scale }],
          opacity: state === "offline" ? 0.5 : 1,
        }}
      />
    </View>
  );
}
