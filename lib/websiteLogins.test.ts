import { describe, expect, test } from "bun:test";
import { displayUsername, validateWebsiteLogin } from "./websiteLogins";

describe("validateWebsiteLogin", () => {
  test("accepts a complete, http(s) login", () => {
    expect(validateWebsiteLogin("https://example.com/login", "ian", "pw")).toBeNull();
    expect(validateWebsiteLogin("http://intranet.local/login", "ian", "pw")).toBeNull();
  });

  test("requires every field", () => {
    expect(validateWebsiteLogin("", "ian", "pw")).toBeTruthy();
    expect(validateWebsiteLogin("https://example.com", "", "pw")).toBeTruthy();
    expect(validateWebsiteLogin("https://example.com", "ian", "")).toBeTruthy();
  });

  test("refuses a non-http scheme", () => {
    expect(validateWebsiteLogin("ftp://example.com", "ian", "pw")).toContain("http");
  });
});

describe("displayUsername", () => {
  test("uses the masked value from the Pod", () => {
    expect(displayUsername("i***")).toBe("i***");
  });
  test("falls back when absent", () => {
    expect(displayUsername("")).toBe("saved");
    expect(displayUsername(undefined)).toBe("saved");
  });
});
