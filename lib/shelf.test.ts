import { describe, expect, test } from "bun:test";
import { shelfKindOf, shelfMeta } from "./shelf";
import { hasWordCopy, isDocumentArtifact } from "./documents";

describe("the shelf names what Ghost made", () => {
  test("each thing is one kind", () => {
    expect(shelfKindOf({ kind: "file", path: "canvas/pong-v2.html" })).toBe("pages");
    expect(shelfKindOf({ kind: "file", path: "documents/cv-v1.pdf" })).toBe("documents");
    expect(shelfKindOf({ kind: "file", path: "shots/a.JPG" })).toBe("pictures");
    expect(shelfKindOf({ kind: "link", path: undefined })).toBe("links");
    expect(shelfKindOf({ kind: "text", path: undefined })).toBe("notes");
  });
  test("one line of detail, versions and site included", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");
    expect(shelfMeta({ kind: "file", path: "canvas/x-v3.html", versions: 3, created_at: "2026-10-09T11:30:00Z" }, now)).toBe("Page · 3 versions · 30 min ago");
    expect(shelfMeta({ kind: "link", url: "https://www.kws.go.ke/parks", versions: 1, created_at: undefined }, now)).toBe("Link · kws.go.ke");
  });
});

describe("documents", () => {
  test("a PDF is a document; Ghost's own also come as Word", () => {
    expect(isDocumentArtifact({ kind: "file", path: "documents/cv-v1.pdf", state: "available" })).toBe(true);
    expect(isDocumentArtifact({ kind: "file", path: "documents/cv-v1.pdf", state: "unavailable" })).toBe(false);
    expect(isDocumentArtifact({ kind: "file", path: "notes/x.md", state: "available" })).toBe(false);
    expect(hasWordCopy({ path: "documents/cv-v1.pdf" })).toBe(true);
    expect(hasWordCopy({ path: "downloads/statement.pdf" })).toBe(false);
  });
});

test("a motion's video says Video, the motion says Motion", () => {
  const base = { kind: "file", url: undefined, versions: 1, created_at: undefined } as const;
  expect(shelfMeta({ ...base, path: "motion/grocery-v1.mp4" } as never)).toBe("Video");
  expect(shelfMeta({ ...base, path: "motion/grocery-v1.json" } as never)).toBe("Motion");
});
