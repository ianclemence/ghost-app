import { describe, expect, test } from "bun:test";
import { withoutDeletedArtifacts } from "./activity";
import type { ActivityChip } from "./ghostApi";

const chip = (over: Partial<ActivityChip> & { id: string }): ActivityChip =>
  ({
    event_id: over.id,
    seq: 1,
    title: over.id,
    kind: "tool.completed",
    state: "success",
    timestamp: "2026-10-11T10:00:00+07:00",
    ...over,
  }) as ActivityChip;

describe("withoutDeletedArtifacts", () => {
  test("drops the publish chip whose artifact was deleted, keeps the rest", () => {
    const items = [
      chip({ id: "p1", title: "Published something for you", artifact_id: "art-1" }),
      chip({ id: "p2", title: "Searched the web" }),
      chip({ id: "d1", kind: "artifact.deleted", title: "Removed: Q3 report", artifact_id: "art-1" }),
    ];
    const out = withoutDeletedArtifacts(items);
    expect(out.map((c) => c.id)).toEqual(["p2", "d1"]);
  });

  test("hideTombstones drops the removal chip too, for Today", () => {
    const items = [
      chip({ id: "p1", title: "Published something for you", artifact_id: "art-1" }),
      chip({ id: "d1", kind: "artifact.deleted", title: "Removed: Q3 report", artifact_id: "art-1" }),
    ];
    expect(withoutDeletedArtifacts(items, true)).toEqual([]);
  });

  test("no deletions returns the same list", () => {
    const items = [chip({ id: "p1" }), chip({ id: "p2" })];
    expect(withoutDeletedArtifacts(items)).toBe(items);
  });
});
