import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import { Image, PixelRatio, StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Defs, G, Image as SvgImage, LinearGradient, Mask, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Aurora, Ghost } from "@/constants/theme";

/**
 * The aurora: one large soft light behind the screen, amber at the top through
 * magenta and violet to electric blue, fading to black below. It is the only
 * colour in the app. Built from radial gradients stretched to the screen, in
 * two layers that drift against each other very slowly, so it is never quite
 * still and never asks for attention.
 *
 * "hero" is the full light, for moments that should feel like something
 * (the empty conversation, the front page). "calm" is the same light turned
 * down so text stays easy to read over it.
 */

type Spot = { id: string; color: string; cx: number; cy: number; r: number; a: number };

// Positions are fractions of the screen. The upper left stays dark, as in the
// reference, and the bottom falls away to black.
const WARM: Spot[] = [
  { id: "amber", color: Aurora.amber, cx: 0.34, cy: -0.02, r: 0.56, a: 1 },
  { id: "magenta", color: Aurora.magenta, cx: 1.0, cy: 0.27, r: 0.52, a: 0.95 },
];
const COOL: Spot[] = [
  { id: "violet", color: Aurora.violet, cx: 0.88, cy: 0.4, r: 0.4, a: 0.85 },
  { id: "blue", color: Aurora.blue, cx: 0.66, cy: 0.5, r: 0.32, a: 1 },
];

function Layer({ spots, dx, dy, seconds, still }: { spots: Spot[]; dx: number; dy: number; seconds: number; still?: boolean }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce || still) return;
    t.set(withRepeat(withTiming(1, { duration: seconds * 1000, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduce, still, seconds, t]);
  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: dx * t.get() }, { translateY: dy * t.get() }, { scale: 1.12 + 0.05 * t.get() }],
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, anim]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          {spots.map((s) => (
            <RadialGradient key={s.id} id={s.id} cx={s.cx} cy={s.cy} rx={s.r} ry={s.r} fx={s.cx} fy={s.cy}>
              <Stop offset="0" stopColor={s.color} stopOpacity={s.a} />
              <Stop offset="0.45" stopColor={s.color} stopOpacity={s.a * 0.55} />
              <Stop offset="1" stopColor={s.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {spots.map((s) => (
          <Rect key={s.id} x="0" y="0" width="100" height="100" fill={`url(#${s.id})`} />
        ))}
      </Svg>
    </Animated.View>
  );
}

const GRAIN = require("../assets/grain.png");
const GRAIN_PX = 512;

/**
 * Film grain, tiled by hand. `resizeMode="repeat"` did not tile on Android
 * (the speckle showed once, in the top-left corner), so the tile is laid out
 * as a grid of plain images. Each tile is sized so one speck is one screen
 * pixel; at that size a phone needs only a handful.
 */
function Grain() {
  const { width, height } = useWindowDimensions();
  const tile = GRAIN_PX / PixelRatio.get();
  const cells = useMemo(() => {
    const out: { key: string; left: number; top: number }[] = [];
    const cols = Math.ceil(width / tile);
    const rows = Math.ceil(height / tile);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ key: `${r}-${c}`, left: c * tile, top: r * tile });
    return out;
  }, [width, height, tile]);
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden", opacity: 0.55 }]} pointerEvents="none">
      {cells.map((c) => (
        <Image key={c.key} source={GRAIN} style={{ position: "absolute", left: c.left, top: c.top, width: tile, height: tile }} fadeDuration={0} />
      ))}
    </View>
  );
}

/** How far the light swells when Ghost is working. Small: a breath, not a flash. */
const SWELL = 0.14;

export function ScreenBackground({ variant = "hero", alive = false }: { variant?: "hero" | "calm"; alive?: boolean }) {
  const reduce = useReducedMotion();
  const level = useSharedValue(variant === "hero" ? 1 : 0.34);
  // While Ghost is working the aurora breathes with it, slowly. It is the one
  // place the whole screen says "someone is here".
  const breath = useSharedValue(0);
  useEffect(() => {
    if (!alive || reduce) {
      breath.set(withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) }));
      return;
    }
    breath.set(withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [alive, reduce, breath]);
  useEffect(() => {
    const to = variant === "hero" ? 1 : 0.34;
    level.set(reduce ? to : withTiming(to, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, [variant, level, reduce]);
  const fade = useAnimatedStyle(() => ({ opacity: Math.min(1, level.get() + breath.get() * SWELL) }));
  // The calm light holds still: turned down this far its drift was never seen,
  // and a still light can be drawn again, exactly, where a list fades into it
  // (see AuroraVeil).
  const still = variant === "calm";
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setBackgroundSize(e.nativeEvent.layout.width, e.nativeEvent.layout.height)}>
      <Animated.View style={[StyleSheet.absoluteFill, fade]}>
        <Layer spots={WARM} dx={-14} dy={10} seconds={30} still={still} />
        <Layer spots={COOL} dx={16} dy={-12} seconds={37} still={still} />
      </Animated.View>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.46" stopColor="#000" stopOpacity={0} />
            <Stop offset="0.82" stopColor="#000" stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#floor)" />
      </Svg>
      {/* Fine grain over the whole screen: it keeps the black from banding and
          gives the aurora some texture. Tiled, so it costs one small image. */}
      <Grain />
    </View>
  );
}

// The size the background was drawn at (every screen's is the whole screen),
// so the veil below can draw the same light in the same place.
let bgSize: { w: number; h: number } | null = null;
const sizeListeners = new Set<() => void>();
function setBackgroundSize(w: number, h: number) {
  if (bgSize && bgSize.w === w && bgSize.h === h) return;
  bgSize = { w, h };
  sizeListeners.forEach((f) => f());
}
function useBackgroundSize() {
  return useSyncExternalStore(
    (f) => { sizeListeners.add(f); return () => { sizeListeners.delete(f); }; },
    () => bgSize,
  );
}

const GRAIN_TILE = GRAIN_PX / PixelRatio.get();

/**
 * The screen's own background, drawn again over a band of it and faded from
 * solid at the top to clear at the bottom: whatever scrolls under the band
 * dissolves into the light behind it, the way the panel's timeline sinks into
 * the dark below. It is plain drawing (no mask erasing pixels), so it looks
 * the same mid-transition as at rest. `top` and `height` are where the band
 * sits on the screen.
 */
export function AuroraVeil({ top, height, variant = "calm" }: { top: number; height: number; variant?: "hero" | "calm" }) {
  const size = useBackgroundSize();
  if (!size) return null;
  const { w, h } = size;
  const level = variant === "hero" ? 1 : 0.34;
  // The light layers are drawn scaled 1.12 about the screen's centre.
  const scale = `translate(${w / 2} ${h / 2}) scale(1.12) translate(${-w / 2} ${-h / 2})`;
  const ramp = [0, 0.18, 0.36, 0.54, 0.72, 0.86, 1].map((t) => ({ t, a: 1 - t * t * (3 - 2 * t) }));
  return (
    <Svg width={w} height={height} viewBox={`0 ${top} ${w} ${height}`} pointerEvents="none">
      <Defs>
        {[...WARM, ...COOL].map((s) => (
          <RadialGradient key={s.id} id={`v-${s.id}`} cx={s.cx} cy={s.cy} rx={s.r} ry={s.r} fx={s.cx} fy={s.cy}>
            <Stop offset="0" stopColor={s.color} stopOpacity={s.a} />
            <Stop offset="0.45" stopColor={s.color} stopOpacity={s.a * 0.55} />
            <Stop offset="1" stopColor={s.color} stopOpacity={0} />
          </RadialGradient>
        ))}
        <LinearGradient id="v-floor" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.46" stopColor="#000" stopOpacity={0} />
          <Stop offset="0.82" stopColor="#000" stopOpacity={1} />
        </LinearGradient>
        <LinearGradient id="v-ramp" gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={top + height}>
          {ramp.map((r) => <Stop key={r.t} offset={r.t} stopColor="#fff" stopOpacity={r.a} />)}
        </LinearGradient>
        <Pattern id="v-grain" patternUnits="userSpaceOnUse" x="0" y="0" width={GRAIN_TILE} height={GRAIN_TILE}>
          <SvgImage href={GRAIN} x="0" y="0" width={GRAIN_TILE} height={GRAIN_TILE} />
        </Pattern>
        <Mask id="v-mask" maskUnits="userSpaceOnUse" x="0" y={top} width={w} height={height}>
          <Rect x="0" y={top} width={w} height={height} fill="url(#v-ramp)" />
        </Mask>
      </Defs>
      <G mask="url(#v-mask)">
        <Rect x="0" y="0" width={w} height={h} fill={Ghost.bg.base} />
        <G opacity={level} transform={scale}>
          {[...WARM, ...COOL].map((s) => (
            <Rect key={s.id} x="0" y="0" width={w} height={h} fill={`url(#v-${s.id})`} />
          ))}
        </G>
        <Rect x="0" y="0" width={w} height={h} fill="url(#v-floor)" />
        <Rect x="0" y="0" width={w} height={h} fill="url(#v-grain)" opacity={0.55} />
      </G>
    </Svg>
  );
}
