/**
 * A draft card's fields as the phone reads them (pkg/cards draft.go writes
 * them). Pure, so it is testable.
 */
import type { RichCard } from "./cards";

export type DraftKind = "email" | "event" | "sms";

const FIELDS: Record<DraftKind, string[]> = {
  email: ["to", "cc", "subject", "body"],
  event: ["subject", "start", "end", "location", "body", "all_day"],
  sms: ["to", "body"],
};

export function draftFields(card: Pick<RichCard, "data">): { kind: DraftKind; values: Record<string, string> } {
  const d = card.data ?? {};
  const kind: DraftKind = d.draft_kind === "event" || d.draft_kind === "sms" ? d.draft_kind : "email";
  const values: Record<string, string> = {};
  for (const k of FIELDS[kind]) {
    const v = d[k];
    if (typeof v === "string") values[k] = v;
    else if (typeof v === "boolean") values[k] = v ? "true" : "false";
  }
  return { kind, values };
}

/**
 * The link that opens a text in the phone's Messages, filled in. A name ("Mum")
 * is not a number: then only the words are filled, and the owner picks who.
 */
export function smsUrl(to: string, body: string): string {
  const number = to.replace(/[\s()-]/g, "");
  const recipient = /^\+?\d{3,15}$/.test(number) ? number : "";
  return `sms:${recipient}?body=${encodeURIComponent(body)}`;
}
