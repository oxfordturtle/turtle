import type { IdentifierLexeme } from "../../../lexer/lexeme.ts";
import type { Constant } from "../constant.ts";
import type { Expression } from "../expression.ts";

export interface ConstantValue {
  readonly kind: "constant";
  readonly lexeme: IdentifierLexeme;
  readonly constant: Constant;
  readonly indexes: Expression[];
}

const makeConstantValue = (
  lexeme: IdentifierLexeme,
  constant: Constant,
): ConstantValue => ({
  kind: "constant",
  lexeme,
  constant,
  indexes: [],
});

export default makeConstantValue;
