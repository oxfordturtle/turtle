import type { Colour } from "@/core/constants.ts";
import type { IdentifierLexeme } from "../../../lexer/lexeme.ts";

export interface ColourValue {
  readonly kind: "colour";
  readonly lexeme: IdentifierLexeme;
  readonly type: "integer";
  readonly colour: Colour;
}

const makeColourValue = (
  lexeme: IdentifierLexeme,
  colour: Colour,
): ColourValue => ({
  kind: "colour",
  lexeme,
  type: "integer",
  colour,
});

export default makeColourValue;
