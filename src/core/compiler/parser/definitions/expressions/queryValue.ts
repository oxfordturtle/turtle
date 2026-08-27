import type { Input } from "@/core/constants.ts";
import type { QueryCodeLexeme } from "../../../lexer/lexeme.ts";

export interface QueryValue {
  readonly kind: "query";
  readonly lexeme: QueryCodeLexeme;
  readonly type: "integer";
  readonly input: Input;
}

const makeQueryValue = (lexeme: QueryCodeLexeme, input: Input): QueryValue => ({
  kind: "query",
  lexeme,
  type: "integer",
  input,
});

export default makeQueryValue;
