import { describe, expect, test } from "bun:test";
import { cancel, enqueue, endTurn, hold, nextWaiting, picked, returned, type QueuedMessage } from "./queue";

const add = (list: QueuedMessage[], id: string, text: string) => enqueue(list, { id, text, now: 1 });

describe("queue", () => {
  test("a typed message starts as steering; the same id is not added twice", () => {
    const a = add([], "1", "use blue");
    expect(a).toEqual([{ id: "1", text: "use blue", state: "steering", createdAt: 1, outboxId: undefined }]);
    expect(add(a, "1", "use blue")).toBe(a);
  });

  test("pickup matches by words, first in line first, once each", () => {
    let q = add(add(add([], "1", "same"), "2", "same"), "3", "other");
    q = picked(q, ["same"]);
    expect(q.map((x) => x.state)).toEqual(["picked", "steering", "steering"]);
    q = picked(q, ["same", "other"]);
    expect(q.map((x) => x.state)).toEqual(["picked", "picked", "picked"]);
  });

  test("handed-back messages wait for the next turn, in order", () => {
    let q = add(add([], "1", "a"), "2", "b");
    q = returned(q, ["b", "a"]);
    expect(q.map((x) => x.state)).toEqual(["waiting", "waiting"]);
    expect(nextWaiting(q)?.id).toBe("1");
  });

  test("a failed steer holds only a steering message", () => {
    const q = picked(add(add([], "1", "a"), "2", "b"), ["a"]);
    expect(hold(q, "1")[0].state).toBe("picked");
    expect(hold(q, "2")[1].state).toBe("waiting");
  });

  test("only a waiting message can be taken back", () => {
    let q = add(add([], "1", "a"), "2", "b");
    q = hold(q, "1");
    expect(cancel(q, "1")).toHaveLength(1);
    expect(cancel(q, "2")).toHaveLength(2);
  });

  test("turn end: read ones join the conversation, unresolved ones wait", () => {
    const q = picked(add(add([], "1", "a"), "2", "b"), ["a"]);
    const end = endTurn(q, { clean: true, podReportsPickup: true });
    expect(end.intoThread.map((x) => x.id)).toEqual(["1"]);
    expect(end.tray.map((x) => [x.id, x.state])).toEqual([["2", "waiting"]]);
  });

  test("a Pod that never reports pickup: accepted steering counts as read, if the turn ended cleanly", () => {
    const q = add([], "1", "a");
    expect(endTurn(q, { clean: true, podReportsPickup: false }).intoThread).toHaveLength(1);
    expect(endTurn(q, { clean: false, podReportsPickup: false }).tray[0].state).toBe("waiting");
  });
});
