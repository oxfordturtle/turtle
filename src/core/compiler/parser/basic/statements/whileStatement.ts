import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import skipComments from "../../common/skipComments.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makeWhileStatement, {
  type WhileStatement,
} from "../../definitions/statements/whileStatement.ts";
import parseBlock from "./block.ts";

const parseWhileStatement = (
  lexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
): WhileStatement => {
  if (!lexemes.get()) {
    throw new CompilerError(
      '"WHILE" must be followed by a boolean expression.',
      lexemes.get(-1),
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  const whileStatement = makeWhileStatement(lexeme, condition);

  skipComments(lexemes);
  if (!lexemes.get()) {
    throw new CompilerError(
      'No commands found after "WHILE ... DO".',
      lexemes.get(-1),
    );
  }
  // the body can start on the "WHILE"'s own line or on the next one; see
  // the comment in forStatement.ts
  while (lexemes.get()?.type === "newline") {
    lexemes.next();
  }
  whileStatement.statements.push(...parseBlock(lexemes, routine, "WHILE"));

  return whileStatement;
};

export default parseWhileStatement;
