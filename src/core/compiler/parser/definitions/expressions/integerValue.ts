import type {
  BooleanLexeme,
  CharacterLexeme,
  IntegerLexeme,
} from "../../../lexer/lexeme.ts";

export interface IntegerValue {
  readonly kind: "integer";
  readonly lexeme: BooleanLexeme | CharacterLexeme | IntegerLexeme;
  readonly type: "boolean" | "character" | "integer";
  readonly value: number;
}

const makeIntegerValue = (
  lexeme: BooleanLexeme | CharacterLexeme | IntegerLexeme,
): IntegerValue => ({
  kind: "integer",
  lexeme,
  type: lexeme.subtype,
  value: lexeme.value,
});

export default makeIntegerValue;
