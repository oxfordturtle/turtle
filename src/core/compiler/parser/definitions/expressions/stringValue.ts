import type { StringLexeme } from "../../../lexer/lexeme.ts";

export interface StringValue {
  readonly kind: "string";
  readonly lexeme: StringLexeme;
  readonly type: "string";
  readonly value: string;
}

const makeStringValue = (lexeme: StringLexeme): StringValue => ({
  kind: "string",
  lexeme,
  type: "string",
  value: lexeme.value,
});

export default makeStringValue;
