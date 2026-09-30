import React, { forwardRef, useRef } from "react";
import { Platform, StyleSheet, View, type ScrollViewProps } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { requireOptionalNativeModule } from "expo-modules-core";
import { alpha, Ghost, scheme } from "@/constants/theme";

/**
 * The top edge of a scrolling screen.
 *
 * Content that scrolls up under the header dissolves into a progressive blur:
 * sharp where it is, softer as it nears the header, gone at the edge. It only
 * appears once something has scrolled under it, so a screen at rest is clean.
 *
 * Blur is native, so it only exists in builds that include expo-blur. Anywhere
 * else the same edge is a smooth fade into the background, which reads almost as
 * well. Nothing here can crash a build that lacks it.
 */

export const EDGE_HEIGHT = 44;

type BlurModule = typeof import("expo-blur");
let cached: BlurModule | null | undefined;

/** expo-blur, only if this build actually contains its native side. */
function blurModule(): BlurModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = requireOptionalNativeModule("ExpoBlur") ? (require("expo-blur") as BlurModule) : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Strips of blur from strong at the top to none at the bottom, stepped finely enough to read as a ramp. */
const RAMP = [70, 48, 30, 16, 6];

export function TopEdge({
  y,
  blurTarget,
}: {
  y: SharedValue<number>;
  blurTarget?: React.RefObject<View | null>;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(y.get(), [0, 18], [0, 1], Extrapolation.CLAMP),
  }));
  const blur = blurModule();
  const base = Ghost.bg.base;
  const strip = EDGE_HEIGHT / RAMP.length;
  return (
    <Animated.View pointerEvents="none" style={[styles.edge, style]}>
      {blur
        ? RAMP.map((intensity, i) => (
            <blur.BlurView
              key={i}
              intensity={intensity}
              tint={scheme === "dark" ? "dark" : "light"}
              blurTarget={Platform.OS === "android" ? blurTarget : undefined}
              blurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
              style={{ position: "absolute", left: 0, right: 0, top: i * strip, height: strip + 1 }}
            />
          ))
        : null}
      <LinearGradient
        colors={[alpha(base, blur ? 0.78 : 0.97), alpha(base, blur ? 0.3 : 0.75), alpha(base, 0)]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/** Wraps scrolling content so Android can blur what is behind the edge. Does nothing elsewhere. */
export function EdgeTarget({ targetRef, children }: { targetRef: React.RefObject<View | null>; children: React.ReactNode }) {
  const blur = blurModule();
  if (blur && Platform.OS === "android") {
    return (
      <blur.BlurTargetView ref={targetRef} style={styles.fill}>
        {children}
      </blur.BlurTargetView>
    );
  }
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
      <TopEdge y={y} blurTarget={target} />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  edge: { position: "absolute", top: 0, left: 0, right: 0, height: EDGE_HEIGHT, overflow: "hidden" },
});
