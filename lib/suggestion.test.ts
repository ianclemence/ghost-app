import { describe, expect, test } from "bun:test";
import { shouldAskForSuggestion, showSuggestion, SUGGESTION_MAX, usableSuggestion } from "./suggestion";

describe("usableSuggestion", () => {
  test("keeps one short line and drops everything else", () => {
    expect(usableSuggestion("  Yes,   move it ")).toBe("Yes, move it");
    expect(usableSuggestion("")).toBe("");
    expect(usableSuggestion("x")).toBe("");
    expect(usableSuggestion("a".repeat(SUGGESTION_MAX + 1))).toBe("");
    expect(usableSuggestion(null)).toBe("");
    expect(usableSuggestion(42)).toBe("");
  });
});

describe("shouldAskForSuggestion", () => {
  const base = { online: true, streaming: false, lastRole: "assistant" as const };
  test("asks when Ghost has just spoken and is idle", () => {
    expect(shouldAskForSuggestion(base)).toBe(true);
  });
  test("stays quiet when it is not Ghost's turn to have spoken, or Ghost is busy or away", () => {
    expect(shouldAskForSuggestion({ ...base, lastRole: "user" })).toBe(false);
    expect(shouldAskForSuggestion({ ...base, lastRole: undefined })).toBe(false);
    expect(shouldAskForSuggestion({ ...base, streaming: true })).toBe(false);
    expect(shouldAskForSuggestion({ ...base, online: false })).toBe(false);
    expect(shouldAskForSuggestion({ ...base, lastStatus: "streaming" })).toBe(false);
  });
});

describe("showSuggestion", () => {
  test("only over an empty, idle bar", () => {
    expect(showSuggestion({ suggestion: "Yes", draft: "", streaming: false })).toBe(true);
    expect(showSuggestion({ suggestion: "Yes", draft: "hello", streaming: false })).toBe(false);
    expect(showSuggestion({ suggestion: "Yes", draft: "  ", streaming: false })).toBe(true);
    expect(showSuggestion({ suggestion: "", draft: "", streaming: false })).toBe(false);
    expect(showSuggestion({ suggestion: "Yes", draft: "", streaming: true })).toBe(false);
    expect(showSuggestion({ suggestion: "Yes", draft: "", streaming: false, recording: true })).toBe(false);
  });
});
