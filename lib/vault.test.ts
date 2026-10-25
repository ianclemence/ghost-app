import { describe, expect, test } from "bun:test";
import {
  brandLabel,
  cardBrand,
  credentialFootnote,
  expiryShort,
  groupCardNumber,
  initialsFor,
  kindOfTab,
  luhnValid,
  parseExpiry,
  siteHost,
  siteName,
  tabCount,
  vaultStatus,
} from "./vault";

describe("card numbers", () => {
  // The same numbers pkg/credentials/vault_items_test.go uses, so the phone
  // and the Pod can never read one as a different brand.
  const cases: [string, string, boolean][] = [
    ["4242 4242 4242 4242", "visa", true],
    ["4111111111111111", "visa", true],
    ["5555 5555 5555 4444", "mastercard", true],
    ["2223 0031 2200 3222", "mastercard", true],
    ["3782 822463 10005", "amex", true],
    ["6011 1111 1111 1117", "discover", true],
    ["3056 9309 0259 04", "diners", true],
    ["3530 1113 3330 0000", "jcb", true],
    ["6200 0000 0000 0005", "unionpay", true],
    ["5061 0000 0000 0000 007", "verve", true],
    ["4242 4242 4242 4241", "visa", false],
    ["1234", "", false],
  ];
  for (const [number, brand, luhn] of cases) {
    test(`${brand || "unknown"} ${number}`, () => {
      expect(cardBrand(number)).toBe(brand);
      expect(luhnValid(number.replace(/\D/g, ""))).toBe(luhn);
      expect(brandLabel(brand)).toBe(
        ({ visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover", diners: "Diners Club", jcb: "JCB", unionpay: "UnionPay", verve: "Verve", "": "Card" } as Record<string, string>)[brand]!,
      );
    });
  }

  test("number grouping leaves no trailing space", () => {
    expect(groupCardNumber("4242424242424242")).toBe("4242 4242 4242 4242");
    expect(groupCardNumber("4242 4242 4242")).toBe("4242 4242 4242");
    expect(groupCardNumber("")).toBe("");
  });

  test("expiry reads the forms people type", () => {
    expect(parseExpiry("8/28")).toEqual({ month: 8, year: 2028 });
    expect(parseExpiry("08/2028")).toEqual({ month: 8, year: 2028 });
    expect(parseExpiry("8-28")).toEqual({ month: 8, year: 2028 });
    expect(parseExpiry("13/28")).toBeNull();
    expect(parseExpiry("8/99")).toBeNull();
    expect(parseExpiry("soon")).toBeNull();
    expect(expiryShort(8, 2028)).toBe("08/28");
  });
});

describe("the Vault's words", () => {
  test("a site is shortened the way the Pod shortens it", () => {
    expect(siteHost("https://www.Ads.Google.com/home?x=1")).toBe("ads.google.com");
    expect(siteName("ads.google.com")).toBe("Google");
    expect(siteName("www.example.co.uk")).toBe("Example");
    expect(siteName("good.github.io")).toBe("Good");
    expect(siteName("shop.example.co.uk")).toBe("Example");
    expect(siteHost("not a site")).toBe("not a site");
    expect(siteHost("")).toBe("");
  });

  test("a contact's tile has initials, even with one word", () => {
    expect(initialsFor("Amina Hassan")).toBe("AH");
    expect(initialsFor("Amina")).toBe("AM");
    expect(initialsFor("", "amina@example.com")).toBe("A");
    expect(initialsFor("", "")).toBe("?");
  });

  test("tabs map to kinds and count what they show", () => {
    expect(kindOfTab("all")).toBeNull();
    expect(kindOfTab("cards")).toBe("card");
    expect(tabCount("all", { login: 2, card: 1, contact: 3, key: 1 })).toBe(7);
    expect(tabCount("contacts", { contact: 3 })).toBe(3);
  });

  test("a card near its end says so", () => {
    const soon = new Date();
    soon.setMonth(soon.getMonth() + 1);
    const later = new Date();
    later.setMonth(later.getMonth() + 6);
    expect(vaultStatus({ id: "1", kind: "card", title: "Visa", subtitle: "", expired: true })).toBe("Expired");
    expect(vaultStatus({ id: "1", kind: "card", title: "Visa", subtitle: "", exp_month: soon.getMonth() + 1, exp_year: soon.getFullYear() })).toBe("Expires soon");
    expect(vaultStatus({ id: "1", kind: "card", title: "Visa", subtitle: "", exp_month: later.getMonth() + 1, exp_year: later.getFullYear() })).toBeNull();
    expect(vaultStatus({ id: "1", kind: "login", title: "Google", subtitle: "" })).toBeNull();
  });

  test("the form's promise names the site", () => {
    expect(credentialFootnote("ads.google.com")).toBe("Never shown to your Ghost. Only filled on ads.google.com.");
  });
});
