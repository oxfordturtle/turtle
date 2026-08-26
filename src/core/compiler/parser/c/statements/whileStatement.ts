import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makeWhileStatement, {
  type WhileStatement,
} from "../../definitions/statements/whileStatement.ts";
import parseBlock from "./block.ts";

const parseWhileStatement = (
  whileLexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Subroutine,
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

  routine.loopDepth += 1;
  whileStatement.statements.push(...parseBlock(lexemes, routine));
  routine.loopDepth -= 1;

  return whileStatement;
};

export default parseWhileStatement;
