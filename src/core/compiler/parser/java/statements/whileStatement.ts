import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { ParserContext } from "../../definitions/context.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makeWhileStatement, {
  type WhileStatement,
} from "../../definitions/statements/whileStatement.ts";
import parseBlock from "./block.ts";

const parseWhileStatement = (
  whileLexeme: KeywordLexeme,
  lexemes: Lexemes,
  context: ParserContext,
  routine: Subroutine,
): WhileStatement => {
  lexemes.expectAfter(
    "(",
    '"while" must be followed by an opening bracket "(".',
  );

  // deno-coverage-ignore-start -- unreachable: the last consumed lexeme is
  // "(", which can never be the program's final lexeme (program.ts guarantees
  // that's "}"), so the stream cannot be dry here
  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"while (" must be followed by a Boolean expression.',
      lexemes.peek(-1),
    );
  }
  // deno-coverage-ignore-stop
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  lexemes.expectAfter(
    ")",
    '"while (..." must be followed by a closing bracket ")".',
  );

  const whileStatement = makeWhileStatement(whileLexeme, condition);

  lexemes.expectAfter(
    "{",
    '"while (...)" must be followed by an opening curly bracket "{".',
  );

  whileStatement.statements.push(
    ...context.inLoop(routine, () => parseBlock(lexemes, context, routine)),
  );

  return whileStatement;
};

export default parseWhileStatement;
