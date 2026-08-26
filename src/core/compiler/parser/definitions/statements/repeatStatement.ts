import type { KeywordLexeme } from "../../../lexer/lexeme.ts";
import type { Constant } from "../constant.ts";
import type { Expression } from "../expression.ts";
import type { Variable } from "../variable.ts";
import type { Statement } from "../statement.ts";

export interface RepeatStatement {
  readonly kind: "repeatStatement";
  readonly lexeme: KeywordLexeme;
  readonly condition: Expression;
  readonly statements: Statement[];
  readonly variables: Variable[];
  readonly constants: Constant[];
}

const makeRepeatStatement = (
  lexeme: KeywordLexeme,
  condition: Expression,
): RepeatStatement => ({
  kind: "repeatStatement",
  lexeme,
  condition,
  statements: [],
  variables: [],
  constants: [],
});

export default makeRepeatStatement;
