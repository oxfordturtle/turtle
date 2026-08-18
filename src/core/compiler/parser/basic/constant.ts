import { CompilerError } from "../../tools/error.ts";
import constant, { type Constant } from "../definitions/constant.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import evaluate from "../common/evaluate.ts";
import parseExpression from "../common/expression.ts";
import typeCheck from "../common/typeCheck.ts";
import { variable } from "./variable.ts";

export default (lexemes: Lexemes, routine: Routine): Constant => {
  const foo = variable(lexemes, routine);

  if (!lexemes.get() || lexemes.get()?.content !== "=") {
    throw new CompilerError(
      "Constant must be assigned a value.",
      lexemes.get(-1),
    );
  }
  lexemes.next();

  let exp = parseExpression(lexemes, routine);
  const value = evaluate(exp, "BASIC", "constant");
  exp = typeCheck(routine.language, exp, foo.type);

  return constant("BASIC", foo.name, value);
};
