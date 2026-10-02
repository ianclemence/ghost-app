import { describe, expect, test } from "bun:test";
import {
  displayStatusForTool,
  safeStatusLabel,
  statusPhaseForTool,
  statusText,
} from "./statusPhase";

describe("statusPhaseForTool", () => {
  test("memory tools collapse to Checking memory", () => {
    for (const t of ["remember", "memory_recall", "memory_curate", "context_get", "session_search"]) {
      expect(statusPhaseForTool(t)).toBe("Checking memory");
    }
  });

  test("search and page tools get their own phases", () => {
    expect(statusPhaseForTool("web_search")).toBe("Searching the web");
    expect(statusPhaseForTool("web_fetch")).toBe("Reading the page");
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

describe("safeStatusLabel", () => {
  test("plain word labels pass", () => {
    expect(safeStatusLabel("Saved on this phone")).toBe("Saved on this phone");
    expect(safeStatusLabel("Thinking")).toBe("Thinking");
  });

  test("machinery is rejected", () => {
    for (const bad of [
      "Running: ls -la",
      "Reading notes.md",
      "/home/user/notes.md",
      "exec",
      "read_file",
      "https://example.com/a",
      "Using some_new_tool…",
      "C:/Users/x",
    ]) {
      expect(safeStatusLabel(bad)).toBe("");
    }
  });

  test("empty and oversized labels are rejected", () => {
    expect(safeStatusLabel(null)).toBe("");
    expect(safeStatusLabel(undefined)).toBe("");
    expect(safeStatusLabel("x".repeat(80))).toBe("");
  });
});

describe("displayStatusForTool", () => {
  test("says a browser step is the browser", () => {
    expect(displayStatusForTool("browser_navigate", "Opening a page")).toBe("Using the browser");
  });
  test("a known tool wins over any server label", () => {
    expect(displayStatusForTool("web_search", "Running: ls")).toBe("Searching the web");
  });

  test("an unknown tool may use a clean server label", () => {
    expect(displayStatusForTool("mystery_tool", "Saved on this phone")).toBe("Saved on this phone");
  });

  test("an unknown tool with a dirty label falls back calmly", () => {
    expect(displayStatusForTool("mystery_tool", "Running: ls -la")).toBe("Working on it");
    expect(displayStatusForTool("mystery_tool")).toBe("Working on it");
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
