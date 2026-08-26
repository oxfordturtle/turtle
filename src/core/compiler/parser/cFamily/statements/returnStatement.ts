import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import {
  getResultType,
  getSubroutineType,
  type Subroutine,
} from "../../definitions/routines/subroutine.ts";
import makeReturnStatement, {
  type ReturnStatement,
} from "../../definitions/statements/returnStatement.ts";
import type { StatementEnd } from "../dialect.ts";

/**
 * The `Program` case is TypeScript's alone: it is the only one of the three
 * that allows statements outside a subroutine, so it is the only one that can
 * reach a "return" with nothing to return from.
 */
const parseReturnStatement = (
  returnLexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
  dialect: StatementEnd,
): ReturnStatement => {
  if (routine.kind === "Program") {
    throw new CompilerError(
      '"RETURN" statements are only valid within the body of a function.',
      lexemes.peek(),
    );
  }
  if (getSubroutineType(routine) !== "function") {
    throw new CompilerError(
      "Procedures cannot return a value.",
      lexemes.peek(),
    );
  }

  let value = parseExpression(lexemes, routine);
  value = typeCheck(routine.language, value, getResultType(routine)!);
  dialect.eosCheck(lexemes);

  routine.hasReturnStatement = true;

  return makeReturnStatement(returnLexeme, routine, value);
};

export default parseReturnStatement;
