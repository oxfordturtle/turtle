import { CompilerError } from "../../tools/error.ts";
import evaluate from "../common/evaluate.ts";
import parseExpression from "../common/expression.ts";
import typeCheck from "../common/typeCheck.ts";
import constant, { type Constant } from "../definitions/constant.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import identifier from "../cFamily/identifier.ts";
import type from "./type.ts";

export default (
  lexemes: Lexemes,
  routine: Routine,
  duplicateCheck: boolean,
): Constant => {
  const name = identifier(lexemes, routine, duplicateCheck);

  const [constantType, , arrayDimensions] = type(lexemes, routine);
  if (constantType === null) {
    throw new CompilerError(
      'Constant type cannot be void (expected "boolean", "number", or "string").',
      lexemes.peek(),
    );
  }
  if (arrayDimensions.length > 0) {
    throw new CompilerError("Constant cannot be an array.", lexemes.peek());
  }

  if (lexemes.atEnd()) {
    throw new CompilerError(
      `Constant ${name} must be assigned a value.`,
      lexemes.peek(-1),
    );
  }
  lexemes.expect("=", `Constant ${name} must be assigned a value.`);

  const exp = parseExpression(lexemes, routine);
  typeCheck(routine.language, exp, constantType);
  const value = evaluate(exp, "TypeScript", "constant");

  return constant("TypeScript", name, value);
};
