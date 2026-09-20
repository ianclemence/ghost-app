import { describe, expect, test } from "bun:test";
import { dispatchMode, steerAck } from "./dispatch";

describe("dispatchMode", () => {
  test("idle sends normally", () => {
    expect(dispatchMode(false, true)).toBe("send");
    expect(dispatchMode(false, false)).toBe("send");
  });
  test("streaming with steering available steers the running turn", () => {
    expect(dispatchMode(true, true)).toBe("steer");
  });
  test("streaming without steering queues rather than dropping", () => {
    expect(dispatchMode(true, false)).toBe("queue");
  });
  test("the ack is honest that it joined the current turn", () => {
    expect(steerAck()).toContain("current turn");
  });
});
