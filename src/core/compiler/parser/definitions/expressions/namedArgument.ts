import type { IdentifierLexeme } from "../../../lexer/lexeme.ts";
import {
  type Expression,
  type ExpressionCommon,
  makeExpression,
} from "../expression.ts";

export interface NamedArgument extends ExpressionCommon {
  readonly expressionType: "namedArgument";
  readonly lexeme: IdentifierLexeme;
  readonly expression: Expression;
}

const makeNamedArgument = (
  lexeme: IdentifierLexeme,
  expression: Expression,
): NamedArgument => ({
  ...makeExpression(),
  expressionType: "namedArgument",
  lexeme,
  expression,
});

export default makeNamedArgument;
