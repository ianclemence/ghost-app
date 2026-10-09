import { expect, test } from "bun:test";
import { answerProblem as problemOf } from "./cardAnswers";
test("an optional date may be left empty", () => {
  const blocks = [{ type: "datetime", key: "bday", label: "Birthday", mode: "date", optional: true }] as never;
  expect(problemOf(blocks, {})).toBeNull();
  const required = [{ type: "datetime", key: "d", label: "When", mode: "date" }] as never;
  expect(problemOf(required, {})).not.toBeNull();
});
