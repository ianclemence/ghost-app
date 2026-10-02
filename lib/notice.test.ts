import { describe, expect, test } from "bun:test";
import { shapeNotice } from "./notice";

describe("shapeNotice", () => {
  test("a short reminder becomes a headline without its own label", () => {
    expect(shapeNotice("Reminder: check the prices for the Shenzhen trip flights.")).toEqual({
      title: "Check the prices for the Shenzhen trip flights.",
      body: "",
    });
  });

  test("the label is stripped for each kind and each dash", () => {
    expect(shapeNotice("Needs you — approve the booking").title).toBe("Approve the booking");
    expect(shapeNotice("Ghost noticed: your disk is at 79%").title).toBe("Your disk is at 79%");
    expect(shapeNotice("routine - morning brief ready").title).toBe("Morning brief ready");
  });

  test("a word that merely starts like a label is left alone", () => {
    expect(shapeNotice("Reminders are on for Friday").title).toBe("Reminders are on for Friday");
    expect(shapeNotice("Alertness check at 9").title).toBe("Alertness check at 9");
  });

  test("a long or multi-line message is a document and keeps all its text", () => {
    const brief = "Your week:\n\n- Monday: dentist\n- Tuesday: flights";
    expect(shapeNotice(brief)).toEqual({ title: null, body: brief });
    const long = "x".repeat(200);
    expect(shapeNotice(long)).toEqual({ title: null, body: long });
  });

  test("empty stays empty", () => {
    expect(shapeNotice("")).toEqual({ title: null, body: "" });
    expect(shapeNotice("   ")).toEqual({ title: null, body: "" });
    expect(shapeNotice("Reminder:")).toEqual({ title: null, body: "" });
  });
});
