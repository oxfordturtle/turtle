import evaluate from "../common/evaluate.ts";
import parseExpression from "../common/expression.ts";
import constant, { type Constant } from "../definitions/constant.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Program } from "../definitions/routines/program.ts";
import identifier from "./identifier.ts";
import parseSemicolon from "./statements/semicolon.ts";

export default (lexemes: Lexemes, routine: Program): Constant => {
  const name = identifier(lexemes, routine);

  lexemes.expectAfter("=", "Constant must be assigned a value.");

  const exp = parseExpression(lexemes, routine);
  const value = evaluate(exp, "Pascal", "constant");

  const foo = constant("Pascal", name, value);

  parseSemicolon(lexemes, true, "constant definition");

  return foo;
};
