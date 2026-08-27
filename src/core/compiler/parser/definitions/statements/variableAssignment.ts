import type { OperatorLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import { type Expression, getType } from "../expression.ts";
import makeCompoundExpression from "../expressions/compoundExpression.ts";
import makeVariableValue from "../expressions/variableValue.ts";
import type { Variable } from "../variable.ts";

export interface VariableAssignment {
  readonly kind: "variableAssignment";
  readonly lexeme: OperatorLexeme;
  readonly variable: Variable;
  readonly indexes: Expression[];
  readonly value: Expression;
  /**
   * The operator of a "+="/"-=" on a *list element*, left for the encoder to
   * apply; null for every other assignment, whose `value` is already the whole
   * thing to be written. See below for why only list elements keep it.
   */
  readonly operator: "plus" | "subt" | "scat" | null;
}

const makeVariableAssignment = (
  lexeme: OperatorLexeme,
  variable: Variable,
  indexes: Expression[],
  value: Expression,
): VariableAssignment => {
  const common = {
    kind: "variableAssignment" as const,
    lexeme,
    variable,
    indexes,
  };

  if (lexeme.content !== "+=" && lexeme.content !== "-=") {
    return { ...common, value, operator: null };
  }

  // "+="/"-=" on an indexed element must read *that element's* value, not the
  // bare variable's - which for a list would be its heap base pointer
  const currentValue = makeVariableValue(lexeme, variable);
  currentValue.indexes.push(...indexes);

  // and its operator has to come from the type being assigned to, the way
  // common/expression.ts picks one for a written-out "s = s + t": a string's
  // "+" is SCAT, and integer PLUS on two strings adds their heap addresses
  // together and then copies a string from wherever that lands. Only the
  // target's type is consulted, because the caller has already type-checked
  // `value` against it. (No "character" case: only Python has "+="/"-=" - see
  // tokenizer/tokenize.ts's operator patterns - and Python has no character
  // type, see constants/languages.ts's traits.characterType.)
  const isString = getType(currentValue) === "string";
  if (isString && lexeme.content === "-=") {
    throw new CompilerError(
      "Type error: strings cannot be subtracted.",
      lexeme,
    );
  }
  const operator =
    lexeme.content === "-=" ? "subt" : isString ? "scat" : "plus";

  // A list element's address is worked out at runtime from its index
  // expression, so desugaring "x[i] += y" here into "x[i] = x[i] + y" would
  // encode `i` twice - once for the read and once for the address written to -
  // and a side-effecting or random index would then read one element and write
  // another. Such a target keeps its operator instead, and the encoder
  // evaluates the address once and holds it on the stack across the read.
  if (variable.isList && indexes.length > 0) {
    return { ...common, value, operator };
  }

  // Everything else is desugared away here, so that the encoder sees nothing
  // but a plain assignment: with no index expression to re-run, the target's
  // address is a compile-time constant, and encoding it twice costs nothing.
  // (Python's only other indexable target is a character within a string,
  // whose write the encoder drops on the floor either way.)
  return {
    ...common,
    value: makeCompoundExpression(lexeme, currentValue, value, operator),
    operator: null,
  };
};

export default makeVariableAssignment;
