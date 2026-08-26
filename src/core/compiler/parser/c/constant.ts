import { CompilerError } from "../../tools/error.ts";
import constant, { type Constant } from "../definitions/constant.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import evaluate from "../common/evaluate.ts";
import parseExpression from "../common/expression.ts";
import typeCheck from "../common/typeCheck.ts";
import identifier from "./identifier.ts";
import type from "./type.ts";

export default (lexemes: Lexemes, routine: Routine): Constant => {
  const [constantType] = type(lexemes);
  if (constantType === null) {
    throw new CompilerError(
      'Constant type cannot be void (expected "bool", "char", "int", or "string").',
      lexemes.peek(),
    );
  }

  const name = identifier(lexemes, routine);

  if (lexemes.atEnd()) {
    throw new CompilerError(
      `Constant ${name} must be assigned a value.`,
      lexemes.peek(-1),
    );
  }
  if (lexemes.peek()?.content === "[") {
    throw new CompilerError("Constant cannot be an array.", lexemes.peek(-1));
  }
  lexemes.expect("=", `Constant ${name} must be assigned a value.`);

  const exp = parseExpression(lexemes, routine);
  typeCheck(routine.language, exp, constantType);
  const value = evaluate(exp, "C", "constant");

  return constant("C", name, value);
};
