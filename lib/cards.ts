import type { WSMessage } from "./ghostApi";

export type CardKind = "suggestion" | "goal_update" | "cart" | "browser_view";

export interface CardAction {
  id: string;
  label: string;
  style?: string;
  request_id?: string;
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
}

const KNOWN_KINDS: CardKind[] = ["suggestion", "goal_update", "cart", "browser_view"];

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
  const kind = typeof meta.card_kind === "string" ? meta.card_kind : "";
  if (!(KNOWN_KINDS as string[]).includes(kind)) return null;
  const id = typeof meta.card_id === "string" ? meta.card_id : "";
  const title = typeof meta.title === "string" ? meta.title : "";
  if (!id || !title) return null;
  const rawActions = Array.isArray(meta.actions) ? meta.actions : [];
  const actions: CardAction[] = [];
  for (const a of rawActions.slice(0, 4)) {
    const r = a as Record<string, unknown>;
    if (typeof r?.id === "string" && typeof r?.label === "string") {
      actions.push({
        id: r.id,
        label: r.label,
        style: typeof r.style === "string" ? r.style : undefined,
        request_id: typeof r.request_id === "string" ? r.request_id : undefined,
      });
    }
  }
  return {
    id,
    kind: kind as CardKind,
    title,
    body: typeof meta.body === "string" ? meta.body : undefined,
    topic: typeof meta.topic === "string" ? meta.topic : undefined,
    request_id: typeof meta.request_id === "string" ? meta.request_id : undefined,
    data: typeof meta.data === "object" && meta.data !== null ? (meta.data as Record<string, unknown>) : undefined,
    actions,
  };
}
