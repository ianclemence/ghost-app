import { describe, expect, test } from "bun:test";
import { connectorReadiness, readinessLabel } from "./ghostApi";

describe("connectorReadiness", () => {
  test("connected is ready", () => {
    expect(connectorReadiness({ source: "first-party", status: "connected" })).toBe("ready");
  });
  test("ready flag wins even without a status", () => {
    expect(connectorReadiness({ source: "first-party", ready: true })).toBe("ready");
  });
  test("expired or reauth is needs_reauth", () => {
    expect(connectorReadiness({ source: "first-party", status: "expired" })).toBe("needs_reauth");
    expect(connectorReadiness({ source: "first-party", status: "needs_reauth" })).toBe("needs_reauth");
  });
  test("disconnected needs connecting", () => {
    expect(connectorReadiness({ source: "first-party", status: "disconnected" })).toBe("needs_connection");
  });
  test("installed portable connectors are ready by virtue of being installed", () => {
    expect(connectorReadiness({ source: "installed" })).toBe("ready");
  });
  test("unknown first-party is simply available", () => {
    expect(connectorReadiness({ source: "first-party" })).toBe("available");
  });
  test("labels read in owner language", () => {
    expect(readinessLabel("ready")).toBe("Ready");
    expect(readinessLabel("needs_reauth")).toBe("Reconnect needed");
    expect(readinessLabel("needs_connection")).toBe("Not connected");
    expect(readinessLabel("available")).toBe("Available");
  });
});
