import { describe, expect, test } from "bun:test";
import { riskCaution, riskNote } from "./permission-risk";

describe("riskNote", () => {
  test("high-impact warns it is hard to undo", () => {
    expect(riskNote("high_impact")).toContain("hard to undo");
  });
  test("consequential explains Ghost asks before acting", () => {
    expect(riskNote("consequential")).toContain("acts on your behalf");
  });
  test("low-risk explains it can be made permanent", () => {
    expect(riskNote("low_risk")).toContain("always");
  });
  test("unknown risk yields no note rather than a vague one", () => {
    expect(riskNote("")).toBeNull();
    expect(riskNote(undefined)).toBeNull();
    expect(riskNote("weird")).toBeNull();
  });
});

describe("riskCaution", () => {
  test("unknown risk gets an explicit caution", () => {
    expect(riskCaution("")).toContain("couldn't classify");
    expect(riskCaution(undefined)).toContain("couldn't classify");
    expect(riskCaution("weird")).toContain("couldn't classify");
  });

  test("classified risk gets no caution", () => {
    expect(riskCaution("high_impact")).toBeNull();
    expect(riskCaution("consequential")).toBeNull();
    expect(riskCaution("low_risk")).toBeNull();
  });
});
