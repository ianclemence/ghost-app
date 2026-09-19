import { beforeEach, describe, expect, mock, test } from "bun:test";

const asyncBacking = new Map<string, string>();

mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => asyncBacking.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      asyncBacking.set(k, v);
    },
    removeItem: async (k: string) => {
      asyncBacking.delete(k);
    },
    clear: async () => {
      asyncBacking.clear();
    },
  },
}));

const {
  funnelSnapshot,
  getMilestones,
  recordMilestone,
  timeToMilestone,
} = await import("./onboarding-metrics");

beforeEach(() => {
  asyncBacking.clear();
});

describe("recordMilestone", () => {
  test("stamps a milestone once and never overwrites it", async () => {
    await recordMilestone("first_launch", 1000);
    const after = await recordMilestone("first_launch", 9999);
    expect(after.first_launch).toBe(1000);
  });

  test("records distinct milestones independently", async () => {
    await recordMilestone("first_launch", 1000);
    await recordMilestone("first_thing", 5000);
    const ms = await getMilestones();
    expect(ms.first_launch).toBe(1000);
    expect(ms.first_thing).toBe(5000);
    expect(ms.first_grant).toBeUndefined();
  });

  test("survives a fresh read (persists)", async () => {
    await recordMilestone("first_grant", 42);
    expect((await getMilestones()).first_grant).toBe(42);
  });
});

describe("timeToMilestone", () => {
  test("subtracts first launch from the milestone", () => {
    expect(timeToMilestone({ first_launch: 1000, first_thing: 6000 }, "first_thing")).toBe(5000);
  });

  test("returns null when either endpoint is missing", () => {
    expect(timeToMilestone({ first_thing: 6000 }, "first_thing")).toBeNull();
    expect(timeToMilestone({ first_launch: 1000 }, "first_thing")).toBeNull();
  });

  test("clamps clock skew to zero rather than reporting negative time", () => {
    expect(timeToMilestone({ first_launch: 5000, first_thing: 1000 }, "first_thing")).toBe(0);
  });
});

describe("funnelSnapshot", () => {
  test("reports which milestones landed", () => {
    const snap = funnelSnapshot({ first_launch: 1000, first_thing: 4000 });
    expect(snap.launched).toBe(true);
    expect(snap.gotFirstThing).toBe(true);
    expect(snap.gotFirstGrant).toBe(false);
    expect(snap.msToFirstThing).toBe(3000);
    expect(snap.msToFirstGrant).toBeNull();
  });

  test("empty milestones describe an unstarted funnel", () => {
    expect(funnelSnapshot({})).toEqual({
      launched: false,
      gotFirstThing: false,
      gotFirstGrant: false,
      msToFirstThing: null,
      msToFirstGrant: null,
    });
  });
});
