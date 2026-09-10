import type { LiveSurface, SurfaceControl, SurfaceKind, WSMessage } from "./ghostApi";

export interface SurfaceAnnouncement {
  surfaceId: string;
  kind: SurfaceKind;
}

/**
 * Parses mobile-channel surface_update frames for one conversation.
 * Identity only; the client always fetches authoritative state after.
 */
export function parseSurfaceAnnouncement(msg: WSMessage, sessionKey: string): SurfaceAnnouncement | null {
  const type =
    typeof msg.type === "string"
      ? msg.type
      : typeof (msg.metadata as Record<string, unknown> | undefined)?.type === "string"
        ? String((msg.metadata as Record<string, unknown>).type)
        : "";
  if (type !== "surface_update") return null;
  const meta = (msg.metadata ?? {}) as Record<string, unknown>;
  const sid = typeof meta.session_id === "string" ? meta.session_id : "";
  if (sid && sid !== sessionKey) return null;
  const surfaceId = typeof meta.surface_id === "string" ? meta.surface_id : "";
  const kind = meta.kind === "browser" || meta.kind === "computer" ? meta.kind : null;
  if (!surfaceId || !kind) return null;
  return { surfaceId, kind };
}

export type SurfaceActionId = "watch" | "takeover" | "giveback" | "resume";

export interface SurfacePresentation {
  headline: string;
  detail: string | null;
  actions: SurfaceActionId[];
  live: boolean;
}

/**
 * Maps authoritative surface state to human copy and valid actions.
 * The client never invents transitions: every action shown is a backend
 * operation valid from the reported state.
 */
export function presentSurface(s: LiveSurface, ownDeviceId?: string): SurfacePresentation {
  const isMine = !!ownDeviceId && !!s.lease && s.lease.device_id === ownDeviceId;
  const otherHolder = s.control === "user" && !isMine;
  switch (s.state) {
    case "user_control":
      if (isMine) {
        return {
          headline: "You're in control.",
          detail: "Ghost is paused while you hold this surface.",
          actions: ["watch", "giveback"],
          live: true,
        };
      }
      return {
        headline: otherHolder ? "Another device is controlling this." : "Ghost is paused.",
        detail: "Watching is read-only.",
        actions: ["watch"],
        live: true,
      };
    case "waiting":
      return {
        headline: "Ghost is waiting for you.",
        detail: "Take over to continue where Ghost stopped.",
        actions: ["watch", "takeover"],
        live: true,
      };
    case "paused":
      return {
        headline: "Ghost is paused.",
        detail: "Give control back and Ghost will continue.",
        actions: ["watch", "resume"],
        live: false,
      };
    case "failed":
      return {
        headline: "Ghost couldn't finish that.",
        detail: "The last observation below is what Ghost last saw.",
        actions: ["watch"],
        live: false,
      };
    case "completed":
      return {
        headline: "Done.",
        detail: null,
        actions: ["watch"],
        live: false,
      };
    case "starting":
    case "created":
      return {
        headline: s.kind === "browser" ? "Ghost is opening the browser…" : "Ghost is opening the computer…",
        detail: null,
        actions: [],
        live: true,
      };
    case "disconnected":
      return {
        headline: "Reconnecting…",
        detail: "Ghost lost this surface and is trying to get it back.",
        actions: [],
        live: true,
      };
    case "expired":
      return {
        headline: "This session ended.",
        detail: null,
        actions: [],
        live: false,
      };
    case "active":
    default:
      return {
        headline: "Ghost is working…",
        detail: null,
        actions: ["watch", "takeover"],
        live: true,
      };
  }
}

export function surfaceTitle(s: LiveSurface): string {
  if (s.kind === "browser") {
    const label = s.observation?.title || s.observation?.domain || "Browser";
    return label;
  }
  return s.observation?.title || "Computer";
}

export function describeControl(control: SurfaceControl | undefined): string {
  if (control === "user") return "user control";
  if (control === "ghost") return "Ghost control";
  return "no control";
}
