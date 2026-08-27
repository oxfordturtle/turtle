import type { IdentifierLexeme } from "../../../lexer/lexeme.ts";
import type { Expression } from "../expression.ts";

export interface NamedArgument {
  readonly kind: "namedArgument";
  readonly lexeme: IdentifierLexeme;
  readonly expression: Expression;
}

const makeNamedArgument = (
  lexeme: IdentifierLexeme,
  expression: Expression,
): NamedArgument => ({
  kind: "namedArgument",
  lexeme,
  expression,
});

export default makeNamedArgument;
