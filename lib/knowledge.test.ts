import { describe, expect, test } from "bun:test";
import { dueText, fraction, progressText, sections } from "./knowledge";

describe("knowledge", () => {
  test("says where you are", () => {
    expect(progressText({ current: 140, total: 443, unit: "page" })).toBe("Page 140 of 443");
    expect(progressText({ current: 6, unit: "lesson" })).toBe("Lesson 6");
    expect(progressText({ current: 40, unit: "percent" })).toBe("40%");
    expect(progressText({ total: 320, unit: "page" })).toBe("320 pages");
    expect(progressText({})).toBeNull();
  });
  test("how far along", () => {
    expect(fraction({ current: 110, total: 440, unit: "page", status: "active" })).toBe(0.25);
    expect(fraction({ current: 3, unit: "lesson", status: "active" })).toBeNull();
    expect(fraction({ status: "done" })).toBe(1);
  });
  test("when something is due", () => {
    const now = new Date(2026, 9, 9, 10);
    expect(dueText("2026-10-15", now)).toEqual({ text: "Due in 6 days", tone: "warn" });
    expect(dueText("2026-10-10", now)?.text).toBe("Due tomorrow");
    expect(dueText("2026-10-07", now)).toEqual({ text: "Was due 2 days ago", tone: "bad" });
  });
  test("sections in order, empty ones left out", () => {
    const mk = (status: "want" | "active" | "done") => ({ id: status, status }) as never;
    expect(sections([mk("done"), mk("active")]).map((s) => s.title)).toEqual(["Reading and studying", "Finished"]);
  });
});
