import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import {
  getResultType,
  getSubroutineType,
  type Subroutine,
} from "../../definitions/routines/subroutine.ts";
import makeReturnStatement, {
  type ReturnStatement,
} from "../../definitions/statements/returnStatement.ts";
import eosCheck from "./eosCheck.ts";

const parseReturnStatement = (
  returnLexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Subroutine,
): ReturnStatement => {
  if (getSubroutineType(routine) !== "function") {
    throw new CompilerError("Procedures cannot return a value.", lexemes.get());
  }

  let value = parseExpression(lexemes, routine);
  value = typeCheck(routine.language, value, getResultType(routine)!);
  eosCheck(lexemes);

  routine.hasReturnStatement = true;

  return makeReturnStatement(returnLexeme, routine, value);
};

export default parseReturnStatement;
