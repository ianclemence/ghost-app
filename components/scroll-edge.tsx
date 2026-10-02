import React, { forwardRef, useRef } from "react";
import { StyleSheet, View, type ScrollViewProps } from "react-native";
import Animated, { useAnimatedScrollHandler, useSharedValue, type SharedValue } from "react-native-reanimated";

/**
 * Scrolling containers for screens under a header.
 *
 * The fade that used to dissolve content under the header is retired: with the
 * aurora behind every screen, a fade to a solid colour would show as a dark
 * band. TopEdge stays as a no-op so screens that mount it need no change.
 */
export function TopEdge(_props: { y: SharedValue<number>; blurTarget?: React.RefObject<View | null> }) {
  return null;
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
});
