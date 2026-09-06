import { useEffect, useRef, useState } from "react";
import { Keyboard, LayoutAnimation, Platform, UIManager } from "react-native";
import { Motion } from "@/constants/theme";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Frames that move less than this are keyboard prediction noise, not real
// movement. Ignoring them is what stops the composer bounce.
const NOISE_PX = 8;

/**
 * Explicit keyboard height for composer positioning.
 *
 * Used with `softwareKeyboardLayoutMode: "pan"` (see app.json) so the OS
 * never moves layout itself: screens lift exactly the composer by this
 * amount. iOS tracks WillChangeFrame so interactive dismissal follows the
 * finger; Android uses show/hide events. Height changes animate with a calm
 * ease so the composer glides instead of jumping.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  const heightRef = useRef(0);

  useEffect(() => {
    const apply = (next: number) => {
      const clamped = Math.max(0, Math.round(next));
      if (Math.abs(clamped - heightRef.current) < NOISE_PX) return;
      heightRef.current = clamped;
      LayoutAnimation.configureNext({
        duration: Motion.base,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });
      setHeight(clamped);
    };
    const show =
      process.env.EXPO_OS === "ios"
        ? Keyboard.addListener("keyboardWillChangeFrame", (e) => {
            apply(e.endCoordinates.height);
          })
        : Keyboard.addListener("keyboardDidShow", (e) => {
            apply(e.endCoordinates.height);
          });
    const hide = Keyboard.addListener("keyboardDidHide", () => apply(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
