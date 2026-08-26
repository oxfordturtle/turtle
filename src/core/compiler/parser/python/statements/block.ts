import { type Lexeme } from "../../../lexer/lexeme.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import { type Routine } from "../../definitions/routine.ts";
import { type Statement } from "../../definitions/statement.ts";
import parseStatement from "../statement.ts";

export default (lexemes: Lexemes, routine: Routine): Statement[] => {
  const statements: Statement[] = [];

  while (!lexemes.atEnd() && lexemes.peek()?.type !== "dedent") {
    statements.push(parseStatement(lexemes.peek() as Lexeme, lexemes, routine));
  }

  if (lexemes.peek()) {
    lexemes.advance();
  }

  return statements;
};
