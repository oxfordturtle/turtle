import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import skipComments from "../../common/skipComments.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import { type Routine } from "../../definitions/routine.ts";
import makeWhileStatement, {
  type WhileStatement,
} from "../../definitions/statements/whileStatement.ts";
import parseBlock from "./block.ts";

export default (
  whileLexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Routine,
): WhileStatement => {
  if (!lexemes.get()) {
    throw new CompilerError(
      '"while" must be followed by a Boolean expression.',
      whileLexeme,
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  if (!lexemes.get()) {
    throw new CompilerError(
      '"while <expression>" must be followed by a colon.',
      lexemes.get(-1),
    );
  }
  if (lexemes.get()?.content !== ":") {
    throw new CompilerError(
      '"while <expression>" must be followed by a colon.',
      lexemes.get(),
    );
  }
  lexemes.next();

  // follows a comment lexeme with a synthetic newline lexeme in Python, so
  // a comment right after the colon is just as valid as bare whitespace)
  skipComments(lexemes);
  if (!lexemes.get()) {
    throw new CompilerError(
      'No statements found after "while <expression>:".',
      lexemes.get(-1),
    );
  }
  if (lexemes.get()?.type !== "newline") {
    throw new CompilerError(
      'Statements following "while <expression>:" must be on a new line.',
      lexemes.get(),
    );
  }
  lexemes.next();

  const whileStatement = makeWhileStatement(whileLexeme, condition);

  if (!lexemes.get()) {
    throw new CompilerError(
      'No statements found after "while <expression>:".',
      lexemes.get(-1),
    );
  }
  if (lexemes.get()?.type !== "indent") {
    throw new CompilerError(
      'Statements following "while <expression>:" must be indented.',
      lexemes.get(),
    );
  }
  lexemes.next();

  if (!lexemes.get()) {
    throw new CompilerError(
      'No statements found after "while <expression>:".',
      lexemes.get(-1),
    );
  }
  routine.loopDepth += 1;
  whileStatement.statements.push(...parseBlock(lexemes, routine));
  routine.loopDepth -= 1;

  return whileStatement;
};
