import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makeIfStatement, {
  type IfStatement,
} from "../../definitions/statements/ifStatement.ts";
import parseStatement from "../statement.ts";
import parseBlock from "./block.ts";

const parseIfStatement = (
  lexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
): IfStatement => {
  let oneLine: boolean;

  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"IF" must be followed by a boolean expression.',
      lexeme,
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"IF ..." must be followed by "THEN".',
      lexemes.peek(-1),
    );
  }
  lexemes.expect("THEN", '"IF ..." must be followed by "THEN".');

  // ok, create the IF statement
  const ifStatement = makeIfStatement(lexeme, condition);

  lexemes.skipComments();
  const firstInnerLexeme = lexemes.peek();
  if (!firstInnerLexeme) {
    throw new CompilerError(
      'No statements found after "IF ... THEN".',
      lexemes.peek(),
    );
  }
  if (firstInnerLexeme.type === "newline") {
    while (lexemes.peek()?.type === "newline") {
      lexemes.advance();
    }
    ifStatement.ifStatements.push(...parseBlock(lexemes, routine, "IF"));
    oneLine = false;
  } else {
    oneLine = true;
    ifStatement.ifStatements.push(
      parseStatement(firstInnerLexeme, lexemes, routine, oneLine),
    );
  }

  if (lexemes.peek()?.content === "ELSE") {
    lexemes.advance();
    lexemes.skipComments();
    const firstInnerLexeme = lexemes.peek();
    if (!firstInnerLexeme) {
      throw new CompilerError(
        'No statements found after "ELSE".',
        lexemes.peek(-1),
      );
    }
    if (oneLine) {
      if (firstInnerLexeme.type === "newline") {
        throw new CompilerError(
          'Statement following "ELSE" cannot be on a new line.',
          lexemes.peek(1),
        );
      }
      ifStatement.elseStatements.push(
        parseStatement(firstInnerLexeme, lexemes, routine, oneLine),
      );
    } else {
      if (firstInnerLexeme.type !== "newline") {
        throw new CompilerError(
          'Statement following "ELSE" must be on a new line.',
          firstInnerLexeme,
        );
      }
      // move past all line breaks
      while (lexemes.peek()?.type === "newline") {
        lexemes.advance();
      }
      ifStatement.elseStatements.push(...parseBlock(lexemes, routine, "ELSE"));
    }
  }

  return ifStatement;
};

export default parseIfStatement;
