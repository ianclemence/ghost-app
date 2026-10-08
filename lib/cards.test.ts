import { describe, expect, test } from "bun:test";
import { keepsReceipt, normalizeCard, parseCardMessage } from "./cards";
import type { WSMessage } from "./ghostApi";

const frame = (meta: Record<string, unknown>, type?: string): WSMessage =>
  ({ type, metadata: meta }) as WSMessage;

describe("parseCardMessage", () => {
  test("accepts suggestion cards on the current session", () => {
    const c = parseCardMessage(
      frame({ type: "card_update", session_id: "main", card_kind: "suggestion", card_id: "c1", title: "Heads up" }, "card_update"),
      "main",
    );
    expect(c?.id).toBe("c1");
    expect(c?.kind).toBe("suggestion");
  });

  test("accepts channel-level cards without session", () => {
    const c = parseCardMessage(
      frame({ type: "card_update", card_kind: "goal_update", card_id: "c2", title: "Goal done" }),
      "main",
    );
    expect(c?.id).toBe("c2");
  });

  test("rejects unknown kinds", () => {
    expect(
      parseCardMessage(
        frame({ type: "card_update", card_kind: "checkout_sheet", card_id: "c3", title: "Pay" }),
        "main",
      ),
    ).toBeNull();
  });

  test("rejects other sessions and missing title", () => {
    expect(
      parseCardMessage(
        frame({ type: "card_update", session_id: "other", card_kind: "suggestion", card_id: "c4", title: "Hi" }),
        "main",
      ),
    ).toBeNull();
    expect(
      parseCardMessage(
        frame({ type: "card_update", card_kind: "suggestion", card_id: "c5" }),
        "main",
      ),
    ).toBeNull();
  });

  test("caps actions at four and drops malformed ones", () => {
    const actions = [
      { id: "a1", label: "One" },
      { id: 2, label: "Bad" },
      { id: "a3", label: "Three", request_id: "r1" },
      { id: "a4", label: "Four" },
      { id: "a5", label: "Five" },
      { id: "a6", label: "Six" },
    ];
    const c = parseCardMessage(
      frame({ type: "card_update", card_kind: "suggestion", card_id: "c6", title: "T", actions }),
      "main",
    );
    expect(c?.actions?.length).toBeLessThanOrEqual(4);
    expect(c?.actions?.[1]?.request_id).toBe("r1");
  });
});

describe("memory receipt cards", () => {
  test("accepts memory_receipt with receipt data", () => {
    const c = parseCardMessage(
      frame({
        type: "card_update",
        card_kind: "memory_receipt",
        card_id: "c10",
        title: "Why Ghost knows this",
        body: "my name is Ian",
        data: { claim_id: "ec_1", quote: "my name is Ian", confidence: 0.95, status: "current", source: "msg-7" },
      }),
      "main",
    );
    expect(c?.kind).toBe("memory_receipt");
    expect(c?.data?.claim_id).toBe("ec_1");
    expect(c?.data?.confidence).toBe(0.95);
  });

  test("an older belief without a quote still parses", () => {
    const c = parseCardMessage(
      frame({ type: "card_update", card_kind: "memory_receipt", card_id: "c11", title: "Why Ghost knows this", data: { claim_id: "ec_2", quote: "", confidence: 0.9 } }),
      "main",
    );
    expect(c?.kind).toBe("memory_receipt");
    expect(c?.data?.quote).toBe("");
  });

  test("checkout_sheet is still refused", () => {
    expect(
      parseCardMessage(frame({ type: "card_update", card_kind: "checkout_sheet", card_id: "c12", title: "Pay" }), "main"),
    ).toBeNull();
  });
});

describe("browser recovery cards", () => {
  test("accepts browser_recovery with no actions", () => {
    const c = parseCardMessage(
      frame({ type: "card_update", card_kind: "browser_recovery", card_id: "c20", title: "My browser got stuck", body: "Every page was timing out, so I reset it." }),
      "main",
    );
    expect(c?.kind).toBe("browser_recovery");
    expect(c?.actions?.length ?? 0).toBe(0);
  });

  test("an unknown kind is still refused", () => {
    expect(
      parseCardMessage(frame({ type: "card_update", card_kind: "checkout_sheet", card_id: "c21", title: "Pay" }), "main"),
    ).toBeNull();
  });
});

describe("the Pod's own reminder and morning cards", () => {
  // The shapes the Pod really stores (workspace/cards.json).
  const reminder = {
    id: "card_ff601c", kind: "reminder", title: "Drink a glass of water", body: "Reminder · 10:04 AM",
    data: { item_id: "3100e28d", recurring: false },
    actions: [
      { id: "done", label: "Done", style: "primary", kind: "act" },
      { id: "snooze_10m", label: "10 min", kind: "act" },
      { id: "snooze_1h", label: "1 hour", kind: "act" },
      { id: "snooze_tomorrow", label: "Tomorrow", kind: "act" },
    ],
    created_at: "2026-10-04T10:04:00+07:00",
  };

  test("a reminder card is drawn, with all four of its act buttons", () => {
    const c = normalizeCard(reminder);
    expect(c?.kind).toBe("reminder");
    expect(c?.actions?.map((a) => [a.id, a.kind])).toEqual([["done", "act"], ["snooze_10m", "act"], ["snooze_1h", "act"], ["snooze_tomorrow", "act"]]);
    expect(c?.created_at).toBe(Date.parse("2026-10-04T10:04:00+07:00"));
  });

  test("the morning digest keeps its list and its reply and dismiss buttons", () => {
    const c = normalizeCard({
      id: "card_b968", kind: "digest", title: "This morning", data: { sources: ["followup:decision"] },
      actions: [{ id: "item_0", label: "Help me decide", kind: "reply", text: "Help me decide on a compute platform." }, { id: "dismiss", label: "Got it", kind: "dismiss" }],
      blocks: [{ type: "list", items: [{ title: "You said you'd build the A" }] }],
    });
    expect(c?.kind).toBe("digest");
    expect(c?.blocks).toHaveLength(1);
    expect(c?.actions?.map((a) => a.kind)).toEqual(["reply", "dismiss"]);
  });

  test("a button that is none of act, reply or dismiss is not drawn on a choice card", () => {
    const c = normalizeCard({ ...reminder, actions: [{ id: "x", label: "Do it" }, { id: "done", label: "Done", kind: "act" }] });
    expect(c?.actions?.map((a) => a.id)).toEqual(["done"]);
  });

  test("a presented card can never carry an act: only the Pod's own kinds may", () => {
    const c = normalizeCard({
      id: "p1", kind: "present", title: "T", blocks: [{ type: "text", text: "hi" }],
      actions: [{ id: "a", label: "Run", kind: "act" }, { id: "b", label: "Not now", kind: "dismiss" }],
    });
    expect(c?.actions?.map((a) => a.id)).toEqual(["b"]);
  });

  test("older cards keep their broker-bound buttons", () => {
    const c = normalizeCard({ id: "s1", kind: "suggestion", title: "Heads up", request_id: "r1", actions: [{ id: "approve", label: "Do it", request_id: "r1" }] });
    expect(c?.actions?.[0]).toMatchObject({ id: "approve", request_id: "r1" });
  });

  test("which cards keep a receipt once answered", () => {
    expect(keepsReceipt({ kind: "reminder" })).toBe(true);
    expect(keepsReceipt({ kind: "digest" })).toBe(true);
    expect(keepsReceipt({ kind: "present" })).toBe(true);
    expect(keepsReceipt({ kind: "suggestion" })).toBe(false);
  });
});
