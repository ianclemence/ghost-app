import { describe, expect, test } from "bun:test";
import { isWatching, watchName, watchWant } from "./watching";

describe("watching", () => {
  test("says what it waits for", () => {
    expect(watchWant({ kind: "page", rule: { want: "below", threshold: 25000 } })).toBe("At or under 25,000");
    expect(watchWant({ kind: "page", rule: { want: "stock" } })).toBe("Back in stock");
    expect(watchWant({ kind: "page", rule: { want: "disappears", phrase: "Sold out" } })).toBe("When “Sold out” goes away");
    expect(watchWant({ kind: "flight" })).toBe("Delays, gates and times");
  });
  test("names it plainly", () => {
    expect(watchName({ url: "https://www.jumia.co.ke/item/123" })).toBe("jumia.co.ke");
    expect(watchName({ label: "KQ 602", url: "x" })).toBe("KQ 602");
  });
  test("what is still watched", () => {
    expect(isWatching({ status: "active" })).toBe(true);
    expect(isWatching({ status: "disabled" })).toBe(false);
  });
});
