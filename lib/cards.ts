import type { WSMessage } from "./ghostApi";
import { isInput, LIMITS, parseBlocks, type Block } from "./blocks";

export type CardKind =
  | "suggestion"
  | "goal_update"
  | "cart"
  | "browser_view"
  | "memory_receipt"
  | "browser_recovery"
  | "present"
  | "reminder"
  | "digest"
  | "question"
  | "draft";

export interface CardAction {
  id: string;
  label: string;
  style?: string;
  request_id?: string;
  /**
   * "reply" sends `text` to Ghost as if typed; "dismiss" puts the card away;
   * "act" asks the Pod to carry out the choice named by `id` (a reminder's Done
   * or Snooze). Absent: the older broker-bound action.
   */
  kind?: "reply" | "dismiss" | "act" | "submit";
  text?: string;
}

/** What the owner did with a card, remembered by the Pod so it stays put away everywhere. */
export interface CardResolution {
  action_id: string;
  label: string;
  /** What the owner answered, by block key, when the card asked. */
  answers?: Record<string, unknown>;
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

const KNOWN_KINDS: CardKind[] = ["suggestion", "goal_update", "cart", "browser_view", "memory_receipt", "browser_recovery", "present", "reminder", "digest", "question", "draft"];

/**
 * Cards whose buttons are only ever a reply, a dismissal or (for the Pod's own
 * kinds) an act: they carry no authority, so the phone may draw and send them
 * without a broker request behind them.
 */
const CHOICE_KINDS: CardKind[] = ["present", "reminder", "digest", "question", "draft"];

/** Cards that keep a one-line receipt once the owner has answered them. */
export function keepsReceipt(card: Pick<RichCard, "kind">): boolean {
  return CHOICE_KINDS.includes(card.kind);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function parseActions(raw: unknown, cardKind: CardKind): CardAction[] {
  const out: CardAction[] = [];
  const present = cardKind === "present";
  // Reminders, the morning digest and drafts are the Pod's own cards: they
  // may also carry "act" (Done, Snooze, Send), which the Pod carries out. A
  // card that asks (present, question) carries one "submit".
  const choices = CHOICE_KINDS.includes(cardKind);
  const asks = present || cardKind === "question";
  const max = present ? 3 : 4;
  for (const a of (Array.isArray(raw) ? raw : []).slice(0, max)) {
    if (!isObj(a) || typeof a.id !== "string" || typeof a.label !== "string") continue;
    const kind =
      a.kind === "reply" || a.kind === "dismiss" || (a.kind === "act" && choices && !asks) || (a.kind === "submit" && asks)
        ? a.kind
        : undefined;
    const text = typeof a.text === "string" ? Array.from(a.text.trim()).slice(0, LIMITS.actionText).join("") : undefined;
    // A choice card's buttons are only ever a reply, a dismissal or an act.
    if (choices && !kind) continue;
    if (kind === "reply" && !text) continue;
    out.push({
      id: a.id,
      label: a.label,
      style: typeof a.style === "string" ? a.style : undefined,
      request_id: !choices && typeof a.request_id === "string" ? a.request_id : undefined,
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
  const present = kind === "present" || kind === "question";
  // A presented card (and a question) is its blocks. The morning digest may
  // carry some too (its list); a reminder has none.
  const blocks = present || kind === "digest" ? parseBlocks(raw.blocks) : undefined;
  if (present && (!blocks || blocks.length === 0)) return null;
  // A draft is its fields; one without a kind it knows is not drawn.
  if (kind === "draft" && !(isObj(raw.data) && ["email", "event", "sms", "alarm"].includes(String(raw.data.draft_kind)))) return null;
  const res = isObj(raw.resolved) && typeof raw.resolved.action_id === "string"
    ? {
      action_id: raw.resolved.action_id,
      label: typeof raw.resolved.label === "string" ? raw.resolved.label : "Done",
      answers: isObj(raw.resolved.answers) ? raw.resolved.answers : undefined,
    }
    : undefined;
  let actions = parseActions(raw.actions, kind as CardKind);
  if (present && blocks) {
    // The Pod's rule, mirrored: a card that asks has one Send, and a Send needs
    // something to ask. A card that asks with no way to answer is not drawn; a
    // list ticked as you go (checklists only) needs none.
    const inputs = blocks.filter(isInput);
    const submits = actions.filter((a) => a.kind === "submit");
    if (inputs.length === 0) actions = actions.filter((a) => a.kind !== "submit");
    else if (submits.length === 0 && inputs.some((b) => b.type !== "checklist")) return null;
    else if (submits.length > 1) return null;
    if (new Set(inputs.map((b) => (b as { key: string }).key)).size !== inputs.length) return null;
  }
  return {
    id,
    kind: kind as CardKind,
    title: present || kind === "draft" ? Array.from(title).slice(0, kind === "question" ? 200 : 80).join("") : title,
    body: typeof raw.body === "string" && raw.body ? raw.body : undefined,
    topic: typeof raw.topic === "string" ? raw.topic : undefined,
    request_id: typeof raw.request_id === "string" ? raw.request_id : undefined,
    data: isObj(raw.data) ? raw.data : undefined,
    actions,
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
