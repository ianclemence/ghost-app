import { describe, expect, test } from "bun:test";

const { isQuarantinedChunk, parseStreamLine } = await import("./ghostApi");

describe("parseStreamLine", () => {
  test("passes text deltas through as content", () => {
    const ev = parseStreamLine('data: "hello world"');
    expect(ev).toEqual({ kind: "text", text: "hello world" });
  });

  test("recognizes terminal done", () => {
    expect(parseStreamLine("data: [DONE]")).toEqual({ kind: "done" });
  });

  test("skips keepalives and non-data lines", () => {
    expect(parseStreamLine(": keepalive").kind).toBe("keepalive");
    expect(parseStreamLine("event: message").kind).toBe("skip");
    expect(parseStreamLine("").kind).toBe("skip");
  });

  test("routes lifecycle frames with authoritative outcomes", () => {
    const ev = parseStreamLine(
      'data: {"type":"lifecycle","request_id":"r1","state":"completed","outcome":"waiting_for_permission"}',
      "fallback",
    );
    expect(ev).toEqual({
      kind: "lifecycle",
      requestId: "r1",
      state: "completed",
      outcome: "waiting_for_permission",
    });
  });

  test("non-terminal lifecycle carries no outcome", () => {
    const ev = parseStreamLine('data: {"type":"lifecycle","request_id":"r1","state":"agent_processing"}');
    expect(ev.kind).toBe("lifecycle");
    if (ev.kind === "lifecycle") {
      expect(ev.outcome).toBeNull();
      expect(ev.state).toBe("agent_processing");
    }
  });

  test("unknown outcome values never become client state", () => {
    const ev = parseStreamLine(
      'data: {"type":"lifecycle","request_id":"r1","state":"completed","outcome":"teleported"}',
    );
    expect(ev.kind).toBe("lifecycle");
    if (ev.kind === "lifecycle") {
      expect(ev.outcome).toBeNull();
    }
  });

  test("routes tool status without content", () => {
    const ev = parseStreamLine('data: {"type":"tool_status","tool":"search","label":"Searching"}');
    expect(ev).toEqual({ kind: "tool", tool: "search", label: "Searching" });
  });

  test("routes valid clarification requests", () => {
    const ev = parseStreamLine(
      'data: {"type":"clarify_request","question_id":"q1","question":"Which one?","choices":["a"],"request_id":"r1"}',
      "fallback",
    );
    expect(ev.kind).toBe("clarify");
    if (ev.kind === "clarify") {
      expect(ev.questionId).toBe("q1");
      expect(ev.question).toBe("Which one?");
      expect(ev.choices).toEqual(["a"]);
    }
  });

  test("drops malformed clarification without content", () => {
    expect(parseStreamLine('data: {"type":"clarify_request","question":"No id"}').kind).toBe("unknown");
    expect(parseStreamLine('data: {"type":"something_new","x":1}').kind).toBe("unknown");
  });

  test("malformed frames never become content", () => {
    const ev = parseStreamLine("data: {not json");
    expect(ev).toEqual({ kind: "raw", text: "{not json" });
  });
});

describe("isQuarantinedChunk", () => {
  test("quarantines tool-internals echo", () => {
    expect(isQuarantinedChunk("fetching https://example.com/x")).toBe(true);
    expect(isQuarantinedChunk("see workspace/skills/foo/skill.md")).toBe(true);
    expect(isQuarantinedChunk("")).toBe(true);
  });

  test("keeps genuine prose and markdown links", () => {
    expect(isQuarantinedChunk("Here are the hotels you asked for.")).toBe(false);
    expect(isQuarantinedChunk("Details are [here](https://example.com/x) for you")).toBe(false);
  });
});
