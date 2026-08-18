import type { KeywordLexeme } from "../../../lexer/lexeme.ts";
import type { Constant } from "../constant.ts";
import type { Expression } from "../expression.ts";
import makeStatement, {
  type Statement,
  type StatementCommon,
} from "../statement.ts";
import type { Variable } from "../variable.ts";

export interface IfStatement extends StatementCommon {
  readonly statementType: "ifStatement";
  readonly lexeme: KeywordLexeme;
  readonly condition: Expression;
  readonly ifStatements: Statement[];
  readonly elseStatements: Statement[];
  readonly variables: Variable[];
  readonly constants: Constant[];
}

const makeIfStatement = (
  lexeme: KeywordLexeme,
  condition: Expression,
): IfStatement => ({
  ...makeStatement(),
  statementType: "ifStatement",
  lexeme,
  condition,
  ifStatements: [],
  elseStatements: [],
  variables: [],
  constants: [],
});

export default makeIfStatement;
