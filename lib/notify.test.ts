import { describe, expect, test } from "bun:test";

const { notificationCopyFor, notificationKeyFor } = await import("./notify");

describe("notificationCopyFor", () => {
  test("assistant messages use fixed product copy without content", () => {
    const copy = notificationCopyFor({
      id: "m1",
      type: "assistant_message",
      content: "Your password is hunter2 and the vault holds X",
    });
    expect(copy).toEqual({ title: "Ghost", body: "Ghost needs your attention." });
  });

  test("clarification uses the question prompt copy", () => {
    const copy = notificationCopyFor({ id: "q1", type: "clarify_request", content: "Which Sarah?" });
    expect(copy).toEqual({ title: "Ghost", body: "Ghost has a question for you." });
  });

  test("internal frames never notify", () => {
    expect(notificationCopyFor({ type: "tool_status", content: "x" })).toBeNull();
    expect(notificationCopyFor({ type: "lifecycle", content: "x" })).toBeNull();
    expect(notificationCopyFor({ content: "x" })).toBeNull();
  });

  test("surface and artifact flows stay out of the tray", () => {
    expect(
      notificationCopyFor({ type: "surface_update", metadata: { surface_id: "s1" } }),
    ).toBeNull();
  });
});

describe("notificationKeyFor", () => {
  test("prefers stable backend ids", () => {
    expect(notificationKeyFor({ id: "abc" })).toBe("abc");
    expect(
      notificationKeyFor({ metadata: { request_id: "r1" }, timestamp: 42 }),
    ).toBe("r1:42");
  });

  test("refuses to invent identity from timing alone", () => {
    expect(notificationKeyFor({ timestamp: 42 })).toBeNull();
    expect(notificationKeyFor({})).toBeNull();
  });
});
