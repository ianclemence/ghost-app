import { AppWindow, Clapperboard, FileText, Image as ImageIcon, LayoutDashboard, Link2, NotebookPen } from "lucide-react-native";
import { Hue } from "@/constants/theme";
import type { ShelfKind } from "@/lib/ghostApi";

/**
 * What Ghost makes, one look per kind: the same icon and hue on the shelf,
 * the panel and the cards in the conversation. Each kind has its own hue from
 * the shared palette, far enough apart that no two read as the same.
 */
export const MADE_LOOK: Record<ShelfKind, { Icon: typeof AppWindow; tint: string }> = {
  pages: { Icon: AppWindow, tint: Hue.iris },
  documents: { Icon: FileText, tint: Hue.gold },
  motion: { Icon: Clapperboard, tint: Hue.coral },
  dashboards: { Icon: LayoutDashboard, tint: Hue.teal },
  pictures: { Icon: ImageIcon, tint: Hue.mint },
  links: { Icon: Link2, tint: Hue.sky },
  notes: { Icon: NotebookPen, tint: Hue.stone },
};
