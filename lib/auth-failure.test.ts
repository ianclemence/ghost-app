import { describe, expect, test } from "bun:test";

const { authFailureReason, classifyError } = await import("./ghostApi");

describe("authFailureReason", () => {
  test("maps revoked devices distinctly", () => {
    expect(authFailureReason(401, JSON.stringify({ error: { code: "device_revoked" } }))).toBe("revoked");
    expect(authFailureReason(403, JSON.stringify({ error: { code: "device_revoked" } }))).toBe("revoked");
  });

  test("maps other auth failures as invalid", () => {
    expect(authFailureReason(401, JSON.stringify({ error: { code: "authentication_failed" } }))).toBe("invalid");
    expect(authFailureReason(403, "not json")).toBe("invalid");
  });

  test("ignores non-auth statuses", () => {
    expect(authFailureReason(500, "")).toBeNull();
    expect(authFailureReason(200, "")).toBeNull();
    expect(authFailureReason(429, "")).toBeNull();
  });
});

describe("classifyError", () => {
  test("auth errors are never retryable", () => {
    const e = classifyError(401, "");
    expect(e.kind).toBe("auth");
    expect(e.retryable).toBe(false);
  });

  test("rate limits and provider failures stay retryable", () => {
    expect(classifyError(429, "").retryable).toBe(true);
    expect(classifyError(503, "").retryable).toBe(true);
  });

  // The Pod died mid-turn. Repeating the request id can never run — a turn
  // executes exactly once — so telling the owner "server error" and offering
  // a retry would send them in a circle. The reply is in the transcript.
  test("a turn the Pod was killed in mid-reply is explained, never retried", () => {
    const body = JSON.stringify({
      error: { kind: "turn_interrupted", message: "Ghost restarted while answering that." },
    });
    const e = classifyError(409, body);
    expect(e.retryable).toBe(false);
    expect(e.message).toContain("restart");
    expect(e.message).toContain("conversation");
    expect(e.message).not.toMatch(/server error/i);
  });

  test("an ordinary conflict still reads as a conflict", () => {
    const e = classifyError(409, JSON.stringify({ error: { kind: "turn_in_progress" } }));
    expect(e.message).toMatch(/409/);
  });
});
