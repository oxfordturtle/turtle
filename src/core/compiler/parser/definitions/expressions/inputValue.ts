import type { Input } from "@/core/constants.ts";
import type { InputCodeLexeme } from "../../../lexer/lexeme.ts";

export interface InputValue {
  readonly kind: "input";
  readonly lexeme: InputCodeLexeme;
  readonly type: "integer";
  readonly input: Input;
}

const makeInputValue = (lexeme: InputCodeLexeme, input: Input): InputValue => ({
  kind: "input",
  lexeme,
  type: "integer",
  input,
});

export default makeInputValue;
