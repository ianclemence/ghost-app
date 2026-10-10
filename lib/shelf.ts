/**
 * How the shelf names what Ghost made (pkg/artifacts ShelfKindOf, mirrored):
 * which kind each thing is, and its one line of detail. Pure, so it is testable.
 */
import type { ShelfItem, ShelfKind } from "./ghostApi";
import { whenAgo } from "./when";

export function shelfKindOf(a: Pick<ShelfItem, "kind" | "path">): ShelfKind {
  if (a.kind === "link") return "links";
  if (a.kind === "text") return "notes";
  const p = (a.path ?? "").toLowerCase();
  if (/^motion\/.+\.(json|mp4)$/.test(p)) return "motion";
  if (/^dashboards\/.+\.json$/.test(p)) return "dashboards";
  if (/\.html?$/.test(p)) return "pages";
  if (/\.(png|jpe?g|webp|gif)$/.test(p)) return "pictures";
  return "documents";
}

const NOUN: Record<ShelfKind, string> = {
  pages: "Page",
  documents: "Document",
  pictures: "Picture",
  links: "Link",
  notes: "Note",
  motion: "Motion",
  dashboards: "Dashboard",
};

/** "Page · 3 versions · 2 days ago", "Link · example.com · today". */
export function shelfMeta(it: Pick<ShelfItem, "kind" | "path" | "url" | "versions" | "created_at">, now = Date.now()): string {
  const kind = shelfKindOf(it);
  // A motion's video is the motion's kind, but it is a video.
  const parts: string[] = [kind === "motion" && /\.mp4$/i.test(it.path ?? "") ? "Video" : NOUN[kind]];
  if (it.versions > 1) parts.push(`${it.versions} versions`);
  if (kind === "links" && it.url) {
    const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(it.url);
    if (m) parts.push(m[1].replace(/^www\./, ""));
  }
  const ago = whenAgo(it.created_at, now);
  if (ago) parts.push(ago);
  return parts.join(" · ");
}
