import { describe, expect, test } from "bun:test";
import { acceptSurface, applySurfaceList, belongsTo, surfacePhase, visibleSurfaces, type SurfaceMap } from "./turnSurfaces";
import { buildThread } from "./thread";
import type { LiveSurface } from "./ghostApi";
import type { ExtendedMessage } from "./store";

const T = Date.UTC(2026, 9, 3, 2, 0, 0);
const surf = (over: Partial<LiveSurface> = {}): LiveSurface => ({
  id: "sess-1", kind: "browser", state: "active", control: "ghost", session: "main",
  started: new Date(T + 2000).toISOString(), sequence: 5, ...over,
});

describe("acceptSurface", () => {
  test("an older answer never replaces a newer one", () => {
    let m: SurfaceMap = {};
    m = acceptSurface(m, surf({ sequence: 9, state: "completed" }), T);
    const after = acceptSurface(m, surf({ sequence: 7, state: "active" }), T);
    expect(after).toBe(m);
    expect(after["sess-1"].surface.state).toBe("completed");
  });

  test("the same answer twice changes nothing (no re-render)", () => {
    const m = acceptSurface({}, surf(), T);
    expect(acceptSurface(m, surf(), T)).toBe(m);
  });

  test("it sits where the work started", () => {
    const m = acceptSurface({}, surf(), T + 60_000);
    expect(m["sess-1"].at).toBe(T + 2000);
  });

  test("parked work that starts again moves to the request that resumed it", () => {
    let m = acceptSurface({}, surf({ state: "waiting", sequence: 6 }), T);
    m = acceptSurface(m, surf({ state: "active", sequence: 8 }), T + 90_000);
    expect(m["sess-1"].at).toBe(T + 90_000);
  });
});

describe("what the conversation shows", () => {
  test("the idle local computer is not work and never shows", () => {
    const idle = surf({ id: "local", kind: "computer", state: "created", session: undefined, started: undefined });
    expect(surfacePhase(idle)).toBe("hidden");
    expect(belongsTo(idle, "main")).toBe(false);
  });

  test("another conversation's browser is not shown here", () => {
    expect(belongsTo(surf({ session: "routine:7" }), "main")).toBe(false);
  });

  test("finished work is a record; a failed turn is a stop; an empty timeout is nothing", () => {
    expect(surfacePhase(surf({ state: "completed" }))).toBe("done");
    expect(surfacePhase(surf({ state: "failed" }))).toBe("stopped");
    expect(surfacePhase(surf({ state: "expired" }))).toBe("hidden");
    expect(surfacePhase(surf({ state: "expired", observation: { domain: "x.com" } }))).toBe("done");
  });

  test("the Pod's list settles a card whose work ended while the app was away, and drops what it forgot", () => {
    let m = acceptSurface({}, surf({ sequence: 3 }), T);
    m = acceptSurface(m, surf({ id: "gone", sequence: 1 }), T);
    m = applySurfaceList(m, [surf({ state: "completed", sequence: 6 }), surf({ id: "local", kind: "computer", state: "created", session: undefined })], "main", T);
    expect(Object.keys(m)).toEqual(["sess-1"]);
    expect(m["sess-1"].surface.state).toBe("completed");
  });
});

describe("placement in the thread", () => {
  const msg = (id: string, role: "user" | "assistant", at: number, content = "x", status?: ExtendedMessage["status"]): ExtendedMessage =>
    ({ id, role, content, timestamp: at, ...(status ? { status } : {}) });

  test("the browser card sits under the request that opened it, above the answer", () => {
    const messages = [
      msg("u0", "user", T - 600_000), msg("a0", "assistant", T - 590_000),
      msg("u1", "user", T), msg("a1", "assistant", T, "", "streaming"),
    ];
    const surfaces = visibleSurfaces(acceptSurface({}, surf(), T));
    const order = buildThread(messages, [], T, [], false, surfaces).filter((i) => i.kind !== "day").map((i) => i.key);
    expect(order).toEqual(["u0", "a0", "u1", "surface-sess-1", "a1"]);
  });

  test("it stays with its request when later messages arrive", () => {
    const messages = [msg("u1", "user", T), msg("a1", "assistant", T + 30_000), msg("u2", "user", T + 120_000), msg("a2", "assistant", T + 125_000)];
    const surfaces = visibleSurfaces(acceptSurface({}, surf({ state: "completed" }), T));
    const order = buildThread(messages, [], T, [], false, surfaces).filter((i) => i.kind !== "day").map((i) => i.key);
    expect(order).toEqual(["u1", "surface-sess-1", "a1", "u2", "a2"]);
  });

  test("browsing Ghost started on its own sits at its own time, not under an old request", () => {
    const messages = [msg("u1", "user", T), msg("a1", "assistant", T + 20_000), msg("r", "assistant", T + 3_600_000)];
    const surfaces = visibleSurfaces(acceptSurface({}, surf({ started: new Date(T + 1_800_000).toISOString() }), T));
    const order = buildThread(messages, [], T + 3_700_000, [], false, surfaces).filter((i) => i.kind !== "day").map((i) => i.key);
    expect(order).toEqual(["u1", "a1", "surface-sess-1", "r"]);
  });
});
