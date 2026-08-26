import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makeIfStatement, {
  type IfStatement,
} from "../../definitions/statements/ifStatement.ts";
import parseBlock from "./block.ts";

const parseIfStatement = (
  ifLexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
): IfStatement => {
  lexemes.expectAfter("(", '"if" must be followed by an opening bracket "(".');

  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"if (" must be followed by a Boolean expression.',
      lexemes.peek(-1),
    );
  }
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

  ifStatement.ifStatements.push(...parseBlock(lexemes, routine));

  if (lexemes.peek()?.content === "else") {
    lexemes.advance();

    lexemes.expectAfter(
      "{",
      '"else" must be followed by an opening bracket "{".',
    );

    ifStatement.elseStatements.push(...parseBlock(lexemes, routine));
  }

  return ifStatement;
};

export default parseIfStatement;
