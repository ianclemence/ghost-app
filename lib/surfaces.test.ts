import { describe, expect, test } from "bun:test";

const { parseSurfaceAnnouncement, presentSurface, surfaceTitle } = await import("./surfaces");
const SESSION = "mobile:default";

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
    expect(p.headline).toBe("You're in control.");
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

  test("waiting offers takeover, expired offers nothing", () => {
    expect(presentSurface(surface({ state: "waiting" }), "d1").actions).toEqual(["watch", "takeover"]);
    expect(presentSurface(surface({ state: "expired" }), "d1").actions).toEqual([]);
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
