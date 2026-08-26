import type { KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import type { Subroutine } from "../../definitions/routines/subroutine.ts";
import makeIfStatement, {
  type IfStatement,
} from "../../definitions/statements/ifStatement.ts";
import parseStatement from "../statement.ts";
import parseBlock from "./block.ts";

const parseIfStatement = (
  ifLexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
): IfStatement => {
  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"IF" must be followed by a boolean expression.',
      ifLexeme,
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  const ifStatement = makeIfStatement(ifLexeme, condition);

  if (lexemes.peek()?.content?.toLowerCase() !== "then") {
    throw new CompilerError(
      '"IF ..." must be followed by "THEN".',
      condition.lexeme,
    );
  }
  lexemes.advance();

  lexemes.skipComments();
  const firstSubLexeme = lexemes.peek();
  if (!firstSubLexeme) {
    throw new CompilerError(
      'No commands found after "IF ... THEN".',
      lexemes.peek(-1),
    );
  }
  if (firstSubLexeme.content?.toLowerCase() === "begin") {
    lexemes.advance();
    ifStatement.ifStatements.push(...parseBlock(lexemes, routine, "begin"));
  } else {
    ifStatement.ifStatements.push(
      parseStatement(firstSubLexeme, lexemes, routine),
    );
  }

  if (lexemes.peek()?.content?.toLowerCase() === "else") {
    lexemes.advance();
    lexemes.skipComments();
    const firstSubLexeme = lexemes.peek();
    if (!firstSubLexeme) {
      throw new CompilerError(
        'No commands found after "ELSE".',
        lexemes.peek(-1),
      );
    }
    if (firstSubLexeme.content?.toLowerCase() === "begin") {
      lexemes.advance();
      ifStatement.elseStatements.push(...parseBlock(lexemes, routine, "begin"));
    } else {
      ifStatement.elseStatements.push(
        parseStatement(firstSubLexeme, lexemes, routine),
      );
    }
  }

  return ifStatement;
};

export default parseIfStatement;
