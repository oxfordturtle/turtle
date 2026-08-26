import constant, { type Constant } from "../definitions/constant.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import evaluate from "../common/evaluate.ts";
import parseExpression from "../common/expression.ts";
import typeCheck from "../common/typeCheck.ts";
import { variable } from "./variable.ts";

export default (lexemes: Lexemes, routine: Routine): Constant => {
  const foo = variable(lexemes, routine);

  lexemes.expectAfter("=", "Constant must be assigned a value.");

  let exp = parseExpression(lexemes, routine);
  const value = evaluate(exp, "BASIC", "constant");
  exp = typeCheck(routine.language, exp, foo.type);

  return constant("BASIC", foo.name, value);
};
