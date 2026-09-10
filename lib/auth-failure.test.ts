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
});
