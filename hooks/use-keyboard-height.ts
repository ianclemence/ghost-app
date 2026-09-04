import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Explicit keyboard height for composer positioning.
 *
 * Used with `softwareKeyboardLayoutMode: "pan"` (see app.json) so the OS
 * never moves layout itself: screens lift exactly the composer by this
 * amount. iOS tracks WillChangeFrame so interactive dismissal follows the
 * finger; Android uses show/hide events.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const show = Platform.OS === "ios"
      ? Keyboard.addListener("keyboardWillChangeFrame", (e) => {
          setHeight(Math.max(0, e.endCoordinates.height));
        })
      : Keyboard.addListener("keyboardDidShow", (e) => {
          setHeight(e.endCoordinates.height);
        });
    const hide = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
