import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makeRepeatStatement, {
  type RepeatStatement,
} from "../../definitions/statements/repeatStatement.ts";
import parseBlock from "./block.ts";

const parseRepeatStatement = (
  lexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
): RepeatStatement => {
  lexemes.skipComments();
  if (lexemes.atEnd()) {
    throw new CompilerError('No statements found after "REPEAT".', lexeme);
  }
  // the body can start on the "REPEAT"'s own line or on the next one; see
  // the comment in forStatement.ts. Going through parseBlock either way
  // also means the "UNTIL" is consumed before the condition is parsed.
  while (lexemes.peek()?.type === "newline") {
    lexemes.advance();
  }
  const repeatStatements = parseBlock(lexemes, routine, "REPEAT");

  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"UNTIL" must be followed by a boolean expression.',
      lexemes.peek(-1),
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  const repeatStatement = makeRepeatStatement(lexeme, condition);
  repeatStatement.statements.push(...repeatStatements);
  return repeatStatement;
};

export default parseRepeatStatement;
