import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import skipComments from "../../common/skipComments.ts";
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
  if (!lexemes.get()) {
    throw new CompilerError(
      `"${ifLexeme.content}" must be followed by a Boolean expression.`,
      ifLexeme,
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  if (!lexemes.get()) {
    throw new CompilerError(
      `"${ifLexeme.content} <expression>" must be followed by a colon.`,
      condition.lexeme,
    );
  }
  lexemes.next();

  // whileStatement.ts's equivalent check for why)
  skipComments(lexemes);
  if (!lexemes.get()) {
    throw new CompilerError(
      `No statements found after "${ifLexeme.content} <expression>:".`,
      lexemes.get(-1),
    );
  }
  if (lexemes.get()?.type !== "newline") {
    throw new CompilerError(
      `Statements following "${ifLexeme.content} <expression>:" must be on a new line.`,
      lexemes.get(),
    );
  }
  lexemes.next();

  const thisIfStatement = makeIfStatement(ifLexeme, condition);

  if (!lexemes.get()) {
    throw new CompilerError(
      `No statements found after "${ifLexeme.content} <expression>:".`,
      lexemes.get(-1),
    );
  }
  if (lexemes.get()?.type !== "indent") {
    throw new CompilerError(
      `Statements following "${ifLexeme.content} <expression>:" must be indented.`,
      lexemes.get(),
    );
  }
  lexemes.next();

  if (!lexemes.get()) {
    throw new CompilerError(
      `No statements found after "${ifLexeme.content} <expression>:".`,
      lexemes.get(-1),
    );
  }
  thisIfStatement.ifStatements.push(...parseBlock(lexemes, routine));

  // pass over any new lines and comments (a comment can appear between the
  // dedent that closes the if-block and a following "elif"/"else")
  while (
    lexemes.get()?.type === "newline" ||
    lexemes.get()?.type === "comment"
  ) {
    lexemes.next();
  }

  const nextLexeme = lexemes.get();
  if (nextLexeme) {
    if (nextLexeme.content === "elif") {
      lexemes.next();
      thisIfStatement.elseStatements.push(
        parseIfStatement(nextLexeme as KeywordLexeme, lexemes, routine),
      );
    } else if (nextLexeme.content === "else") {
      lexemes.next();

      if (!lexemes.get()) {
        throw new CompilerError(
          '"else" must be followed by a colon.',
          lexemes.get(-1),
        );
      }
      if (lexemes.get()?.content !== ":") {
        throw new CompilerError(
          '"else" must be followed by a colon.',
          lexemes.get(),
        );
      }
      lexemes.next();

      // whileStatement.ts's equivalent check for why)
      skipComments(lexemes);
      if (!lexemes.get()) {
        throw new CompilerError(
          'No statements found after "else:".',
          lexemes.get(-1),
        );
      }
      if (lexemes.get()?.type !== "newline") {
        throw new CompilerError(
          'Statements following "else:" must be on a new line.',
          lexemes.get(),
        );
      }
      lexemes.next();

      if (!lexemes.get()) {
        throw new CompilerError(
          'No statements found after "else:".',
          lexemes.get(-1),
        );
      }
      if (lexemes.get()?.type !== "indent") {
        throw new CompilerError(
          'Statements following "else:" must be indented.',
          lexemes.get(),
        );
      }
      lexemes.next();

      if (!lexemes.get()) {
        throw new CompilerError(
          'No statements found after "else:".',
          lexemes.get(-1),
        );
      }
      thisIfStatement.elseStatements.push(...parseBlock(lexemes, routine));
    }
  }

  return thisIfStatement;
};

export default parseIfStatement;
