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
  const [constantType, , arrayDimensions] = type(lexemes, routine);
  if (constantType === null) {
    throw new CompilerError(
      'Constant type cannot be void (expected "boolean", "char", "int", or "String").',
      lexemes.peek(),
    );
  }
  if (arrayDimensions.length > 0) {
    throw new CompilerError("Constant cannot be an array.", lexemes.peek());
  }

  const name = identifier(lexemes, routine);

  // deno-coverage-ignore-start -- unreachable: program.ts guarantees the final
  // lexeme is "}", and identifier() has just consumed a real identifier (it
  // rejects "}"), so at least that final "}" is still ahead of us here
  if (lexemes.atEnd()) {
    throw new CompilerError(
      `Constant ${name} must be assigned a value.`,
      lexemes.peek(-1),
    );
  }
  // deno-coverage-ignore-stop
  lexemes.expect("=", `Constant ${name} must be assigned a value.`);

  const exp = parseExpression(lexemes, routine);
  typeCheck(routine.language, exp, constantType);
  const value = evaluate(exp, "Java", "constant");

  return constant("Java", name, value);
};
