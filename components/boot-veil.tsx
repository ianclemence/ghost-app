import React, { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { GhostMark } from "@/components/ghost-mark";
import { ScreenBackground } from "@/components/screen-glow";

/**
 * The few hundred milliseconds between the native splash (black, the dotted
 * mark) and the app. It starts as exactly the splash, so the hand-off from the
 * system is invisible; then the aurora blooms in behind the mark, the mark
 * lets go, and the whole thing dissolves into the conversation. The app is
 * already live underneath, so nothing waits on this and it never takes a tap.
 *
 * It is the one flourish the app has, and it runs once per cold start.
 */
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
// The mark the native splash draws, so the hand-off does not jump.
const MARK = 140;

export function BootVeil({ ready }: { ready: boolean }) {
  const reduce = useReducedMotion();
  const [gone, setGone] = useState(false);
  const aurora = useSharedValue(0);
  const mark = useSharedValue(1);
  const veil = useSharedValue(1);

  useEffect(() => {
    if (!ready) return;
    if (reduce) {
      setGone(true);
      return;
    }
    aurora.set(withTiming(1, { duration: 420, easing: EASE_OUT }));
    mark.set(withDelay(120, withTiming(0, { duration: 260, easing: EASE_OUT })));
    veil.set(withDelay(300, withTiming(0, { duration: 380, easing: EASE_OUT })));
    const t = setTimeout(() => setGone(true), 760);
    return () => clearTimeout(t);
  }, [ready, reduce, aurora, mark, veil]);

  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.get() }));
  const auroraStyle = useAnimatedStyle(() => ({ opacity: aurora.get() }));
  const markStyle = useAnimatedStyle(() => ({ opacity: mark.get() }));

  if (gone) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.veil, veilStyle]}>
      <Animated.View style={[StyleSheet.absoluteFill, auroraStyle]}>
        <ScreenBackground variant="hero" />
      </Animated.View>
      <Animated.View style={[styles.center, markStyle]}>
        <GhostMark size={MARK} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: { ...StyleSheet.absoluteFill, backgroundColor: "#000000", zIndex: 1000, elevation: 1000 },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
});
