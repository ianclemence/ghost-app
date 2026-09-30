import { describe, expect, test } from "bun:test";
import { BRAINS, brainByKey, brainProblem } from "./brains";

describe("brains", () => {
  test("a cloud choice needs a key; the Pod itself does not", () => {
    expect(brainProblem("deepseek", "")).toContain("DeepSeek API key");
    expect(brainProblem("deepseek", "  ")).not.toBeNull();
    expect(brainProblem("anthropic", "sk-ant-x")).toBeNull();
    expect(brainProblem("ollama", "")).toBeNull();
  });

  test("the recommended choice is first and unknown keys fall back to it", () => {
    expect(BRAINS[0].key).toBe("deepseek");
    expect(brainByKey("nope").key).toBe("deepseek");
  });
});
