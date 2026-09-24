import { describe, expect, test } from "bun:test";
import {
  applyBackgroundEvent,
  backgroundDoneContent,
  backgroundSessionMatches,
  formatBackgroundElapsed,
  type BackgroundRunningTask,
} from "./background";

const MAIN = "main";

describe("backgroundSessionMatches", () => {
  test("untagged events are accepted", () => {
    expect(backgroundSessionMatches("", MAIN)).toBe(true);
  });
  test("matching session accepted", () => {
    expect(backgroundSessionMatches("main", MAIN)).toBe(true);
  });
  test("other threads never render here", () => {
    expect(backgroundSessionMatches("cli:123", MAIN)).toBe(false);
  });
});

describe("formatBackgroundElapsed", () => {
  test("seconds", () => {
    expect(formatBackgroundElapsed(0, 42000)).toBe("42s");
  });
  test("minutes", () => {
    expect(formatBackgroundElapsed(0, 185000)).toBe("3m05s");
  });
});

describe("backgroundDoneContent", () => {
  test("success carries findings", () => {
    expect(backgroundDoneContent("dig", true, "found it", 5000)).toBe("✓ dig · done in 5s\n\nfound it");
  });
  test("failure is stated plainly", () => {
    const c = backgroundDoneContent("dig", false, "boom", 5000);
    expect(c.startsWith("✗ dig · failed after 5s")).toBe(true);
    expect(c).not.toContain("done in");
  });
  test("empty findings leave the status line alone", () => {
    expect(backgroundDoneContent("dig", true, "  ", 1000)).toBe("✓ dig · done in 1s");
  });
});

describe("applyBackgroundEvent", () => {
  test("started adds a running row", () => {
    const { running, append } = applyBackgroundEvent([], { type: "background_started", metadata: { session_id: "main", label: "dig" } }, MAIN, 1000);
    expect(append).toBeUndefined();
    expect(running).toHaveLength(1);
    expect(running[0].label).toBe("dig");
    expect(running[0].startedAt).toBe(1000);
  });
  test("started is idempotent per label", () => {
    const one: BackgroundRunningTask[] = [{ key: "k", label: "dig", startedAt: 1 }];
    const { running } = applyBackgroundEvent(one, { type: "background_started", metadata: { label: "dig" } }, MAIN, 2);
    expect(running).toHaveLength(1);
  });
  test("done removes and appends findings", () => {
    const one: BackgroundRunningTask[] = [{ key: "k", label: "dig", startedAt: 1 }];
    const { running, append } = applyBackgroundEvent(
      one,
      { type: "background_done", content: "dug up", metadata: { session_id: "main", label: "dig", ok: true, elapsed_ms: 9000 } },
      MAIN, 10000,
    );
    expect(running).toHaveLength(0);
    expect(append?.ok).toBe(true);
    expect(append?.content).toBe("✓ dig · done in 9s\n\ndug up");
  });
  test("done for unknown label still appends (delivery over tracking)", () => {
    const { append } = applyBackgroundEvent([], { type: "background_done", content: "x", metadata: { label: "dig", ok: true } }, MAIN, 1);
    expect(append?.content.startsWith("✓ dig")).toBe(true);
  });
  test("other sessions ignored", () => {
    const { running, append } = applyBackgroundEvent([], { type: "background_started", metadata: { session_id: "cli:9", label: "dig" } }, MAIN, 1);
    expect(running).toHaveLength(0);
    expect(append).toBeUndefined();
  });
  test("unknown types ignored", () => {
    const { running, append } = applyBackgroundEvent([], { type: "clarify_request" }, MAIN, 1);
    expect(running).toHaveLength(0);
    expect(append).toBeUndefined();
  });
});
