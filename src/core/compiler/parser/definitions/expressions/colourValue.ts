import type { Colour } from "@/core/constants.ts";
import type { IdentifierLexeme } from "../../../lexer/lexeme.ts";
import { type ExpressionCommon, makeExpression } from "../expression.ts";

export interface ColourValue extends ExpressionCommon {
  readonly expressionType: "colour";
  readonly lexeme: IdentifierLexeme;
  readonly type: "integer";
  readonly colour: Colour;
}

const makeColourValue = (
  lexeme: IdentifierLexeme,
  colour: Colour,
): ColourValue => ({
  ...makeExpression(),
  expressionType: "colour",
  lexeme,
  type: "integer",
  colour,
});

export default makeColourValue;
