/**
 * How a message Ghost started by itself (a reminder, something it noticed, an
 * alert, a routine's result) is laid out as a card. Pure, so it is testable:
 * the card component only draws what this decides.
 *
 * A short one is a single sentence and reads best as the card's headline
 * ("Check the prices for the Shenzhen trip flights."). A long one (a weekly
 * brief) is a document and keeps its formatting under a labelled header.
 */
export type NoticeKind = "reminder" | "notice" | "alert" | "routine";

export interface NoticeShape {
  /** The headline, for a short one. Null when the message is long. */
  title: string | null;
  /** What goes below the header: the whole text when long, nothing when short. */
  body: string;
}

/** Past this, or with a line break, a message is a document, not a headline. */
const HEADLINE_MAX = 140;

/** The label a reminder already carries in its own words ("Reminder: ..."), which the card says once in its header. */
const LABEL_PREFIX = /^\s*(?:reminder|routine|notice|alert|ghost noticed|needs you)\s*[:\-–—]\s*/i;

export function shapeNotice(content: string): NoticeShape {
  const text = (content ?? "").trim().replace(LABEL_PREFIX, "").trim();
  if (!text) return { title: null, body: "" };
  const oneLine = !/\n/.test(text);
  if (oneLine && text.length <= HEADLINE_MAX) {
    return { title: text.charAt(0).toUpperCase() + text.slice(1), body: "" };
  }
  return { title: null, body: text };
}
