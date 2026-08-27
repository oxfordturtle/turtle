import type {
  IdentifierLexeme,
  OperatorLexeme,
} from "../../../lexer/lexeme.ts";
import type { Expression } from "../expression.ts";
import type { Variable } from "../variable.ts";

export interface VariableAddress {
  readonly kind: "address";
  readonly lexeme: IdentifierLexeme | OperatorLexeme;
  readonly variable: Variable;
  readonly indexes: Expression[];
  readonly type: "integer";
}

const makeVariableAddress = (
  lexeme: IdentifierLexeme | OperatorLexeme,
  variable: Variable,
): VariableAddress => ({
  kind: "address",
  lexeme,
  variable,
  indexes: [],
  type: "integer",
});

export default makeVariableAddress;
