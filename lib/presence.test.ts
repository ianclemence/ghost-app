import { describe, expect, test } from "bun:test";
import { presence, type PresenceInput } from "./presence";

const base: PresenceInput = { paired: true, connection: "online", streaming: false, phase: null, backgroundRunning: 0, approvalsWaiting: 0, keeping: 0 };

describe("presence", () => {
  test("idle says where Ghost runs", () => {
    expect(presence(base).text).toBe("On your Pod");
    expect(presence({ ...base, paired: false }).text).toBe("Not connected to your Pod");
  });
  test("live work wins over everything but connectivity", () => {
    expect(presence({ ...base, streaming: true, phase: "Searching the web", approvalsWaiting: 2 })).toEqual({ text: "Searching the web", tone: "working" });
    expect(presence({ ...base, connection: "offline", streaming: true }).tone).toBe("offline");
  });
  test("an approval is the next most important thing", () => {
    expect(presence({ ...base, approvalsWaiting: 1, backgroundRunning: 3 })).toEqual({ text: "Waiting for your OK", tone: "attention" });
  });
  test("offline is honest about what happens to messages", () => {
    expect(presence({ ...base, connection: "offline" }).text).toBe("Pod offline · messages will wait");
  });
});
