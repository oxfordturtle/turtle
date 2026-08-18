import type { KeywordLexeme } from "../../../lexer/lexeme.ts";
import type { Constant } from "../constant.ts";
import type { Expression } from "../expression.ts";
import makeStatement, {
  type Statement,
  type StatementCommon,
} from "../statement.ts";
import type { Variable } from "../variable.ts";

export interface WhileStatement extends StatementCommon {
  readonly statementType: "whileStatement";
  readonly lexeme: KeywordLexeme;
  readonly condition: Expression;
  readonly statements: Statement[];
  readonly variables: Variable[];
  readonly constants: Constant[];
}

const makeWhileStatement = (
  lexeme: KeywordLexeme,
  condition: Expression,
): WhileStatement => ({
  ...makeStatement(),
  statementType: "whileStatement",
  lexeme,
  condition,
  statements: [],
  variables: [],
  constants: [],
});

export default makeWhileStatement;
