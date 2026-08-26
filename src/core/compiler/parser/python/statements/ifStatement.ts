import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import { type Routine } from "../../definitions/routine.ts";
import makeIfStatement, {
  type IfStatement,
} from "../../definitions/statements/ifStatement.ts";
import parseBlock from "./block.ts";

const parseIfStatement = (
  ifLexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Routine,
): IfStatement => {
  if (lexemes.atEnd()) {
    throw new CompilerError(
      `"${ifLexeme.content}" must be followed by a Boolean expression.`,
      ifLexeme,
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  if (lexemes.atEnd()) {
    throw new CompilerError(
      `"${ifLexeme.content} <expression>" must be followed by a colon.`,
      condition.lexeme,
    );
  }
  lexemes.advance();

  // whileStatement.ts's equivalent check for why)
  lexemes.skipComments();
  if (lexemes.atEnd()) {
    throw new CompilerError(
      `No statements found after "${ifLexeme.content} <expression>:".`,
      lexemes.peek(-1),
    );
  }
  if (lexemes.peek()?.type !== "newline") {
    throw new CompilerError(
      `Statements following "${ifLexeme.content} <expression>:" must be on a new line.`,
      lexemes.peek(),
    );
  }
  lexemes.advance();

  const thisIfStatement = makeIfStatement(ifLexeme, condition);

  if (lexemes.atEnd()) {
    throw new CompilerError(
      `No statements found after "${ifLexeme.content} <expression>:".`,
      lexemes.peek(-1),
    );
  }
  if (lexemes.peek()?.type !== "indent") {
    throw new CompilerError(
      `Statements following "${ifLexeme.content} <expression>:" must be indented.`,
      lexemes.peek(),
    );
  }
  lexemes.advance();

  if (lexemes.atEnd()) {
    throw new CompilerError(
      `No statements found after "${ifLexeme.content} <expression>:".`,
      lexemes.peek(-1),
    );
  }
  thisIfStatement.ifStatements.push(...parseBlock(lexemes, routine));

  // pass over any new lines and comments (a comment can appear between the
  // dedent that closes the if-block and a following "elif"/"else")
  while (
    lexemes.peek()?.type === "newline" ||
    lexemes.peek()?.type === "comment"
  ) {
    lexemes.advance();
  }

  const nextLexeme = lexemes.peek();
  if (nextLexeme) {
    if (nextLexeme.content === "elif") {
      lexemes.advance();
      thisIfStatement.elseStatements.push(
        parseIfStatement(nextLexeme as KeywordLexeme, lexemes, routine),
      );
    } else if (nextLexeme.content === "else") {
      lexemes.advance();

      if (lexemes.atEnd()) {
        throw new CompilerError(
          '"else" must be followed by a colon.',
          lexemes.peek(-1),
        );
      }
      lexemes.expect(":", '"else" must be followed by a colon.');

      // whileStatement.ts's equivalent check for why)
      lexemes.skipComments();
      if (lexemes.atEnd()) {
        throw new CompilerError(
          'No statements found after "else:".',
          lexemes.peek(-1),
        );
      }
      if (lexemes.peek()?.type !== "newline") {
        throw new CompilerError(
          'Statements following "else:" must be on a new line.',
          lexemes.peek(),
        );
      }
      lexemes.advance();

      if (lexemes.atEnd()) {
        throw new CompilerError(
          'No statements found after "else:".',
          lexemes.peek(-1),
        );
      }
      if (lexemes.peek()?.type !== "indent") {
        throw new CompilerError(
          'Statements following "else:" must be indented.',
          lexemes.peek(),
        );
      }
      lexemes.advance();

      if (lexemes.atEnd()) {
        throw new CompilerError(
          'No statements found after "else:".',
          lexemes.peek(-1),
        );
      }
      thisIfStatement.elseStatements.push(...parseBlock(lexemes, routine));
    }
  }

  return thisIfStatement;
};

export default parseIfStatement;
