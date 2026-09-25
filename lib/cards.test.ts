import { describe, expect, test } from "bun:test";
import { parseCardMessage } from "./cards";
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
