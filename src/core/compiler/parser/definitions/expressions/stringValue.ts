import type { StringLexeme } from "../../../lexer/lexeme.ts";
import { type ExpressionCommon, makeExpression } from "../expression.ts";

export interface StringValue extends ExpressionCommon {
  readonly expressionType: "string";
  readonly lexeme: StringLexeme;
  readonly type: "string";
  readonly value: string;
}

const makeStringValue = (lexeme: StringLexeme): StringValue => ({
  ...makeExpression(),
  expressionType: "string",
  lexeme,
  type: "string",
  value: lexeme.value,
});

export default makeStringValue;
