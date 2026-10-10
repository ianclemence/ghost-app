import React, { forwardRef, useCallback, useRef, useState } from "react";
import { Platform, StyleSheet, useWindowDimensions, View, type ScrollViewProps } from "react-native";
import { AuroraVeil } from "@/components/screen-glow";
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
 * Content used to be cut off hard at the header's lower edge. On a phone the
 * list now fades into the screen's own light (`AuroraVeil`, drawn again over
 * the top of the list, solid at the edge and clear a little below), so content
 * dissolves into the background under the title instead of being cut. It is
 * drawn, never a native mask: a mask erases pixels, and that erasing captured
 * as black on the screen being left while screens slid past each other. In a
 * browser, CSS masks the list instead. `TopEdge`, a soft shade, is what lists
 * that drive their own scrolling still use.
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

/** What to call from a list's own onScroll, to drive the edge. */
export function useScrollEdge() {
  const y = useSharedValue(0);
  const target = useRef<View>(null);
  return { y, target };
}

const FADE = 64; // how far above the edge content takes to fade out

/**
 * The fade on a phone: the screen's own light drawn again over the top of the
 * list, solid at the edge and clear 64px below it, so content dissolves into
 * the background under the title instead of being cut. It is one SVG in
 * band-local coordinates with its own mask inside it — plain drawing, so it
 * looks the same mid-transition as at rest. It comes in once content has
 * moved. `background`/`alive` are the screen's own background, so the copy
 * matches it.
 */
function Veil({ y, top, w, h, variant, alive }: {
  y: SharedValue<number>; top: number; w: number; h: number; variant: "hero" | "calm"; alive: boolean;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(y.get(), [0, 28], [0, 1], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.veil, style]}>
      <AuroraVeil top={top} height={FADE} w={w} h={h} variant={variant} alive={alive} />
    </Animated.View>
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
 * floor on its own, like the panel's timeline. `background`/`alive` are the
 * screen's own background, so the fade draws the same light. `fade={false}`
 * keeps the shade for a screen holding web content.
 */
export const EdgeScrollView = forwardRef<Animated.ScrollView, Omit<ScrollViewProps, "onScroll"> & { fade?: boolean; background?: "hero" | "calm"; alive?: boolean }>(function EdgeScrollView(
  { children, style, fade = true, background = "calm", alive = false, ...rest },
  ref,
) {
  const { y } = useScrollEdge();
  const { width, height } = useWindowDimensions();
  // Where the list starts on the screen, for the light drawn there. Measured
  // again as scrolling starts, by when any slide has settled.
  const [top, setTop] = useState<number | null>(null);
  const box = useRef<View>(null);
  const measure = useCallback(() => {
    box.current?.measureInWindow((_x, wy) => {
      if (Number.isFinite(wy)) setTop(wy);
    });
  }, []);
  useAnimatedReaction(
    () => y.get() > 1,
    (moved, before) => {
      if (moved && !before) runOnJS(measure)();
    },
  );
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
  if (fade) {
    return (
      <View ref={box} style={styles.fill} onLayout={measure}>
        {scroller}
        {top !== null ? <Veil y={y} top={top} w={width} h={height} variant={background} alive={alive} /> : null}
      </View>
    );
  }
  return (
    <View style={styles.fill}>
      {scroller}
      <TopEdge y={y} />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Reaches up over the header, which paints above it (see ScreenHeader's zIndex).
  shade: { position: "absolute", left: 0, right: 0, top: -FADE_ABOVE, height: FADE_ABOVE + FADE_RAMP, zIndex: 1 },
  veil: { position: "absolute", left: 0, right: 0, top: 0, height: FADE, zIndex: 1 },
  // Conversation only: reaches down behind the floating dock, which paints
  // above it (see dock's zIndex).
  shadeBottom: { position: "absolute", left: 0, right: 0, bottom: -FADE_ABOVE, height: FADE_ABOVE + FADE_RAMP, zIndex: 1 },
});
