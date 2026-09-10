import type { Artifact, ArtifactAction } from "./ghostApi";

export type ArtifactView = "file" | "text" | "link" | "unknown";

/**
 * Selects the renderer for a backend-validated artifact. Unknown kinds
 * fall back to a safe generic view that shows title and summary only —
 * never raw payloads, never invented actions.
 */
export function artifactViewOf(a: Artifact): ArtifactView {
  if (a.kind === "file" || a.kind === "text" || a.kind === "link") return a.kind;
  return "unknown";
}

/**
 * Actions actually offered for an artifact: backend-declared, and only
 * while the artifact is available. Unavailable artifacts offer nothing,
 * regardless of what the record once claimed.
 */
export function artifactActionsOf(a: Artifact): ArtifactAction[] {
  if (a.state !== "available") return [];
  if (!Array.isArray(a.actions)) return [];
  return a.actions.filter(
    (x) => x && typeof x.id === "string" && x.id.trim() !== "" &&
      typeof x.label === "string" && x.label.trim() !== "" &&
      (x.kind === "preview" || x.kind === "open" || x.kind === "download"),
  );
}

/** Human line for an unavailable artifact. Never exposes internals. */
export function unavailableReasonOf(a: Artifact): string {
  if (a.state === "available") return "";
  return a.reason && a.reason.trim() ? a.reason.trim() : "This is no longer available.";
}

/** Stable dedup/merge for conversation artifact lists (newest wins). */
export function mergeArtifacts(prev: Artifact[], fresh: Artifact[]): Artifact[] {
  if (fresh.length === 0) return prev;
  const seen = new Set(prev.map((a) => a.id));
  const merged = [...prev];
  for (const a of fresh) {
    if (a?.id && !seen.has(a.id)) {
      seen.add(a.id);
      merged.push(a);
    }
  }
  return merged;
}
