import { CompilerError } from "../../tools/error.ts";
import evaluate from "../common/evaluate.ts";
import parseExpression from "../common/expression.ts";
import typeCheck from "../common/typeCheck.ts";
import constant, { type Constant } from "../definitions/constant.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import identifier from "./identifier.ts";
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
      lexemes.get(),
    );
  }
  if (arrayDimensions.length > 0) {
    throw new CompilerError("Constant cannot be an array.", lexemes.get());
  }

  if (!lexemes.get()) {
    throw new CompilerError(
      `Constant ${name} must be assigned a value.`,
      lexemes.get(-1),
    );
  }
  if (lexemes.get()?.content !== "=") {
    throw new CompilerError(
      `Constant ${name} must be assigned a value.`,
      lexemes.get(),
    );
  }
  lexemes.next();

  const exp = parseExpression(lexemes, routine);
  typeCheck(routine.language, exp, constantType);
  const value = evaluate(exp, "TypeScript", "constant");

  return constant("TypeScript", name, value);
};
