import { useEffect, useRef } from "react";
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from "react-native";
import { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

/**
 * Bottom padding that keeps the composer above the keyboard in every
 * environment: Expo Go, dev builds, iOS, Android.
 *
 * It does not trust the manifest. When the keyboard appears it checks
 * whether the OS already shrank the window (adjustResize): if so the
 * layout reflowed on its own and no extra padding is added. Otherwise
 * (adjustPan, iOS) it pads by the keyboard height, animated in sync
 * with the keyboard. No LayoutAnimation, so no jitter.
 */
export function useKeyboardPadding(base: number) {
  const kb = useSharedValue(0);
  const hiddenRef = useRef(true);
  const baseHRef = useRef(Dimensions.get("window").height);

  useEffect(() => {
    const onShow = (e: KeyboardEvent) => {
      hiddenRef.current = false;
      const shrunk = Dimensions.get("window").height < baseHRef.current - 100;
      const target = shrunk ? 0 : e.endCoordinates.height;
      const duration =
        Platform.OS === "ios" && typeof e.duration === "number" && e.duration > 0
          ? e.duration
          : 220;
      kb.set(withTiming(target, { duration, reduceMotion: ReduceMotion.System }));
    };
    const onHide = () => {
      hiddenRef.current = true;
      baseHRef.current = Dimensions.get("window").height;
      kb.set(withTiming(0, { duration: 200, reduceMotion: ReduceMotion.System }));
    };
    const showName = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const showSub = Keyboard.addListener(showName, onShow);
    const hideSub = Keyboard.addListener("keyboardDidHide", onHide);
    const dimSub = Dimensions.addEventListener("change", ({ window }) => {
      if (hiddenRef.current) {
        baseHRef.current = window.height;
      } else if (window.height < baseHRef.current - 100) {
        kb.set(withTiming(0, { duration: 200, reduceMotion: ReduceMotion.System }));
      }
    });
    return () => {
      showSub.remove();
      hideSub.remove();
      dimSub.remove();
    };
  }, [kb]);

  return useAnimatedStyle(() => ({ paddingBottom: base + kb.get() }));
}
