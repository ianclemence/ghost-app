import { describe, expect, test } from "bun:test";
import { looksLikeSignInAddress } from "./ghostApi";

describe("recognising a finished sign-in address", () => {
  test("the address the browser ends on is recognised", () => {
    expect(looksLikeSignInAddress("http://localhost/?state=abc123&code=4%2F0AX&scope=email")).toBe(true);
    expect(looksLikeSignInAddress("  http://127.0.0.1:8888/callback?code=xyz&state=s1  ")).toBe(true);
  });

  test("ordinary clipboard contents are not", () => {
    for (const t of ["", "hello", "https://example.com/page", "http://localhost/?code=onlycode", "state=x", "my password is code=1 state=2"]) {
      expect(looksLikeSignInAddress(t)).toBe(false);
    }
  });
});
