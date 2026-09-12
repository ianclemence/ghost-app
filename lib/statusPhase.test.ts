import { describe, expect, test } from "bun:test";
import { statusPhaseForTool, statusText } from "./statusPhase";

describe("statusPhaseForTool", () => {
  test("memory tools collapse to Checking memory", () => {
    for (const t of ["remember", "memory_recall", "memory_curate", "context_get", "session_search"]) {
      expect(statusPhaseForTool(t)).toBe("Checking memory");
    }
  });

  test("web tools collapse to Searching the web", () => {
    expect(statusPhaseForTool("web_search")).toBe("Searching the web");
    expect(statusPhaseForTool("web_fetch")).toBe("Searching the web");
  });

  test("everything else is Working on it, never a raw path", () => {
    expect(statusPhaseForTool("read_file")).toBe("Working on it");
    expect(statusPhaseForTool("exec")).toBe("Working on it");
    expect(statusPhaseForTool("schedule")).toBe("Working on it");
    expect(statusPhaseForTool("WEATHER_NOW")).toBe("Working on it");
  });

  test("empty/blank tool has no phase", () => {
    expect(statusPhaseForTool("")).toBeNull();
    expect(statusPhaseForTool("   ")).toBeNull();
  });
});

describe("statusText", () => {
  test("content present means no status line", () => {
    expect(statusText("web_search", true)).toBe("");
  });
  test("empty content falls back to Thinking without a tool", () => {
    expect(statusText(null, false)).toBe("Thinking");
  });
  test("empty content maps the tool", () => {
    expect(statusText("remember", false)).toBe("Checking memory");
  });
});
