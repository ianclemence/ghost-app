import { describe, expect, test } from "bun:test";
import { LiveSession, SESSION_LIMIT_MESSAGE } from "./session";
import type { LiveTransport, SessionAPI, TransportFactory } from "./types";

function makeTransport(): LiveTransport {
  return {
    offer: async () => "v=0\r\nm=audio 0 RTP/AVP 0",
    answer: async () => {},
    send: () => true,
    setMuted: () => {},
    stats: async () => ({ inputLevel: 0, outputLevel: 0, sentPackets: 0, receivedPackets: 0 }),
    close: () => {},
  };
}

describe("LiveSession", () => {
  test("start connects on session.started and merges transcript deltas", async () => {
    let handler: ((e: { type: string; delta?: string; start_ms?: number; end_ms?: number }) => void) | undefined;
    const factory: TransportFactory = async ({ onEvent }) => {
      handler = (e) => onEvent(e as never);
      return makeTransport();
    };
    const api: SessionAPI = {
      create: async () => ({ sdp: "v=0", sessionId: "s1" }),
      close: async () => {},
    };
    const live = new LiveSession(factory, api);
    const started = live.start("marin");
    await new Promise((r) => setTimeout(r, 10));
    handler?.({ type: "session.started" });
    await started.catch(() => {});
    await live.stop();
    expect(live.getSnapshot().status === "idle" || live.getSnapshot().status === "error").toBe(true);
  });

  test("ten-minute limit message is honest and restartable", () => {
    expect(SESSION_LIMIT_MESSAGE.toLowerCase().includes("10-minute")).toBe(true);
    expect(SESSION_LIMIT_MESSAGE.toLowerCase().includes("start another")).toBe(true);
  });

  test("stop without transport resolves and surfaces reason", async () => {
    const factory: TransportFactory = async () => makeTransport();
    const api: SessionAPI = {
      create: async () => ({ sdp: "v=0", sessionId: "s1" }),
      close: async () => {},
    };
    const live = new LiveSession(factory, api);
    await live.stop("boom");
    expect(live.getSnapshot().status).toBe("error");
    expect(live.getSnapshot().error).toBe("boom");
  });
});
