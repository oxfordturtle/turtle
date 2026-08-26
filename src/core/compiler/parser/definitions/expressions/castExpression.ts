import type { Lexeme } from "../../../lexer/lexeme.ts";
import type { Type } from "../../../lexer/types.ts";
import type { Expression } from "../expression.ts";

export interface CastExpression {
  readonly kind: "cast";
  readonly lexeme: Lexeme;
  readonly type: Type;
  readonly expression: Expression;
}

const makeCastExpression = (
  lexeme: Lexeme,
  type: Type,
  expression: Expression,
): CastExpression => ({
  kind: "cast",
  lexeme,
  type,
  expression,
});

export default makeCastExpression;
