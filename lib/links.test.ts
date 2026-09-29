import { describe, expect, test } from "bun:test";
import { isSafeExternalUrl, isSafeImageUrl } from "./link-policy";

describe("isSafeExternalUrl", () => {
  test("accepts http(s) destinations", () => {
    expect(isSafeExternalUrl("https://example.com")).toBe(true);
    expect(isSafeExternalUrl("https://example.com/a?b=1#c")).toBe(true);
    expect(isSafeExternalUrl("http://example.com")).toBe(true);
    expect(isSafeExternalUrl("  https://example.com  ")).toBe(true);
  });

  test("rejects javascript: and data: URLs", () => {
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("JavaScript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafeExternalUrl("vbscript:msgbox")).toBe(false);
  });

  test("rejects app-escaping custom schemes", () => {
    expect(isSafeExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeExternalUrl("intent://scan/#Intent;scheme=zxing")).toBe(false);
    expect(isSafeExternalUrl("tel:+123")).toBe(false);
    expect(isSafeExternalUrl("sms:+123")).toBe(false);
    expect(isSafeExternalUrl("ghost://internal")).toBe(false);
  });

  test("rejects protocol-relative and bare strings", () => {
    expect(isSafeExternalUrl("//example.com")).toBe(false);
    expect(isSafeExternalUrl("example.com")).toBe(false);
    expect(isSafeExternalUrl("https://")).toBe(false);
    expect(isSafeExternalUrl("")).toBe(false);
    expect(isSafeExternalUrl(null)).toBe(false);
    expect(isSafeExternalUrl(undefined)).toBe(false);
  });
});

describe("isSafeImageUrl", () => {
  test("accepts https images only", () => {
    expect(isSafeImageUrl("https://example.com/a.png")).toBe(true);
    expect(isSafeImageUrl("http://example.com/a.png")).toBe(false);
    expect(isSafeImageUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isSafeImageUrl("file:///tmp/a.png")).toBe(false);
    expect(isSafeImageUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeImageUrl("")).toBe(false);
  });
});
