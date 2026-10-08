import React, { useEffect } from "react";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { Ghost } from "@/constants/theme";

/** Ember breathing dot: Ghost's presence light. Static under reduced motion. */
export function EmberDot({ size = 7, active = true }: { size?: number; active?: boolean }) {
  const o = useSharedValue(1);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!active || reduce) {
      o.set(1);
      return;
    }
    o.set(withRepeat(withSequence(withTiming(0.35, { duration: 700 }), withTiming(1, { duration: 700 })), -1, false));
  }, [active, reduce, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.get() }));
  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: Ghost.emberDeep }, style]}
    />
  );
}
