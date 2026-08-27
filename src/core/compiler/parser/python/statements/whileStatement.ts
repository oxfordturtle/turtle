import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { ParserContext } from "../../definitions/context.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import { type Routine } from "../../definitions/routine.ts";
import makeWhileStatement, {
  type WhileStatement,
} from "../../definitions/statements/whileStatement.ts";
import parseBlock from "./block.ts";

export default (
  whileLexeme: KeywordLexeme,
  lexemes: Lexemes,
  context: ParserContext,
  routine: Routine,
): WhileStatement => {
  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"while" must be followed by a Boolean expression.',
      whileLexeme,
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"while <expression>" must be followed by a colon.',
      lexemes.peek(-1),
    );
  }
  lexemes.expect(":", '"while <expression>" must be followed by a colon.');

  // follows a comment lexeme with a synthetic newline lexeme in Python, so
  // a comment right after the colon is just as valid as bare whitespace)
  lexemes.skipComments();
  if (lexemes.atEnd()) {
    throw new CompilerError(
      'No statements found after "while <expression>:".',
      lexemes.peek(-1),
    );
  }
  if (lexemes.peek()?.type !== "newline") {
    throw new CompilerError(
      'Statements following "while <expression>:" must be on a new line.',
      lexemes.peek(),
    );
  }
  lexemes.advance();

  const whileStatement = makeWhileStatement(whileLexeme, condition);

  if (lexemes.atEnd()) {
    throw new CompilerError(
      'No statements found after "while <expression>:".',
      lexemes.peek(-1),
    );
  }
  if (lexemes.peek()?.type !== "indent") {
    throw new CompilerError(
      'Statements following "while <expression>:" must be indented.',
      lexemes.peek(),
    );
  }
  lexemes.advance();

  if (lexemes.atEnd()) {
    throw new CompilerError(
      'No statements found after "while <expression>:".',
      lexemes.peek(-1),
    );
  }
  whileStatement.statements.push(
    ...context.inLoop(routine, () => parseBlock(lexemes, context, routine)),
  );

  return whileStatement;
};
