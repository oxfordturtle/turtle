import type { KeywordLexeme } from "../../../lexer/lexeme.ts";
import type { Constant } from "../constant.ts";
import type { Expression } from "../expression.ts";
import type { Statement } from "../statement.ts";
import type { Variable } from "../variable.ts";

export interface IfStatement {
  readonly kind: "ifStatement";
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
  kind: "ifStatement",
  lexeme,
  condition,
  ifStatements: [],
  elseStatements: [],
  variables: [],
  constants: [],
});

export default makeIfStatement;
