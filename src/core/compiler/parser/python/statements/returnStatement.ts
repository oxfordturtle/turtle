import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import { getType } from "../../definitions/expression.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Routine } from "../../definitions/routine.ts";
import { getResultVariable } from "../../definitions/routines/subroutine.ts";
import makeReturnStatement, {
  type ReturnStatement,
} from "../../definitions/statements/returnStatement.ts";
import makeVariable from "../../definitions/variable.ts";
import eosCheck from "./eosCheck.ts";

export default (
  returnLexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Routine,
): ReturnStatement => {
  if (routine.__ === "Program") {
    throw new CompilerError("Programs cannot return a value.", lexemes.get());
  }

  let value = parseExpression(lexemes, routine);
  const resultVariable = getResultVariable(routine);
  if (resultVariable !== undefined) {
    value = typeCheck(routine.language, value, resultVariable);
  } else {
    const result = makeVariable("!result", routine);
    result.type = getType(value);
    result.typeIsCertain = true;
    routine.typeIsCertain = true;
    routine.variables.unshift(result);
  }
  eosCheck(lexemes);

  routine.hasReturnStatement = true;

  return makeReturnStatement(returnLexeme, routine, value);
};
