import { type Lexeme } from "../../../lexer/lexeme.ts";
import type { ParserContext } from "../../definitions/context.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import { type Statement } from "../../definitions/statement.ts";
import parseStatement from "../statement.ts";

const parseBlock = (
  lexemes: Lexemes,
  context: ParserContext,
  routine: Subroutine,
): Statement[] => {
  const statements: Statement[] = [];

  while (!lexemes.atEnd() && lexemes.peek()?.content !== "}") {
    statements.push(
      parseStatement(lexemes.peek() as Lexeme, lexemes, context, routine),
    );
  }

  lexemes.expectAfter(
    "}",
    'Closing bracket "}" missing after statement block.',
  );

  return statements;
};

export default parseBlock;
