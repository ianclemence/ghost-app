import { describe, expect, test } from "bun:test";
import { jobWhen } from "./jobs";

describe("jobs", () => {
  test("say when they run at the owner's time", () => {
    expect(jobWhen({ when: "Every morning", time: "07:30", settings: { time: "06:45" } })).toBe("Every morning at 06:45");
    expect(jobWhen({ when: "Every morning", time: "07:30", settings: {} })).toBe("Every morning at 07:30");
    expect(jobWhen({ when: "Whenever you ask", settings: {} })).toBe("Whenever you ask");
  });
});
