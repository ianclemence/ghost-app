import type { WSMessage } from "./ghostApi";
import { LIMITS, parseBlocks, type Block } from "./blocks";

export type CardKind =
  | "suggestion"
  | "goal_update"
  | "cart"
  | "browser_view"
  | "memory_receipt"
  | "browser_recovery"
  | "present";

export interface CardAction {
  id: string;
  label: string;
  style?: string;
  request_id?: string;
  /** "reply" sends `text` to Ghost as if typed; "dismiss" puts the card away. Absent: the older broker-bound action. */
  kind?: "reply" | "dismiss";
  text?: string;
}

/** What the owner did with a card, remembered by the Pod so it stays put away everywhere. */
export interface CardResolution {
  action_id: string;
  label: string;
}

export interface RichCard {
  id: string;
  kind: CardKind;
  title: string;
  body?: string;
  topic?: string;
  request_id?: string;
  data?: Record<string, unknown>;
  actions?: CardAction[];
  /** A presented card is built from these. */
  blocks?: Block[];
  resolved?: CardResolution;
  /** When it was made, in ms, so it sits where it was shown. */
  created_at?: number;
}

const KNOWN_KINDS: CardKind[] = ["suggestion", "goal_update", "cart", "browser_view", "memory_receipt", "browser_recovery", "present"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function parseActions(raw: unknown, present: boolean): CardAction[] {
  const out: CardAction[] = [];
  const max = present ? 3 : 4;
  for (const a of (Array.isArray(raw) ? raw : []).slice(0, max)) {
    if (!isObj(a) || typeof a.id !== "string" || typeof a.label !== "string") continue;
    const kind = a.kind === "reply" || a.kind === "dismiss" ? a.kind : undefined;
    const text = typeof a.text === "string" ? Array.from(a.text.trim()).slice(0, LIMITS.actionText).join("") : undefined;
    // A presented card's choices are only ever a reply or a dismissal.
    if (present && !kind) continue;
    if (kind === "reply" && !text) continue;
    out.push({
      id: a.id,
      label: a.label,
      style: typeof a.style === "string" ? a.style : undefined,
      request_id: !present && typeof a.request_id === "string" ? a.request_id : undefined,
      kind,
      text: kind === "reply" ? text : undefined,
    });
  }
  return out;
}

/** Seconds from the Pod or milliseconds from a phone: always milliseconds out. */
// A live frame carries Unix seconds; the fetched history (GET /v1/cards) carries
// the Pod's RFC 3339 time. Reading only numbers left every fetched card timeless,
// so it sat under the newest message and a stale "browser got stuck" never cleared.
function toMs(v: unknown): number | undefined {
  if (typeof v === "string") v = Date.parse(v);
  if (typeof v !== "number" || !isFinite(v) || v <= 0) return undefined;
  return v < 1e12 ? v * 1000 : v;
}

/**
 * One card from the Pod, whether it arrived as a live frame or in the fetched
 * history, or null when it is not one the phone should draw. Unknown kinds are
 * dropped so a future backend can never inject unrenderable UI; a presented
 * card with no drawable block is dropped rather than shown empty.
 */
export function normalizeCard(raw: unknown): RichCard | null {
  if (!isObj(raw)) return null;
  const kind = typeof raw.kind === "string" ? raw.kind : typeof raw.card_kind === "string" ? raw.card_kind : "";
  if (!(KNOWN_KINDS as string[]).includes(kind)) return null;
  const id = typeof raw.id === "string" ? raw.id : typeof raw.card_id === "string" ? raw.card_id : "";
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!id || !title) return null;
  const present = kind === "present";
  const blocks = present ? parseBlocks(raw.blocks) : undefined;
  if (present && (!blocks || blocks.length === 0)) return null;
  const res = isObj(raw.resolved) && typeof raw.resolved.action_id === "string"
    ? { action_id: raw.resolved.action_id, label: typeof raw.resolved.label === "string" ? raw.resolved.label : "Done" }
    : undefined;
  return {
    id,
    kind: kind as CardKind,
    title: present ? Array.from(title).slice(0, 80).join("") : title,
    body: typeof raw.body === "string" && raw.body ? raw.body : undefined,
    topic: typeof raw.topic === "string" ? raw.topic : undefined,
    request_id: typeof raw.request_id === "string" ? raw.request_id : undefined,
    data: isObj(raw.data) ? raw.data : undefined,
    actions: parseActions(raw.actions, present),
    blocks,
    resolved: res,
    created_at: toMs(raw.created_at),
  };
}

/**
 * Parses mobile-channel card_update frames. Unknown kinds are dropped so a
 * future backend can never inject unrenderable UI.
 */
export function parseCardMessage(msg: WSMessage, sessionKey: string): RichCard | null {
  const meta = (msg.metadata ?? {}) as Record<string, unknown>;
  const type =
    typeof msg.type === "string"
      ? msg.type
      : typeof meta.type === "string"
        ? String(meta.type)
        : "";
  if (type !== "card_update") return null;
  const sid = typeof meta.session_id === "string" ? meta.session_id : "";
  if (sid && sid !== sessionKey) return null;
  return normalizeCard(meta);
}
