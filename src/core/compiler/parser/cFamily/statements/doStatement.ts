import { type KeywordLexeme, operatorLexeme } from "../../../lexer/lexeme.ts";
import { token } from "../../../tokenizer/token.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { ParserContext } from "../../definitions/context.ts";
import makeCompoundExpression from "../../definitions/expressions/compoundExpression.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makeRepeatStatement, {
  type RepeatStatement,
} from "../../definitions/statements/repeatStatement.ts";
import type { CFamilyDialect } from "../dialect.ts";
import parseBlock from "./block.ts";

const parseDoStatement = <R extends Program | Subroutine>(
  doLexeme: KeywordLexeme,
  lexemes: Lexemes,
  context: ParserContext,
  routine: R,
  dialect: CFamilyDialect<R>,
): RepeatStatement => {
  lexemes.expectAfter("{", '"do" must be followed by an opening bracket "{".');

  const repeatStatements = context.inLoop(routine, () =>
    parseBlock(lexemes, context, routine, dialect),
  );

  lexemes.expectAfter("while", '"do { ... }" must be followed by "while".');

  lexemes.expectAfter(
    "(",
    '"while" must be followed by an opening bracket "(".',
  );

  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"while (" must be followed by a boolean expression.',
      lexemes.peek(-1),
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");
  // "do { ... } while (x)" is a "repeat ... until not x", so the condition is
  // negated with a "!" the source never had
  const notToken = token(
    "operator",
    "!",
    condition.lexeme.line,
    condition.lexeme.character,
  );
  const notLexeme = operatorLexeme(notToken, routine.language);
  condition = makeCompoundExpression(notLexeme, null, condition, "not");

  lexemes.expectAfter(
    ")",
    '"while (..." must be followed by a closing bracket ")".',
  );

  dialect.eosCheck(lexemes);

  const repeatStatement = makeRepeatStatement(doLexeme, condition);
  repeatStatement.statements.push(...repeatStatements);
  return repeatStatement;
};

export default parseDoStatement;
