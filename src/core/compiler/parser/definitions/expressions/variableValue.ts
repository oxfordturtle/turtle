import type {
  IdentifierLexeme,
  OperatorLexeme,
} from "../../../lexer/lexeme.ts";
import type { Type } from "../../../lexer/types.ts";
import type { Expression } from "../expression.ts";
import type { Variable } from "../variable.ts";

export interface VariableValue {
  readonly kind: "variable";
  readonly lexeme: IdentifierLexeme | OperatorLexeme; // can be "+=" or "-=" operators in a variable assignment
  readonly variable: Variable;
  // For string slices. Either bound may be null, meaning omitted rather than
  // zero: an omitted start defaults to 0, an omitted end to len(s), and the
  // encoder must tell them apart. TODO: make readonly
  slice: [Expression | null, Expression | null] | null;
  readonly indexes: Expression[]; // for elements of array variables
  // A character index into a *list element's* string ("p[0][1]"), deliberately
  // kept out of `indexes`: the encoder walks those one list level at a time, so
  // a character index appended there would be read back as a further list
  // dimension. Mutually exclusive with `slice`.
  stringIndex: Expression | null;
  readonly type: Type;
}

const makeVariableValue = (
  lexeme: IdentifierLexeme | OperatorLexeme,
  variable: Variable,
): VariableValue => ({
  kind: "variable",
  lexeme,
  variable,
  slice: null,
  indexes: [],
  stringIndex: null,
  type: variable.type,
});

export default makeVariableValue;
