import React, { forwardRef, useRef } from "react";
import { StyleSheet, View, type ScrollViewProps } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { alpha, Ghost, scheme } from "@/constants/theme";

/**
 * The top edge of a scrolling screen.
 *
 * Content that scrolls up under the header dissolves into the header's own
 * colour along an eased curve. It only appears once something has scrolled
 * under it, so a screen at rest is clean. No blur: stepped blur strips smeared
 * the first line of text and showed a hard line under the header.
 */

export const EDGE_HEIGHT = 32;

/**
 * Eased stops: an even linear fade shows a visible band where it starts and
 * ends, so the alpha follows a smooth S curve from the header's own colour
 * down to nothing. The top stop is the header's exact colour, so there is no
 * seam where the two meet.
 */
const STOPS = Array.from({ length: 9 }, (_, i) => {
  const t = i / 8;
  return { at: t, a: 1 - t * t * (3 - 2 * t) };
});

export function TopEdge({ y }: { y: SharedValue<number>; blurTarget?: React.RefObject<View | null> }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(y.get(), [0, 24], [0, 1], Extrapolation.CLAMP),
  }));
  const base = Ghost.bg.base;
  return (
    <Animated.View pointerEvents="none" style={[styles.edge, style]}>
      <LinearGradient
        colors={STOPS.map((s) => alpha(base, s.a)) as [string, string, ...string[]]}
        locations={STOPS.map((s) => s.at) as [number, number, ...number[]]}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/** Kept so screens need no change: the edge is a fade now, so there is nothing to wrap. */
export function EdgeTarget({ children }: { targetRef?: React.RefObject<View | null>; children: React.ReactNode }) {
  return <>{children}</>;
}

/** What to call from a list's own onScroll, to drive the edge. */
export function useScrollEdge() {
  const y = useSharedValue(0);
  const target = useRef<View>(null);
  return { y, target };
}

/**
 * A ScrollView with the top edge built in. A drop-in: same props, same ref.
 * Put it directly under a screen header.
 */
export const EdgeScrollView = forwardRef<Animated.ScrollView, Omit<ScrollViewProps, "onScroll">>(function EdgeScrollView(
  { children, style, ...rest },
  ref,
) {
  const { y, target } = useScrollEdge();
  const handler = useAnimatedScrollHandler((e) => {
    y.set(e.contentOffset.y);
  });
  const scroller = (
    <Animated.ScrollView
      ref={ref}
      scrollEventThrottle={16}
      {...rest}
      onScroll={handler}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </Animated.ScrollView>
  );
  return (
    <View style={styles.fill}>
      <EdgeTarget targetRef={target}>{scroller}</EdgeTarget>
      <TopEdge y={y} />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  edge: { position: "absolute", top: 0, left: 0, right: 0, height: EDGE_HEIGHT, overflow: "hidden" },
});
