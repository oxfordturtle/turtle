import { type Lexeme } from "../../../lexer/lexeme.ts";
import type { ParserContext } from "../../definitions/context.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import { type Statement } from "../../definitions/statement.ts";
import parseStatement from "../statement.ts";

/**
 * The closing-bracket check is needed even though java/program.ts guarantees
 * the last lexeme is "}": that covers one unclosed block, but two means the
 * inner one consumes the class's own "}" and the outer loop runs out of
 * lexemes.
 */
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
