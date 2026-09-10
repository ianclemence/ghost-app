import { describe, expect, test } from "bun:test";

const { artifactActionsOf, artifactViewOf, mergeArtifacts, unavailableReasonOf } =
  await import("./artifacts");

function artifact(over: Record<string, unknown> = {}) {
  return {
    id: "art-1",
    kind: "file",
    title: "Report",
    state: "available",
    actions: [{ id: "preview", label: "Preview", kind: "preview" }],
    ...over,
  } as Parameters<typeof artifactViewOf>[0];
}

describe("artifactViewOf", () => {
  test("selects known renderers, falls back safely", () => {
    expect(artifactViewOf(artifact())).toBe("file");
    expect(artifactViewOf(artifact({ kind: "text" }))).toBe("text");
    expect(artifactViewOf(artifact({ kind: "link" }))).toBe("link");
    expect(artifactViewOf(artifact({ kind: "executable" }))).toBe("unknown");
  });
});

describe("artifactActionsOf", () => {
  test("unavailable artifacts offer nothing", () => {
    expect(artifactActionsOf(artifact({ state: "unavailable", reason: "gone" }))).toEqual([]);
  });

  test("unknown action kinds are filtered, never invented", () => {
    const a = artifact({
      actions: [
        { id: "preview", label: "Preview", kind: "preview" },
        { id: "exec", label: "Run", kind: "execute" },
        { id: "", label: "", kind: "preview" },
      ],
    });
    expect(artifactActionsOf(a)).toEqual([{ id: "preview", label: "Preview", kind: "preview" }]);
  });
});

describe("unavailableReasonOf", () => {
  test("uses backend reason or safe fallback", () => {
    expect(unavailableReasonOf(artifact({ state: "unavailable", reason: "moved" }))).toBe("moved");
    expect(unavailableReasonOf(artifact({ state: "unavailable" }))).toBe("This is no longer available.");
    expect(unavailableReasonOf(artifact())).toBe("");
  });
});

describe("mergeArtifacts", () => {
  test("dedups by id across refreshes", () => {
    const merged = mergeArtifacts([artifact()], [artifact(), artifact({ id: "art-2" })]);
    expect(merged.map((a) => a.id)).toEqual(["art-1", "art-2"]);
  });
});
