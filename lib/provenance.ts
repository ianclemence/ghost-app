// Answer provenance: where a reply ran, persisted with the message.
//
// The planner already announces the target transiently (toolActivity), but a
// streamed label vanishes when the turn ends — leaving the owner unable to
// verify later. These helpers derive the origin from the same routing labels
// the runtime emits, so the badge always matches actual execution, and format
// the quiet per-bubble badge. Server history rows (other devices, scheduler
// turns) carry no origin and render no badge: unknown stays unknown.
export type AnswerOrigin = "phone" | "pod" | "cloud";

/** Derive the execution origin from a runtime routing label. */
export function parseOrigin(label: string | null | undefined): AnswerOrigin | null {
  const l = (label ?? "").toLowerCase();
  if (!l) return null;
  if (l.includes("cloud")) return "cloud";
  if (l.includes("this phone")) return "phone";
  if (l.includes("pod")) return "pod";
  return null;
}

/** Quiet per-bubble badge. Null when the origin is unknown (no badge). */
export function originBadge(
  origin: AnswerOrigin | null | undefined,
  pendingSync?: boolean | null,
): string | null {
  switch (origin) {
    case "phone":
      return pendingSync ? "Answered on this phone · will sync" : "Answered on this phone";
    case "pod":
      return "Answered by home Pod";
    case "cloud":
      return "Answered via Pod cloud · keys stayed on Pod";
    default:
      return null;
  }
}
