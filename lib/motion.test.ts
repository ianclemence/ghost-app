import { describe, expect, test } from "bun:test";
import { clock, isMotionArtifact, isMotionVideo, motionFields, setField } from "./motion";
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
});
