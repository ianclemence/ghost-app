import { describe, expect, test } from "bun:test";
import { easProjectId } from "./pushConfig";

describe("push", () => {
  test("the project id comes from app config, then from EAS config", () => {
    expect(easProjectId({ expoConfig: { extra: { eas: { projectId: "abc" } } } })).toBe("abc");
    expect(easProjectId({ expoConfig: { extra: {} }, easConfig: { projectId: "def" } })).toBe("def");
    expect(easProjectId({ expoConfig: null, easConfig: null })).toBeNull();
  });
});
