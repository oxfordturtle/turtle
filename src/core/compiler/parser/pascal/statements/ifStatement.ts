import type { KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import skipComments from "../../common/skipComments.ts";
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
  if (!lexemes.get()) {
    throw new CompilerError(
      '"IF" must be followed by a boolean expression.',
      ifLexeme,
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  const ifStatement = makeIfStatement(ifLexeme, condition);

  if (!lexemes.get() || lexemes.get()?.content?.toLowerCase() !== "then") {
    throw new CompilerError(
      '"IF ..." must be followed by "THEN".',
      condition.lexeme,
    );
  }
  lexemes.next();

  skipComments(lexemes);
  const firstSubLexeme = lexemes.get();
  if (!firstSubLexeme) {
    throw new CompilerError(
      'No commands found after "IF ... THEN".',
      lexemes.get(-1),
    );
  }
  if (firstSubLexeme.content?.toLowerCase() === "begin") {
    lexemes.next();
    ifStatement.ifStatements.push(...parseBlock(lexemes, routine, "begin"));
  } else {
    ifStatement.ifStatements.push(
      parseStatement(firstSubLexeme, lexemes, routine),
    );
  }

  if (lexemes.get() && lexemes.get()?.content?.toLowerCase() === "else") {
    lexemes.next();
    skipComments(lexemes);
    const firstSubLexeme = lexemes.get();
    if (!firstSubLexeme) {
      throw new CompilerError(
        'No commands found after "ELSE".',
        lexemes.get(-1),
      );
    }
    if (firstSubLexeme.content?.toLowerCase() === "begin") {
      lexemes.next();
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
