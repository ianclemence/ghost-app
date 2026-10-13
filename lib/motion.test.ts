import { describe, expect, test } from "bun:test";
import { captionsPath, clock, cueText, isMotionArtifact, isMotionVideo, motionFields, motionStoryFields, sceneCues, setField, studioCheck } from "./motion";
import type { MotionSpec } from "./ghostApi";

const spec: MotionSpec = {
  title: "Q3",
  scenes: [
    { duration: 3, elements: [{ type: "title", text: "Q3 at the bakery", sub: "In numbers" }] },
    { duration: 4, caption: "From the till", elements: [{ type: "number", to: 1240500, prefix: "KES ", label: "Sales" }, { type: "bars", labels: ["Croissants", "Sourdough"], values: [412, 380], at: 1 }] },
  ],
};

describe("motion", () => {
  test("knows a motion and its video", () => {
    expect(isMotionArtifact({ kind: "file", state: "available", path: "motion/q3-v2.json" })).toBe(true);
    expect(isMotionArtifact({ kind: "file", state: "available", path: "canvas/q3-v2.html" })).toBe(false);
    expect(isMotionVideo({ path: "motion/q3-v2.mp4" })).toBe(true);
  });
  test("every word, number and timing is a field", () => {
    const f = motionFields(spec);
    expect(f[0].title).toBe("Q3 at the bakery");
    const labels = f[1].fields.map((x) => x.label);
    expect(labels).toContain("Seconds");
    expect(labels).toContain("Number: number");
    expect(labels).toContain("Bars: Croissants");
    expect(labels).toContain("Bars: enters at (s)");
    expect(labels).toContain("Caption");
  });
  test("a field is set, and checked", () => {
    const f = motionFields(spec)[1].fields;
    const num = f.find((x) => x.label === "Number: number")!;
    const r = setField(spec, num, "1,300,000");
    expect("spec" in r && r.spec.scenes[1].elements[0].to).toBe(1300000);
    expect(spec.scenes[1].elements[0].to).toBe(1240500);
    expect(setField(spec, num, "lots")).toEqual({ error: "That isn't a number." });
    const secs = f.find((x) => x.label === "Seconds")!;
    expect(setField(spec, secs, "40")).toEqual({ error: "A scene lasts 1 to 20 seconds." });
    const bar = f.find((x) => x.label === "Bars: name 2")!;
    const r2 = setField(spec, bar, "Rye");
    expect("spec" in r2 && r2.spec.scenes[1].elements[1].labels).toEqual(["Croissants", "Rye"]);
    expect(clock(23.4)).toBe("0:23");
  });
  test("studio scenes carry teaches, voice, sound and check", () => {
    const f = motionFields(spec);
    const labels = f[0].fields.map((x) => x.label);
    expect(labels).toContain("Teaches");
    expect(labels).toContain("Voice");
    expect(labels).toContain("Sound cue");
    expect(labels).toContain("Viewer can now say");
    expect(f[0].focus).toBeNull();
  });
  test("the brief is fields, and set", () => {
    const s = motionStoryFields(spec);
    expect(s.map((x) => x.label)).toEqual(["Question", "Audience", "Outcome", "Hook (the wrong belief)", "Sources (one per line)"]);
    const q = s.find((x) => x.label === "Question")!;
    const r = setField(spec, q, "Why did profit fall?");
    expect("spec" in r && r.spec.question).toBe("Why did profit fall?");
    expect(setField(spec, q, "x".repeat(141))).toEqual({ error: "One short line — 140 characters at most." });
    const src = s.find((x) => x.label === "Sources (one per line)")!;
    const r2 = setField(spec, src, "Till exports\nSep counts\n\n");
    expect("spec" in r2 && r2.spec.sources).toEqual(["Till exports", "Sep counts"]);
    const voice = motionFields(spec)[0].fields.find((x) => x.label === "Voice")!;
    expect(setField(spec, voice, Array(50).fill("word").join(" "))).toEqual({ error: "Spoken, so 48 words at most — the rest is cut." });
    const vr = setField(spec, voice, "Sales rose.");
    expect("spec" in vr && vr.spec.scenes[0].voice).toBe("Sales rose.");
  });
  test("cues prefer voice, then caption, then words", () => {
    expect(cueText(spec.scenes[0])).toBe("Q3 at the bakery — In numbers");
    const voiced: MotionSpec = JSON.parse(JSON.stringify(spec));
    voiced.scenes[0].voice = "The till was busy.";
    expect(cueText(voiced.scenes[0])).toBe("The till was busy.");
    expect(sceneCues(spec).length).toBe(2);
    expect(captionsPath("motion/q3-v2.json")).toBe("motion/q3-v2.srt");
    expect(captionsPath("motion/q3-v2.mp4")).toBe("");
  });
  test("the studio check passes and fails in words", () => {
    const legacy = studioCheck(spec);
    expect(legacy.ok).toBe(true);
    const studio: MotionSpec = {
      title: "Why",
      question: "Why did profit fall?",
      sources: ["Till exports"],
      scenes: [
        { duration: 3, teaches: "Busy is not rich", voice: "The till was busy, so why did profit fall?", elements: [{ type: "title", text: "Busy?" }] },
        { duration: 3, teaches: "Costs ate it", caption: "Till exports", elements: [{ type: "compare", labels: ["Sales", "Profit"], values: [141, 88], focus: true }] },
        { duration: 3, teaches: "Watch costs", voice: "Watch the costs.", elements: [{ type: "text", text: "Watch the costs" }] },
      ],
    };
    const v = studioCheck(studio);
    expect(v.ok).toBe(true);
    expect(v.passed.join(";")).toContain("Every number has a source");
    const bad: MotionSpec = JSON.parse(JSON.stringify(studio));
    bad.scenes[1].elements.push({ type: "text", text: "Also this", focus: true });
    const b = studioCheck(bad);
    expect(b.ok).toBe(false);
    expect(b.failed.join(";")).toContain("two focal actions");
  });
  test("captions gate only when asked", () => {
    // No captions: a scene with no words at all still passes the cue gates.
    const quiet: MotionSpec = { title: "Q", scenes: [{ duration: 3, elements: [{ type: "bars", labels: ["A", "B"], values: [1, 2] }] }] };
    const q = studioCheck(quiet);
    expect(q.ok).toBe(true);
    expect(q.passed.join(";")).toContain("Captions off");
    // Asked for: the same scene fails for want of a cue.
    const loud: MotionSpec = { ...quiet, captions: "on" };
    const l = studioCheck(loud);
    expect(l.ok).toBe(false);
    expect(l.failed.join(";")).toContain("A cue at every beat");
  });
});
