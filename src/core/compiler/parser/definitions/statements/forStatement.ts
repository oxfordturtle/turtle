import type { KeywordLexeme } from "../../../lexer/lexeme.ts";
import type { Constant } from "../constant.ts";
import type { Expression } from "../expression.ts";
import makeStatement, {
  type Statement,
  type StatementCommon,
} from "../statement.ts";
import type { Variable } from "../variable.ts";
import type { VariableAssignment } from "./variableAssignment.ts";

export interface ForStatement extends StatementCommon {
  readonly statementType: "forStatement";
  readonly lexeme: KeywordLexeme;
  readonly initialisation: VariableAssignment;
  readonly condition: Expression;
  readonly change: VariableAssignment;
  readonly statements: Statement[];
  readonly variables: Variable[];
  readonly constants: Constant[];
}

const makeForStatement = (
  lexeme: KeywordLexeme,
  initialisation: VariableAssignment,
  condition: Expression,
  change: VariableAssignment,
): ForStatement => ({
  ...makeStatement(),
  statementType: "forStatement",
  lexeme,
  initialisation,
  condition,
  change,
  statements: [],
  variables: [],
  constants: [],
});

export default makeForStatement;
