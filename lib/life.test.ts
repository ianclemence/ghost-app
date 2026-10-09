import { describe, expect, test } from "bun:test";
import { birthdayLine, formatMoney, initials, monthName, paperStatus, shiftMonth, sourceLabel } from "./life";

describe("money the way the Pod writes it", () => {
  test("minor units, grouping, decimals only when there are some", () => {
    expect(formatMoney(125050, "KES")).toBe("KES 1,250.50");
    expect(formatMoney(100000, "KES")).toBe("KES 1,000");
    expect(formatMoney(1200, "UGX")).toBe("UGX 1,200");
    expect(formatMoney(1234500000, "KES", { short: true })).toBe("KES 12M");
    expect(formatMoney(4560000, "KES", { short: true })).toBe("KES 45.6K");
  });
});

describe("what Ghost knows, in words", () => {
  test("where a fact came from", () => {
    expect(sourceLabel({ kind: "conversation", at: "" })).toBe("You told Ghost");
    expect(sourceLabel({ kind: "photo", at: "" })).toBe("Read from a photo");
    expect(sourceLabel(undefined)).toBe("Kept by Ghost");
  });
  test("birthdays", () => {
    expect(birthdayLine({ next_birthday: "2026-10-09", days_to_birthday: 0, turning: 65 })).toBe("Birthday today, turning 65");
    expect(birthdayLine({ next_birthday: "2026-10-15", days_to_birthday: 6 })).toBe("Birthday in 6 days");
    expect(birthdayLine({ next_birthday: "2027-03-12", days_to_birthday: 154 })).toBe("Birthday 12 March");
    expect(birthdayLine({})).toBeNull();
  });
  test("documents", () => {
    expect(paperStatus({ days_left: -3, what: "expires" })).toEqual({ text: "Expired 3 days ago", tone: "bad" });
    expect(paperStatus({ days_left: 23, what: "renews" })).toEqual({ text: "Renews in 23 days", tone: "warn" });
    expect(paperStatus({ days_left: 60, what: "expires" })).toEqual({ text: "Expires in 9 weeks", tone: "warn" });
    expect(paperStatus({ days_left: 3700, what: "expires", expires: "2037-02-01" })).toEqual({ text: "Valid until Feb 2037", tone: "neutral" });
  });
  test("names and months", () => {
    expect(initials("Grace Wanjiru Kamau")).toBe("GK");
    expect(initials("sam")).toBe("S");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthName("2025-12", new Date(2026, 0, 5))).toBe("December 2025");
  });
});
