import type { OperatorLexeme } from "../../../lexer/lexeme.ts";
import type { Operator, Type } from "../../../lexer/types.ts";
import {
  type Expression,
  type ExpressionCommon,
  makeExpression,
} from "../expression.ts";
import { operatorType } from "../operators.ts";

export interface CompoundExpression extends ExpressionCommon {
  readonly expressionType: "compound";
  readonly lexeme: OperatorLexeme;
  readonly left: Expression | null; // left hand side optional (for unary operators 'not' and 'minus')
  readonly right: Expression;
  readonly operator: Operator;
  readonly type: Type;
  // "lmul" only: the element kind of the list this expression *evaluates to*.
  // "lin"/"lnin" consume a list and produce a boolean, so they use
  // listOperandKind below instead.
  readonly listElementKind?: "integer" | "string";
  // "lin"/"lnin" only: the element kind of the list *operand*, which LIDX needs
  // for its lp operand
  readonly listOperandKind?: "integer" | "string";
}

const makeCompoundExpression = (
  lexeme: OperatorLexeme,
  left: Expression | null,
  right: Expression,
  operator: Operator,
  listElementKind?: "integer" | "string",
  listOperandKind?: "integer" | "string",
): CompoundExpression => ({
  ...makeExpression(),
  expressionType: "compound",
  lexeme,
  left,
  right,
  operator,
  type: operatorType[operator],
  listElementKind,
  listOperandKind,
});

export default makeCompoundExpression;
