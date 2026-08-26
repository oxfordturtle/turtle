import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { ParserContext } from "../../definitions/context.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makeIfStatement, {
  type IfStatement,
} from "../../definitions/statements/ifStatement.ts";
import parseBlock from "./block.ts";

const parseIfStatement = (
  ifLexeme: KeywordLexeme,
  lexemes: Lexemes,
  context: ParserContext,
  routine: Subroutine,
): IfStatement => {
  lexemes.expectAfter("(", '"if" must be followed by an opening bracket "(".');

  // deno-coverage-ignore-start -- unreachable: the last consumed lexeme is
  // "(", which can never be the program's final lexeme (program.ts guarantees
  // that's "}"), so the stream cannot be dry here
  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"if (" must be followed by a Boolean expression.',
      lexemes.peek(-1),
    );
  }
  // deno-coverage-ignore-stop
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  lexemes.expectAfter(
    ")",
    '"if (..." must be followed by a closing bracket ")".',
  );

  const ifStatement = makeIfStatement(ifLexeme, condition);

  lexemes.expectAfter(
    "{",
    '"if (...)" must be followed by an opening curly bracket "{".',
  );

  ifStatement.ifStatements.push(...parseBlock(lexemes, context, routine));

  if (lexemes.peek()?.content === "else") {
    lexemes.advance();

    lexemes.expectAfter(
      "{",
      '"else" must be followed by an opening bracket "{".',
    );

    ifStatement.elseStatements.push(...parseBlock(lexemes, context, routine));
  }

  return ifStatement;
};

export default parseIfStatement;
