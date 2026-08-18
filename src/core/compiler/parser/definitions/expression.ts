import type { Type } from "../../lexer/types.ts";
import type { CastExpression } from "./expressions/castExpression.ts";
import type { ColourValue } from "./expressions/colourValue.ts";
import type { CompoundExpression } from "./expressions/compoundExpression.ts";
import type { ConstantValue } from "./expressions/constantValue.ts";
import type { FunctionCall } from "./expressions/functionCall.ts";
import type { InputValue } from "./expressions/inputValue.ts";
import type { IntegerValue } from "./expressions/integerValue.ts";
import type { ListLiteral } from "./expressions/listLiteral.ts";
import type { NamedArgument } from "./expressions/namedArgument.ts";
import type { QueryValue } from "./expressions/queryValue.ts";
import type { StringValue } from "./expressions/stringValue.ts";
import type { VariableAddress } from "./expressions/variableAddress.ts";
import type { VariableValue } from "./expressions/variableValue.ts";

export type Expression =
  | IntegerValue
  | StringValue
  | InputValue
  | QueryValue
  | ColourValue
  | ConstantValue
  | VariableAddress
  | VariableValue
  | NamedArgument
  | FunctionCall
  | CompoundExpression
  | CastExpression
  | ListLiteral;

export interface ExpressionCommon {
  readonly __: "expression";
}

export const makeExpression = (): ExpressionCommon => ({
  __: "expression",
});

export const getType = (expression: Expression): Type => {
  const languagesWithCharacterType = ["C", "Java", "Pascal"];
  switch (expression.expressionType) {
    case "constant":
      if (languagesWithCharacterType.includes(expression.constant.language)) {
        return expression.constant.type === "string" &&
          expression.indexes.length > 0
          ? "character"
          : expression.constant.type;
      }
      return expression.constant.type;

    case "variable":
      if (expression.variable.isList) {
        // a fully-resolved scalar ("x[i]", "wins[i][j]") rather than a
        // still-list-typed reference ("x", "wins[i]")
        const isFullyIndexed = expression.variable.isListOfLists
          ? expression.indexes.length >= 2
          : expression.indexes.length >= 1;
        if (!isFullyIndexed) {
          return "boolint";
        }
        return (
          (expression.variable.isListOfLists
            ? expression.variable.innerListElementKind
            : expression.variable.listElementKind) ?? "boolint"
        );
      }
      return languagesWithCharacterType.includes(
        expression.variable.routine.language,
      )
        ? expression.variable.type === "string" &&
          expression.indexes.length > expression.variable.arrayDimensions.length
          ? "character"
          : expression.variable.type
        : expression.variable.type;

    case "namedArgument":
      return getType(expression.expression);

    case "listLiteral":
      // Type stays strictly scalar, so a list's own "type" is a placeholder;
      // list-ness is reported by isListExpression()/getListElementKind() below
      return expression.listElementKind ?? "boolint";

    default:
      return expression.type;
  }
};

/** True even when the element kind isn't yet known. For a list of lists, "wins[i]" is still a list; only "wins[i][j]" is a scalar. */
export const isListExpression = (expression: Expression): boolean => {
  if (expression.expressionType === "listLiteral") {
    return true;
  }
  if (expression.expressionType === "variable") {
    if (!expression.variable.isList) {
      return false;
    }
    const maxIndexesStillList = expression.variable.isListOfLists ? 1 : 0;
    return expression.indexes.length <= maxIndexesStillList;
  }
  return getListElementKind(expression) !== undefined;
};

/**
 * The element kind of a list-valued expression, or undefined if not yet known.
 *
 * Follows isListExpression()'s cutoff: a bare "wins" reports its *outer*
 * elements' kind, which for a list of lists is always "integer" since sublists
 * are opaque pointers; "wins[i]" reports the sublist's own scalar kind, which
 * is what callers want. There is no way to ask about three levels or more.
 */
export const getListElementKind = (
  expression: Expression,
): "integer" | "string" | undefined => {
  switch (expression.expressionType) {
    case "listLiteral":
      return expression.listElementKind;
    case "variable": {
      if (!expression.variable.isList) {
        return undefined;
      }
      if (expression.variable.isListOfLists) {
        if (expression.indexes.length === 0) {
          return expression.variable.listElementKind;
        }
        if (expression.indexes.length === 1) {
          return expression.variable.innerListElementKind;
        }
        return undefined;
      }
      return expression.indexes.length === 0
        ? expression.variable.listElementKind
        : undefined;
    }
    case "compound":
      return expression.listElementKind;
    case "function":
      return expression.listElementKind;
    default:
      return undefined;
  }
};
