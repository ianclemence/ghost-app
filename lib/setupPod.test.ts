import { describe, expect, test } from "bun:test";
import { setupPod } from "./setupPod";

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

const base = {
  host: "192.168.1.5",
  port: "80",
  setupCode: "123456",
  adminPassword: "longenough",
  ownerName: "Ada",
  ghostName: "Ghost",
};

describe("setupPod", () => {
  test("returns the pairing invitation on success", async () => {
    const f = fakeFetch(200, {
      ok: true,
      pod_id: "abc123",
      pairing: { token: "deadbeef", host: "192.168.1.5", port: "8766", transport: "lan" },
    });
    const r = await setupPod(base, f);
    expect(r.ok).toBe(true);
    expect(r.pairing?.token).toBe("deadbeef");
    expect(r.pairing?.port).toBe("8766");
  });

  test("reports pairing_pending when the gateway was slow", async () => {
    const f = fakeFetch(200, { ok: true, pairing_pending: true });
    const r = await setupPod(base, f);
    expect(r.ok).toBe(true);
    expect(r.pairing).toBeUndefined();
    expect(r.pairingPending).toBe(true);
  });

  test("surfaces the server error verbatim", async () => {
    const f = fakeFetch(200, { ok: false, error: "setup code is missing or incorrect" });
    const r = await setupPod(base, f);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("setup code");
  });

  test("validates before any network call", async () => {
    let called = false;
    const f = (async () => {
      called = true;
      return {};
    }) as unknown as typeof fetch;
    const r = await setupPod({ ...base, host: "", setupCode: "" }, f);
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });

  test("network failure is honest", async () => {
    const f = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    const r = await setupPod(base, f);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Couldn't reach");
  });
});
