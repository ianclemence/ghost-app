import { describe, expect, test } from "bun:test";

const { parseSurfaceAnnouncement, presentSurface, surfaceRecord, surfaceTitle } = await import("./surfaces");
const SESSION = "main";

function surface(over: Record<string, unknown> = {}) {
  return {
    id: "sess-1",
    kind: "browser",
    state: "active",
    control: "ghost",
    ...over,
  } as Parameters<typeof presentSurface>[0];
}

describe("parseSurfaceAnnouncement", () => {
  test("accepts session-linked surface frames", () => {
    expect(
      parseSurfaceAnnouncement(
        { type: "surface_update", metadata: { surface_id: "s1", kind: "browser", session_id: SESSION } },
        SESSION,
      ),
    ).toEqual({ surfaceId: "s1", kind: "browser" });
  });

  test("rejects other sessions, kinds, and types", () => {
    expect(
      parseSurfaceAnnouncement(
        { type: "surface_update", metadata: { surface_id: "s1", kind: "browser", session_id: "other" } },
        SESSION,
      ),
    ).toBeNull();
    expect(
      parseSurfaceAnnouncement(
        { type: "surface_update", metadata: { surface_id: "s1", kind: "toaster", session_id: SESSION } },
        SESSION,
      ),
    ).toBeNull();
    expect(parseSurfaceAnnouncement({ type: "assistant_message" }, SESSION)).toBeNull();
    expect(parseSurfaceAnnouncement({ type: "surface_update", metadata: {} }, SESSION)).toBeNull();
  });
});

describe("presentSurface", () => {
  test("user control held by this device offers give-back", () => {
    const p = presentSurface(
      surface({ state: "user_control", control: "user", lease: { device_id: "d1", lease_id: "l", expires_at: "" } }),
      "d1",
    );
    expect(p.headline).toBe("You're steering. Ghost is paused.");
    expect(p.actions).toEqual(["watch", "giveback"]);
  });

  test("another holder is observe-only", () => {
    const p = presentSurface(
      surface({ state: "user_control", control: "user", lease: { device_id: "d9", lease_id: "l", expires_at: "" } }),
      "d1",
    );
    expect(p.actions).toEqual(["watch"]);
  });

  test("paused offers resume, failed offers no control", () => {
    expect(presentSurface(surface({ state: "paused", control: "none" }), "d1").actions).toEqual(["watch", "resume"]);
    expect(presentSurface(surface({ state: "failed" }), "d1").actions).toEqual(["watch"]);
  });

  test("waiting is an approval: it points at the OK, never at take over or signing in", () => {
    const p = presentSurface(surface({ state: "waiting" }), "d1", { approvalWaiting: true });
    expect(p.headline).toBe("Waiting for your OK");
    expect(presentSurface(surface({ state: "waiting", activity: "Wants to type into the page" }), "d1", { approvalWaiting: true }).headline).toBe("Wants to type into the page");
    expect(p.attention).toBe(true);
    expect(p.actions).toEqual(["watch"]);
    expect(`${p.headline} ${p.detail}`.toLowerCase()).not.toContain("sign in");
    expect(presentSurface(surface({ state: "waiting" }), "d1").actions).toEqual(["watch"]);
    expect(presentSurface(surface({ state: "expired" }), "d1").actions).toEqual([]);
  });

  test("active says what Ghost is doing now", () => {
    expect(presentSurface(surface({ activity: "Opening news.ycombinator.com" })).headline).toBe("Opening news.ycombinator.com");
    expect(presentSurface(surface({})).headline).toBe("Working on it");
    expect(presentSurface(surface({})).working).toBe(true);
    expect(presentSurface(surface({}), "d1", { answering: true }).headline).toBe("Writing up what it found");
    expect(presentSurface(surface({ activity: "Typing" }), "d1", { answering: true }).headline).toBe("Typing");
  });

  test("takeover state never claims Ghost progress", () => {
    const p = presentSurface(surface({ state: "user_control", control: "user" }), "d1");
    expect(p.headline.toLowerCase().includes("working")).toBe(false);
  });
});

describe("surfaceTitle", () => {
  test("prefers observation title, falls back safely", () => {
    expect(surfaceTitle(surface({ observation: { title: "Pricing" } }))).toBe("Pricing");
    expect(surfaceTitle(surface({}))).toBe("Browser");
    expect(surfaceTitle(surface({ kind: "computer" }))).toBe("Computer");
  });
});

describe("surfaceRecord", () => {
  test("a finished task leaves a record of where Ghost went", () => {
    expect(surfaceRecord(surface({ state: "completed", observation: { domain: "www.news.ycombinator.com" } }))).toBe("Browsed news.ycombinator.com");
    expect(surfaceRecord(surface({ state: "completed" }))).toBe("Used the browser");
    expect(surfaceRecord(surface({ state: "failed", observation: { url: "https://flights.google.com/x" } }))).toBe("The browser stopped on flights.google.com");
  });
});
