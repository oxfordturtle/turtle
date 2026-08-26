import type { KeywordLexeme, OperatorLexeme } from "../../../lexer/lexeme.ts";
import type { Expression } from "../expression.ts";
import type { Subroutine } from "../routines/subroutine.ts";

export interface ReturnStatement {
  readonly kind: "returnStatement";
  readonly lexeme: KeywordLexeme | OperatorLexeme;
  readonly routine: Subroutine;
  readonly value: Expression;
}

const makeReturnStatement = (
  lexeme: KeywordLexeme | OperatorLexeme,
  routine: Subroutine,
  value: Expression,
): ReturnStatement => ({
  kind: "returnStatement",
  lexeme,
  routine,
  value,
});

export default makeReturnStatement;
