import { describe, expect, test } from "bun:test";
import contract from "./cards-contract.json";
import { normalizeCard } from "./cards";
import { parseBlock } from "./blocks";

// The same file the Pod tests (pkg/cards/testdata/blocks_contract.json): what
// the Pod accepts the phone must draw with the same blocks, and nothing the Pod
// refuses may ever put an empty or unsafe card on screen.
type Spec = Record<string, unknown>;
const asCard = (spec: Spec) => normalizeCard({ id: "card_1", ...spec, created_at: 1_700_000_000 });

describe("contract: cards the Pod accepts", () => {
  for (const c of contract.valid) {
    test(c.name, () => {
      const card = asCard(c.spec as Spec);
      expect(card).not.toBeNull();
      expect(card!.blocks).toHaveLength(c.blocks);
      // Choices survive intact; a presented card only ever has reply or dismiss.
      const offered = ((c.spec as Spec).actions as unknown[] | undefined) ?? [];
      expect(card!.actions).toHaveLength(offered.length);
      for (const a of card!.actions ?? []) expect(["reply", "dismiss"]).toContain(a.kind as string);
    });
  }
});

describe("contract: cards the Pod refuses", () => {
  for (const c of contract.invalid) {
    test(c.name, () => {
      let card: ReturnType<typeof asCard> = null;
      expect(() => { card = asCard(c.spec as Spec); }).not.toThrow();
      if (card) {
        // If anything is drawn, it is only what the phone knows how to draw.
        const kinds = ["present", "goal_update", "suggestion", "cart", "browser_view", "memory_receipt", "browser_recovery"];
        expect(kinds).toContain((card as { kind: string }).kind);
        for (const a of (card as { actions?: { kind?: string; request_id?: string }[] }).actions ?? []) {
          if ((card as { kind: string }).kind === "present") {
            expect(a.request_id).toBeUndefined();
            expect(["reply", "dismiss"]).toContain(a.kind as string);
          }
        }
      }
    });
  }

  test("an unknown kind, a missing title and an empty presented card are never drawn", () => {
    for (const name of ["unknown kind", "no blocks", "no title", "unknown block type", "empty text"]) {
      const c = contract.invalid.find((x) => x.name === name)!;
      expect(asCard(c.spec as Spec)).toBeNull();
    }
  });
});

describe("blocks are cut to the Pod's limits and never throw", () => {
  test("a hostile block is made safe or dropped", () => {
    expect(parseBlock({ type: "text", text: "x".repeat(5000) })).toEqual({ type: "text", text: "x".repeat(400) });
    expect(parseBlock({ type: "iframe", src: "https://evil.example" })).toBeNull();
    expect(parseBlock({ type: "progress", label: "p", progress: 7 })).toEqual({ type: "progress", label: "p", progress: 1, caption: undefined });
    expect(parseBlock({ type: "progress", label: "p", progress: "half" })).toBeNull();
    expect(parseBlock({ type: "note", text: "hi", tone: "rainbow" })).toEqual({ type: "note", text: "hi", tone: "neutral" });
    expect(parseBlock(null)).toBeNull();
    expect(parseBlock("text")).toBeNull();
    expect(parseBlock({ type: "facts", rows: "nope" })).toBeNull();
    expect(parseBlock({ type: "code", language: "bash; rm -rf", code: "ls" })).toEqual({ type: "code", language: "", code: "ls" });
  });

  test("the numbers match the Pod's", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ title: `t${i}` }));
    expect((parseBlock({ type: "list", items: many }) as { items: unknown[] }).items).toHaveLength(12);
    const rows = Array.from({ length: 30 }, (_, i) => ({ label: `l${i}`, value: "v" }));
    expect((parseBlock({ type: "facts", rows }) as { rows: unknown[] }).rows).toHaveLength(10);
    const steps = Array.from({ length: 30 }, (_, i) => ({ title: `s${i}` }));
    expect((parseBlock({ type: "timeline", steps }) as { steps: unknown[] }).steps).toHaveLength(8);
  });
});

describe("older cards are unchanged", () => {
  test("a suggestion keeps its broker-bound action and gets no blocks", () => {
    const c = normalizeCard({ card_id: "c1", card_kind: "suggestion", title: "Heads up", actions: [{ id: "a", label: "Yes", request_id: "r1" }] });
    expect(c?.blocks).toBeUndefined();
    expect(c?.actions?.[0].request_id).toBe("r1");
  });
});
