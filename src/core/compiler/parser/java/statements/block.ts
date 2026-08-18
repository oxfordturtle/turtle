import { type Lexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
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
const parseBlock = (lexemes: Lexemes, routine: Subroutine): Statement[] => {
  const statements: Statement[] = [];

  while (lexemes.get() && lexemes.get()?.content !== "}") {
    statements.push(parseStatement(lexemes.get() as Lexeme, lexemes, routine));
  }

  if (lexemes.get()?.content === "}") {
    lexemes.next();
  } else {
    throw new CompilerError(
      'Closing bracket "}" missing after statement block.',
      lexemes.get(-1),
    );
  }

  return statements;
};

export default parseBlock;
