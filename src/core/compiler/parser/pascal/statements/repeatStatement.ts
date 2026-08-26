import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import type { Subroutine } from "../../definitions/routines/subroutine.ts";
import makeRepeatStatement, {
  type RepeatStatement,
} from "../../definitions/statements/repeatStatement.ts";
import parseBlock from "./block.ts";

const parseRepeatStatement = (
  repeatLexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
): RepeatStatement => {
  const repeatStatements = parseBlock(lexemes, routine, "repeat");

  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"UNTIL" must be followed by a boolean expression.',
      lexemes.peek(-1),
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  const repeatStatement = makeRepeatStatement(repeatLexeme, condition);
  repeatStatement.statements.push(...repeatStatements);
  return repeatStatement;
};

export default parseRepeatStatement;
