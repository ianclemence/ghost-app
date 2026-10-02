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
  /** The status line: what is happening, in a few words. */
  headline: string;
  detail: string | null;
  actions: SurfaceActionId[];
  live: boolean;
  /** Ghost is actively doing something (the light breathes). */
  working: boolean;
  /** The owner is needed. */
  attention: boolean;
}

/**
 * Maps authoritative surface state to human copy and valid actions.
 * The client never invents transitions: every action shown is a backend
 * operation valid from the reported state.
 *
 * "waiting" is only ever set while an approval for the next step pends. It
 * used to read "Take over to continue" and "Ghost needs you to sign in",
 * which sent the owner to the wrong place every time.
 */
export function presentSurface(
  s: LiveSurface,
  ownDeviceId?: string,
  ctx: { approvalWaiting?: boolean; answering?: boolean } = {},
): SurfacePresentation {
  const isMine = !!ownDeviceId && !!s.lease && s.lease.device_id === ownDeviceId;
  const otherHolder = s.control === "user" && !isMine;
  const base = { live: true, working: false, attention: false };
  switch (s.state) {
    case "user_control":
      if (isMine) {
        return { ...base, headline: "You're steering. Ghost is paused.", detail: null, actions: ["watch", "giveback"] };
      }
      return {
        ...base,
        headline: otherHolder ? "Another device is steering." : "Ghost is paused.",
        detail: null,
        actions: ["watch"],
      };
    case "waiting":
      if (ctx.approvalWaiting) {
        return { ...base, headline: s.activity?.trim() || "Waiting for your OK", detail: null, actions: ["watch"], attention: true };
      }
      return { ...base, headline: "Stopped here", detail: "Ask Ghost to carry on when you're ready.", actions: ["watch"] };
    case "paused":
      return { ...base, live: false, headline: "Paused", detail: "Give control back and Ghost carries on.", actions: ["watch", "resume"] };
    case "failed":
      return { ...base, live: false, headline: "Didn't finish", detail: null, actions: ["watch"] };
    case "completed":
      return { ...base, live: false, headline: "Done", detail: null, actions: ["watch"] };
    case "starting":
    case "created":
      return {
        ...base,
        working: true,
        headline: s.kind === "browser" ? "Opening the browser" : "Opening the computer",
        detail: null,
        actions: [],
      };
    case "disconnected":
      return { ...base, working: true, headline: "Reconnecting", detail: null, actions: [] };
    case "expired":
      return { ...base, live: false, headline: "Ended", detail: null, actions: [] };
    case "active":
    default:
      // The browsing is over and the answer is being written: say that, not
      // "working", while the words appear below.
      if (ctx.answering && !s.activity?.trim()) {
        return { ...base, headline: "Writing up what it found", detail: null, actions: ["watch"] };
      }
      return {
        ...base,
        working: true,
        headline: s.activity?.trim() || "Working on it",
        detail: null,
        actions: ["watch", "takeover"],
      };
  }
}

/** The one-line record a settled surface leaves in the conversation. */
export function surfaceRecord(s: LiveSurface): string {
  const what = s.kind === "browser" ? "browser" : "computer";
  const place = surfacePlace(s);
  if (s.state === "failed") return place ? `The ${what} stopped on ${place}` : `The ${what} stopped before finishing`;
  if (s.kind !== "browser") return "Used the computer";
  return place ? `Browsed ${place}` : "Used the browser";
}

/** "news.ycombinator.com", or null when no page has loaded yet. */
export function surfacePlace(s: LiveSurface): string | null {
  const d = s.observation?.domain?.trim();
  if (d) return d.replace(/^www\./, "");
  const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(s.observation?.url?.trim() ?? "");
  return m ? m[1].replace(/^www\./, "") : null;
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
