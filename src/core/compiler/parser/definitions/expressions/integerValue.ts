import type {
  BooleanLexeme,
  CharacterLexeme,
  IntegerLexeme,
} from "../../../lexer/lexeme.ts";
import { type ExpressionCommon, makeExpression } from "../expression.ts";

export interface IntegerValue extends ExpressionCommon {
  readonly expressionType: "integer";
  readonly lexeme: BooleanLexeme | CharacterLexeme | IntegerLexeme;
  readonly type: "boolean" | "character" | "integer";
  readonly value: number;
}

const makeIntegerValue = (
  lexeme: BooleanLexeme | CharacterLexeme | IntegerLexeme,
): IntegerValue => ({
  ...makeExpression(),
  expressionType: "integer",
  lexeme,
  type: lexeme.subtype,
  value: lexeme.value,
});

export default makeIntegerValue;
