import { describe, expect, test } from "bun:test";
import { approvalVariant } from "./approval-variant";

describe("approvalVariant", () => {
  test("the safest yes leads, the broadest yes is quietest, no is soft red", () => {
    expect(approvalVariant({ id: "allow_once" })).toBe("primary");
    expect(approvalVariant({ id: "allow_task" })).toBe("secondary");
    expect(approvalVariant({ id: "allow_always" })).toBe("ghost");
    expect(approvalVariant({ id: "deny" })).toBe("danger");
  });
  test("a server-named choice keeps its meaning", () => {
    expect(approvalVariant({ id: "reject_it", style: "primary" })).toBe("danger");
    expect(approvalVariant({ id: "send", style: "danger" })).toBe("danger");
    expect(approvalVariant({ id: "send", style: "primary" })).toBe("primary");
    expect(approvalVariant({ id: "later", style: "secondary" })).toBe("secondary");
  });
});
