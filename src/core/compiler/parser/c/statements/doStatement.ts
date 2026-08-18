import { type KeywordLexeme, operatorLexeme } from "../../../lexer/lexeme.ts";
import { token } from "../../../tokenizer/token.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import makeCompoundExpression from "../../definitions/expressions/compoundExpression.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makeRepeatStatement, {
  type RepeatStatement,
} from "../../definitions/statements/repeatStatement.ts";
import parseBlock from "./block.ts";
import eosCheck from "./eosCheck.ts";

const parseDoStatement = (
  doLexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Subroutine,
): RepeatStatement => {
  if (!lexemes.get() || lexemes.get()?.content !== "{") {
    throw new CompilerError(
      '"do" must be followed by an opening bracket "{".',
      lexemes.get(-1),
    );
  }
  lexemes.next();

  routine.loopDepth += 1;
  const repeatStatements = parseBlock(lexemes, routine);
  routine.loopDepth -= 1;

  if (!lexemes.get() || lexemes.get()?.content !== "while") {
    throw new CompilerError(
      '"do { ... }" must be followed by "while".',
      lexemes.get(-1),
    );
  }
  lexemes.next();

  if (!lexemes.get() || lexemes.get()?.content !== "(") {
    throw new CompilerError(
      '"while" must be followed by an opening bracket "(".',
      lexemes.get(-1),
    );
  }
  lexemes.next();

  if (!lexemes.get()) {
    throw new CompilerError(
      '"while (" must be followed by a boolean expression.',
      lexemes.get(-1),
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");
  const notToken = token(
    "operator",
    "!",
    condition.lexeme.line,
    condition.lexeme.character,
  );
  const notLexeme = operatorLexeme(notToken, "C");
  condition = makeCompoundExpression(notLexeme, null, condition, "not");

  if (!lexemes.get() || lexemes.get()?.content !== ")") {
    throw new CompilerError(
      '"while (..." must be followed by a closing bracket ")".',
      lexemes.get(-1),
    );
  }
  lexemes.next();

  eosCheck(lexemes);

  const repeatStatement = makeRepeatStatement(doLexeme, condition);
  repeatStatement.statements.push(...repeatStatements);
  return repeatStatement;
};

export default parseDoStatement;
