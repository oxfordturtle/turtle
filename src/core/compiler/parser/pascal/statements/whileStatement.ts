import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import type { Subroutine } from "../../definitions/routines/subroutine.ts";
import makeWhileStatement, {
  type WhileStatement,
} from "../../definitions/statements/whileStatement.ts";
import parseStatement from "../statement.ts";
import parseBlock from "./block.ts";

const parseWhileStatement = (
  whileLexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
): WhileStatement => {
  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"WHILE" must be followed by a boolean expression.',
      whileLexeme,
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  const whileStatement = makeWhileStatement(whileLexeme, condition);

  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"WHILE ..." must be followed by "DO".',
      condition.lexeme,
    );
  }
  lexemes.expect("do", '"WHILE ..." must be followed by "DO".');

  lexemes.skipComments();
  const firstSubLexeme = lexemes.peek();
  if (!firstSubLexeme) {
    throw new CompilerError(
      'No commands found after "WHILE" loop initialisation.',
      lexemes.peek(-1),
    );
  }
  if (lexemes.peek()?.content?.toLowerCase() === "begin") {
    lexemes.advance();
    whileStatement.statements.push(...parseBlock(lexemes, routine, "begin"));
  } else {
    whileStatement.statements.push(
      parseStatement(firstSubLexeme, lexemes, routine),
    );
  }

  return whileStatement;
};

export default parseWhileStatement;
