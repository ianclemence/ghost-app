
import { useGhostStore } from "@/lib/store";
import { Colors } from "@/constants/theme";

export function useTerminalColor() {
  const accentColor = useGhostStore((s) => s.accentColor);
  const C = Colors.dark;

  switch (accentColor) {
    case "amber":
      return C.terminalAmber;
    case "cyan":
      return C.terminalCyan;
    default:
      return C.terminalGreen;
  }
}
