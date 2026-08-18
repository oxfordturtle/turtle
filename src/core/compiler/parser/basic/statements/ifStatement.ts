import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import skipComments from "../../common/skipComments.ts";
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

  if (!lexemes.get()) {
    throw new CompilerError(
      '"IF" must be followed by a boolean expression.',
      lexeme,
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  if (!lexemes.get()) {
    throw new CompilerError(
      '"IF ..." must be followed by "THEN".',
      lexemes.get(-1),
    );
  }
  if (lexemes.get()?.content !== "THEN") {
    throw new CompilerError(
      '"IF ..." must be followed by "THEN".',
      lexemes.get(),
    );
  }
  lexemes.next();

  // ok, create the IF statement
  const ifStatement = makeIfStatement(lexeme, condition);

  skipComments(lexemes);
  const firstInnerLexeme = lexemes.get();
  if (!firstInnerLexeme) {
    throw new CompilerError(
      'No statements found after "IF ... THEN".',
      lexemes.get(),
    );
  }
  if (firstInnerLexeme.type === "newline") {
    while (lexemes.get()?.type === "newline") {
      lexemes.next();
    }
    ifStatement.ifStatements.push(...parseBlock(lexemes, routine, "IF"));
    oneLine = false;
  } else {
    oneLine = true;
    ifStatement.ifStatements.push(
      parseStatement(firstInnerLexeme, lexemes, routine, oneLine),
    );
  }

  if (lexemes.get() && lexemes.get()?.content === "ELSE") {
    lexemes.next();
    skipComments(lexemes);
    const firstInnerLexeme = lexemes.get();
    if (!firstInnerLexeme) {
      throw new CompilerError(
        'No statements found after "ELSE".',
        lexemes.get(-1),
      );
    }
    if (oneLine) {
      if (firstInnerLexeme.type === "newline") {
        throw new CompilerError(
          'Statement following "ELSE" cannot be on a new line.',
          lexemes.get(1),
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
      while (lexemes.get()?.type === "newline") {
        lexemes.next();
      }
      ifStatement.elseStatements.push(...parseBlock(lexemes, routine, "ELSE"));
    }
  }

  return ifStatement;
};

export default parseIfStatement;
