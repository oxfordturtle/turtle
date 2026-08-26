import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { ParserContext } from "../../definitions/context.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makeWhileStatement, {
  type WhileStatement,
} from "../../definitions/statements/whileStatement.ts";
import type { CFamilyDialect } from "../dialect.ts";
import parseBlock from "./block.ts";

const parseWhileStatement = <R extends Program | Subroutine>(
  whileLexeme: KeywordLexeme,
  lexemes: Lexemes,
  context: ParserContext,
  routine: R,
  dialect: CFamilyDialect<R>,
): WhileStatement => {
  lexemes.expectAfter(
    "(",
    '"while" must be followed by an opening bracket "(".',
  );

  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"while (" must be followed by a Boolean expression.',
      lexemes.peek(-1),
    );
  }
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
    ...context.inLoop(routine, () =>
      parseBlock(lexemes, context, routine, dialect),
    ),
  );

  return whileStatement;
};

export default parseWhileStatement;
