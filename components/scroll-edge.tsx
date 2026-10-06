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
import { BlurView } from "expo-blur";

/**
 * The edge of a scrolling screen, under its header.
 *
 * A header sits above the list, so content used to be cut off hard at its
 * lower edge. The aurora behind every screen rules out a fade to a solid
 * colour (it would show as a flat band) and a true fade to transparent needs a
 * native mask that is not in the build. So: once content has scrolled under the
 * header, a soft shade comes in over the top of the screen. It is eased, it is
 * strongest at the cut and it ramps away below it, so content melts into the
 * aurora's darkness before it reaches the edge instead of being sliced. At rest
 * it is not there at all, and the header (above it) never dims.
 */
const FADE_RAMP = 120;  // px below the edge it takes to clear
const FADE_ABOVE = 520; // covers the header and status bar above the edge
const SHADE_EDGE = 0.55; // strength at the cut, where it matters
const SHADE_TOP = 0.14; // strength at the top of the screen, so the aurora still shows there

/**
 * Eased stops, so there is no visible start or end to either slope: it deepens
 * gently toward the cut, then clears below it. The strength is continuous
 * across the cut, which is what hides it.
 */
const STOPS = (() => {
  const total = FADE_ABOVE + FADE_RAMP;
  const out: { at: number; a: number }[] = [];
  const up = 6;
  for (let i = 0; i <= up; i++) {
    const t = i / up;
    const ease = t * t * (3 - 2 * t); // smoothstep, rising
    out.push({ at: (t * FADE_ABOVE) / total, a: SHADE_TOP + (SHADE_EDGE - SHADE_TOP) * ease });
  }
  const down = 8;
  for (let i = 1; i <= down; i++) {
    const t = i / down;
    const ease = 1 - t * t * (3 - 2 * t); // smoothstep, falling
    out.push({ at: (FADE_ABOVE + t * FADE_RAMP) / total, a: SHADE_EDGE * ease });
  }
  return out;
})();

export function TopEdge({ y }: { y: SharedValue<number>; blurTarget?: React.RefObject<View | null> }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(y.get(), [0, 64], [0, 1], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.shade, style]}>
      {/* Frost dissolves the crossing edge while keeping the light; the
          black gradient below melts over the frost's own lower edge so no
          second line ever appears. */}
      <BlurView intensity={35} tint="dark" style={styles.frostTop} />
      <LinearGradient
        colors={STOPS.map((s) => `rgba(0,0,0,${s.a.toFixed(3)})`) as [string, string, ...string[]]}
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
 * Put it directly under a screen header. The bottom stays natural: content
 * slides into the dark floor on its own, like the panel's timeline.
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
      showsVerticalScrollIndicator={false}
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
  // Reaches up over the header, which paints above it (see ScreenHeader's zIndex).
  shade: { position: "absolute", left: 0, right: 0, top: -FADE_ABOVE, height: FADE_ABOVE + FADE_RAMP, zIndex: 1 },
  // Frost sits only over the ramp below the cut; the black gradient melts
  // over its lower edge. Above the cut nothing is visible (clipped), so the
  // frost's own top edge never shows as a line.
  frostTop: { position: "absolute", left: 0, right: 0, top: FADE_ABOVE, height: FADE_RAMP },
});
