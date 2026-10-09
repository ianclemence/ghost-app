import React, { forwardRef, useRef, useState } from "react";
import { Platform, StyleSheet, View, type ScrollViewProps } from "react-native";
import * as Updates from "expo-updates";
import MaskedView from "@react-native-masked-view/masked-view";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

/**
 * The edge of a scrolling screen, under its header.
 *
 * A header sits above the list, so content used to be cut off hard at its
 * lower edge. The aurora behind every screen rules out a fade to a solid
 * colour (it would show as a flat band), so the scroll view below masks its
 * content to transparent instead. Where that native mask is not available
 * (web, an app built before it), this shade stands in: once content has scrolled under the
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
      <LinearGradient
        colors={STOPS.map((s) => `rgba(0,0,0,${s.a.toFixed(3)})`) as [string, string, ...string[]]}
        locations={STOPS.map((s) => s.at) as [number, number, ...number[]]}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * Bottom edge for the conversation screen only: strongest at the cut just
 * above the floating dock and ramping away above it, so content melts into
 * the darkness before sliding behind the dock. Visible only while content
 * extends below the viewport; at the very bottom it is not there at all.
 */
const BOTTOM_STOPS = (() => {
  const total = FADE_ABOVE + FADE_RAMP;
  const out: { at: number; a: number }[] = [];
  // Rise across the ramp above the cut, then ease back toward SHADE_TOP
  // across the lower reach (which sits behind the dock, off the content).
  const up = 8;
  for (let i = 0; i <= up; i++) {
    const t = i / up;
    const ease = t * t * (3 - 2 * t); // smoothstep, rising
    out.push({ at: (t * FADE_RAMP) / total, a: SHADE_EDGE * ease });
  }
  const down = 6;
  for (let i = 1; i <= down; i++) {
    const t = i / down;
    const ease = t * t * (3 - 2 * t); // smoothstep, rising
    out.push({ at: (FADE_RAMP + t * FADE_ABOVE) / total, a: SHADE_EDGE - (SHADE_EDGE - SHADE_TOP) * ease });
  }
  return out;
})();

export function BottomEdge({ remaining }: { remaining: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(remaining.get(), [0, 160], [0, 1], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.shadeBottom, style]}>
      <LinearGradient
        colors={BOTTOM_STOPS.map((s) => `rgba(0,0,0,${s.a.toFixed(3)})`) as [string, string, ...string[]]}
        locations={BOTTOM_STOPS.map((s) => s.at) as [number, number, ...number[]]}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
};

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
 * The masking view is native, in builds from 1.5.0 on; on web or an older
 * build (which still gets updates over the air) the shade stands in.
 */
const CAN_MASK = Platform.OS !== "web" && atLeast(Updates.runtimeVersion ?? "", [1, 5, 0]);

function atLeast(version: string, want: number[]): boolean {
  const got = version.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < want.length; i++) {
    if ((got[i] ?? 0) !== want[i]) return (got[i] ?? 0) > want[i];
  }
  return true;
}

const FADE = 64; // how far above the edge content takes to fade out

/**
 * The fade itself: the scrolling content becomes transparent as it nears the
 * header, so it dissolves into the aurora under the title instead of being
 * cut. A mask (black shows, clear hides): a ramp from clear to black at the
 * top, and black below. At rest a solid band covers the ramp, so nothing is
 * faded until the content has actually moved under the edge.
 */
function FadeMask({ y }: { y: SharedValue<number> }) {
  const rest = useAnimatedStyle(() => ({
    opacity: interpolate(y.get(), [0, 40], [1, 0], Extrapolation.CLAMP),
  }));
  return (
    <View style={styles.fill} pointerEvents="none">
      <View style={{ height: FADE }}>
        <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)", "#000"]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, rest]} />
      </View>
      <View style={[styles.fill, { backgroundColor: "#000" }]} />
    </View>
  );
}

/** The same fade in a browser, with CSS's own mask: on once content has moved. */
function WebFade({ y, children }: { y: SharedValue<number>; children: React.ReactNode }) {
  const [moved, setMoved] = useState(false);
  useAnimatedReaction(
    () => y.get() > 4,
    (now, before) => {
      if (now !== before) runOnJS(setMoved)(now);
    },
  );
  const mask = `linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0.55) ${FADE * 0.55}px, #000 ${FADE}px)`;
  return (
    <View style={[styles.fill, moved ? ({ WebkitMaskImage: mask, maskImage: mask } as object) : null]}>{children}</View>
  );
}

/**
 * A ScrollView with the top edge built in. A drop-in: same props, same ref.
 * Put it directly under a screen header: content fades away as it scrolls up
 * toward the title. The bottom stays natural: content slides into the dark
 * floor on its own, like the panel's timeline. `fade={false}` keeps the shade
 * for a screen holding web content, which a mask hides on Android.
 */
export const EdgeScrollView = forwardRef<Animated.ScrollView, Omit<ScrollViewProps, "onScroll"> & { fade?: boolean }>(function EdgeScrollView(
  { children, style, fade = true, ...rest },
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
  if (fade && Platform.OS === "web") {
    return <WebFade y={y}>{scroller}</WebFade>;
  }
  if (fade && CAN_MASK) {
    return (
      <MaskedView style={styles.fill} maskElement={<FadeMask y={y} />}>
        {scroller}
      </MaskedView>
    );
  }
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
  // Conversation only: reaches down behind the floating dock, which paints
  // above it (see dock's zIndex).
  shadeBottom: { position: "absolute", left: 0, right: 0, bottom: -FADE_ABOVE, height: FADE_ABOVE + FADE_RAMP, zIndex: 1 },
});
