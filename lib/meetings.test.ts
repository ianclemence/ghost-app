import { describe, expect, test } from "bun:test";
import { clockOf, meetingStatus, pieces, summarizePrompt } from "./meetings";

describe("a recording in pieces", () => {
  test("every piece decodes on its own and they join back to the whole", () => {
    const bytes = new Uint8Array(10_000).map((_, i) => (i * 7) % 256);
    const b64 = Buffer.from(bytes).toString("base64");
    const parts = pieces(b64, 3000);
    expect(parts.length).toBe(4);
    for (const p of parts) expect(p.length % 4).toBe(0);
    const joined = Buffer.concat(parts.map((p) => Buffer.from(p, "base64")));
    expect(Buffer.compare(joined, Buffer.from(bytes))).toBe(0);
  });
  test("the default piece is under the Pod's 2 MB", () => {
    const b64 = "A".repeat(10_000_000);
    for (const p of pieces(b64)) expect((p.length / 4) * 3).toBeLessThanOrEqual(2 * 1024 * 1024);
  });
});

describe("what a recording says", () => {
  test("clock, status, the summary ask", () => {
    expect(clockOf(65)).toBe("1:05");
    expect(clockOf(3725)).toBe("1:02:05");
    expect(meetingStatus({ state: "transcribing", parts: 8, part_done: 3 })).toBe("Transcribing on your Pod · 3 of 8");
    expect(meetingStatus({ state: "done", seconds: 840, words: 2104 })).toBe("14 min · 2,104 words");
    expect(meetingStatus({ state: "failed", error: "no speech could be heard in the recording" })).toBe("Didn't work: no speech could be heard in the recording");
    expect(summarizePrompt({ title: "Standup", seconds: 840, transcript: "meetings/x.md" })).toContain("at meetings/x.md");
  });
});
