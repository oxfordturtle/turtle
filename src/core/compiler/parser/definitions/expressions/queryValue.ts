import type { Input } from "@/core/constants.ts";
import type { QueryCodeLexeme } from "../../../lexer/lexeme.ts";
import { type ExpressionCommon, makeExpression } from "../expression.ts";

export interface QueryValue extends ExpressionCommon {
  readonly expressionType: "query";
  readonly lexeme: QueryCodeLexeme;
  readonly type: "integer";
  readonly input: Input;
}

const makeQueryValue = (lexeme: QueryCodeLexeme, input: Input): QueryValue => ({
  ...makeExpression(),
  expressionType: "query",
  lexeme,
  type: "integer",
  input,
});

export default makeQueryValue;
