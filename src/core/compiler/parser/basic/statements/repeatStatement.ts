import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import skipComments from "../../common/skipComments.ts";
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
  skipComments(lexemes);
  if (!lexemes.get()) {
    throw new CompilerError('No statements found after "REPEAT".', lexeme);
  }
  // the body can start on the "REPEAT"'s own line or on the next one; see
  // the comment in forStatement.ts. Going through parseBlock either way
  // also means the "UNTIL" is consumed before the condition is parsed.
  while (lexemes.get()?.type === "newline") {
    lexemes.next();
  }
  const repeatStatements = parseBlock(lexemes, routine, "REPEAT");

  if (!lexemes.get()) {
    throw new CompilerError(
      '"UNTIL" must be followed by a boolean expression.',
      lexemes.get(-1),
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  const repeatStatement = makeRepeatStatement(lexeme, condition);
  repeatStatement.statements.push(...repeatStatements);
  return repeatStatement;
};

export default parseRepeatStatement;
