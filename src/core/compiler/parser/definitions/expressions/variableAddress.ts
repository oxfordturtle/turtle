import type {
  IdentifierLexeme,
  OperatorLexeme,
} from "../../../lexer/lexeme.ts";
import {
  type Expression,
  type ExpressionCommon,
  makeExpression,
} from "../expression.ts";
import type { Variable } from "../variable.ts";

export interface VariableAddress extends ExpressionCommon {
  readonly expressionType: "address";
  readonly lexeme: IdentifierLexeme | OperatorLexeme;
  readonly variable: Variable;
  readonly indexes: Expression[];
  readonly type: "integer";
}

const makeVariableAddress = (
  lexeme: IdentifierLexeme | OperatorLexeme,
  variable: Variable,
): VariableAddress => ({
  ...makeExpression(),
  expressionType: "address",
  lexeme,
  variable,
  indexes: [],
  type: "integer",
});

export default makeVariableAddress;
