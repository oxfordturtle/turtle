import type { KeywordLexeme, OperatorLexeme } from "../../../lexer/lexeme.ts";
import type { Expression } from "../expression.ts";
import type { Subroutine } from "../routines/subroutine.ts";
import makeStatement, { type StatementCommon } from "../statement.ts";

export interface ReturnStatement extends StatementCommon {
  readonly statementType: "returnStatement";
  readonly lexeme: KeywordLexeme | OperatorLexeme;
  readonly routine: Subroutine;
  readonly value: Expression;
}

const makeReturnStatement = (
  lexeme: KeywordLexeme | OperatorLexeme,
  routine: Subroutine,
  value: Expression,
): ReturnStatement => ({
  ...makeStatement(),
  statementType: "returnStatement",
  lexeme,
  routine,
  value,
});

export default makeReturnStatement;
