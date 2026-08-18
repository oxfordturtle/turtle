import type { Lexeme } from "../../../lexer/lexeme.ts";
import type { Type } from "../../../lexer/types.ts";
import {
  type Expression,
  type ExpressionCommon,
  makeExpression,
} from "../expression.ts";

export interface CastExpression extends ExpressionCommon {
  readonly expressionType: "cast";
  readonly lexeme: Lexeme;
  readonly type: Type;
  readonly expression: Expression;
}

const makeCastExpression = (
  lexeme: Lexeme,
  type: Type,
  expression: Expression,
): CastExpression => ({
  ...makeExpression(),
  expressionType: "cast",
  lexeme,
  type,
  expression,
});

export default makeCastExpression;
