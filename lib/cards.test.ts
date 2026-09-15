import { describe, expect, test } from "bun:test";
import { parseCardMessage } from "./cards";
import type { WSMessage } from "./ghostApi";

const frame = (meta: Record<string, unknown>, type?: string): WSMessage =>
  ({ type, metadata: meta }) as WSMessage;

describe("parseCardMessage", () => {
  test("accepts suggestion cards on the current session", () => {
    const c = parseCardMessage(
      frame({ type: "card_update", session_id: "mobile:default", card_kind: "suggestion", card_id: "c1", title: "Heads up" }, "card_update"),
      "mobile:default",
    );
    expect(c?.id).toBe("c1");
    expect(c?.kind).toBe("suggestion");
  });

  test("accepts channel-level cards without session", () => {
    const c = parseCardMessage(
      frame({ type: "card_update", card_kind: "goal_update", card_id: "c2", title: "Goal done" }),
      "mobile:default",
    );
    expect(c?.id).toBe("c2");
  });

  test("rejects unknown kinds", () => {
    expect(
      parseCardMessage(
        frame({ type: "card_update", card_kind: "checkout_sheet", card_id: "c3", title: "Pay" }),
        "mobile:default",
      ),
    ).toBeNull();
  });

  test("rejects other sessions and missing title", () => {
    expect(
      parseCardMessage(
        frame({ type: "card_update", session_id: "other", card_kind: "suggestion", card_id: "c4", title: "Hi" }),
        "mobile:default",
      ),
    ).toBeNull();
    expect(
      parseCardMessage(
        frame({ type: "card_update", card_kind: "suggestion", card_id: "c5" }),
        "mobile:default",
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
      "mobile:default",
    );
    expect(c?.actions?.length).toBeLessThanOrEqual(4);
    expect(c?.actions?.[1]?.request_id).toBe("r1");
  });
});
