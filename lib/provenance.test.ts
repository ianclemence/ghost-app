import { describe, expect, test } from "bun:test";

const { originBadge, parseOrigin } = await import("./provenance");

describe("parseOrigin", () => {
  test("recognizes the runtime's routing labels", () => {
    expect(parseOrigin("Answered by home Pod")).toBe("pod");
    expect(parseOrigin("Answered via Pod cloud · keys stayed on Pod")).toBe("cloud");
    expect(parseOrigin("Answering on this phone · will sync when Pod is back")).toBe("phone");
  });

  test("unknown or empty labels stay unknown", () => {
    expect(parseOrigin("Searching…")).toBeNull();
    expect(parseOrigin("")).toBeNull();
    expect(parseOrigin(null)).toBeNull();
    expect(parseOrigin(undefined)).toBeNull();
  });

  test("cloud wins when both words appear", () => {
    expect(parseOrigin("Answered via Pod cloud")).toBe("cloud");
  });
});

describe("originBadge", () => {
  test("formats the quiet per-bubble badge", () => {
    expect(originBadge("pod", false)).toBe("Answered by home Pod");
    expect(originBadge("cloud", false)).toBe("Answered via Pod cloud · keys stayed on Pod");
    expect(originBadge("phone", false)).toBe("Answered on this phone");
    expect(originBadge("phone", true)).toBe("Answered on this phone · will sync");
  });

  test("unknown origin renders no badge", () => {
    expect(originBadge(null, false)).toBeNull();
    expect(originBadge(undefined, false)).toBeNull();
  });
});
