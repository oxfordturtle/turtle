import { type Lexeme } from "../../../lexer/lexeme.ts";
import type { ParserContext } from "../../definitions/context.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import { type Statement } from "../../definitions/statement.ts";
import type { CFamilyDialect } from "../dialect.ts";

/**
 * The closing-bracket check is needed even where the program's last lexeme is
 * guaranteed to be "}" (as java/program.ts guarantees): that covers one
 * unclosed block, but two means the inner one consumes the outermost "}" and
 * the loop below runs out of lexemes.
 */
const parseBlock = <R extends Program | Subroutine>(
  lexemes: Lexemes,
  context: ParserContext,
  routine: R,
  dialect: CFamilyDialect<R>,
): Statement[] => {
  const statements: Statement[] = [];

  while (!lexemes.atEnd() && lexemes.peek()?.content !== "}") {
    statements.push(
      dialect.parseStatement(
        lexemes.peek() as Lexeme,
        lexemes,
        context,
        routine,
      ),
    );
  }

  lexemes.expectAfter(
    "}",
    'Closing bracket "}" missing after statement block.',
  );

  return statements;
};

export default parseBlock;
