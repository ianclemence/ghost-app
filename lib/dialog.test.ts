import { describe, expect, test } from "bun:test";
import { dialogShape, finishDialog, showDialog, subscribeDialogs, type Dialog } from "./dialog";

describe("dialogShape", () => {
  test("a delete: the red action, then Cancel", () => {
    const del = { text: "Delete", style: "destructive" as const };
    const s = dialogShape([{ text: "Cancel", style: "cancel" }, del]);
    expect(s.confirm).toBe(del);
    expect(s.cancel.text).toBe("Cancel");
    expect(s.destructive).toBe(true);
  });
  test("the way out keeps its own words", () => {
    const s = dialogShape([{ text: "Not now", style: "cancel" }, { text: "Update" }]);
    expect([s.confirm?.text, s.cancel.text, s.destructive]).toEqual(["Update", "Not now", false]);
  });
  test("no buttons is a notice with OK", () => {
    const s = dialogShape([]);
    expect(s.confirm).toBeUndefined();
    expect(s.cancel.text).toBe("OK");
  });
});

describe("one dialog at a time", () => {
  test("a second waits for the first, then shows", () => {
    const seen: (string | null)[] = [];
    let head: Dialog | null = null;
    const off = subscribeDialogs((d) => {
      head = d;
      seen.push(d?.title ?? null);
    });
    showDialog("Delete it?");
    showDialog("Couldn't delete that");
    expect(seen).toEqual([null, "Delete it?"]);
    finishDialog(head!.id);
    expect(seen).toEqual([null, "Delete it?", "Couldn't delete that"]);
    finishDialog(head!.id);
    expect(seen[seen.length - 1]).toBeNull();
    off();
  });
});
