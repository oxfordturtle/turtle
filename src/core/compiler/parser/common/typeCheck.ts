import type { Language, Parameter } from "@/core/constants.ts";
import type { Type } from "../../lexer/types.ts";
import { CompilerError } from "../../tools/error.ts";
import {
  type Expression,
  getListElementKind,
  getType,
  isListExpression,
} from "../definitions/expression.ts";
import makeCastExpression from "../definitions/expressions/castExpression.ts";
import type { Variable } from "../definitions/variable.ts";

const typeCheck = (
  language: Language,
  found: Expression,
  expected: Type | Variable | Parameter,
): Expression => {
  const expectedType = typeof expected === "string" ? expected : expected.type;
  const foundType = getType(found);
  const foundIsList = isListExpression(found);

  // if the expected type isn't certain yet, infer it. List-ness is pinned as
  // soon as it's known, but a hint-less "x=[]" leaves the element kind, and so
  // typeIsCertain, unresolved until something later determines it.
  if (
    typeof expected !== "string" &&
    expected.kind === "Variable" &&
    !expected.typeIsCertain
  ) {
    if (foundIsList) {
      expected.isList = true;
      // isListOfLists/innerListElementKind must propagate too, or the sublists
      // are mistaken for plain integers
      if (found.kind === "listLiteral" && found.isListOfLists) {
        expected.isListOfLists = true;
        expected.listElementKind = "integer";
        expected.innerListElementKind = found.innerListElementKind;
        expected.typeIsCertain = found.innerListElementKind !== undefined;
      } else if (
        found.kind === "variable" &&
        found.variable.isListOfLists &&
        found.indexes.length === 0
      ) {
        expected.isListOfLists = true;
        expected.listElementKind = "integer";
        expected.innerListElementKind = found.variable.innerListElementKind;
        expected.typeIsCertain =
          found.variable.innerListElementKind !== undefined;
      } else {
        const kind = getListElementKind(found);
        if (kind !== undefined) {
          expected.listElementKind = kind;
          expected.typeIsCertain = true;
        }
      }
    } else {
      // a hint-less "x=[]" has pinned list-ness even though typeIsCertain is
      // still false; a later scalar assignment must not overwrite it, or the
      // variable is both scalar-typed and isList-flagged and every list
      // operation reads the scalar as a heap address
      if (expected.isList) {
        throw new CompilerError(
          "Type error: a list was expected.",
          found.lexeme,
        );
      }
      expected.type = foundType;
      expected.typeIsCertain = true;
    }
    return found;
  }

  // lists never go through the scalar coercion ladder below: either both sides
  // are lists of the same element kind, or it's an error
  const expectedIsList =
    typeof expected !== "string" &&
    expected.kind === "Variable" &&
    expected.isList;
  if (foundIsList || expectedIsList) {
    if (foundIsList && expectedIsList) {
      const expectedKind = (expected as Variable).listElementKind;
      const foundKind = getListElementKind(found);
      if (
        foundKind !== undefined &&
        expectedKind !== undefined &&
        foundKind !== expectedKind
      ) {
        throw new CompilerError(
          `Type error: a list of '${expectedKind}' was expected but a list of '${foundKind}' was found.`,
          found.lexeme,
        );
      }
      return found;
    }
    throw new CompilerError(
      expectedIsList
        ? "Type error: a list was expected."
        : "Type error: a list was not expected here.",
      found.lexeme,
    );
  }

  // no equivalent branch for a "function" found type: parseFunctionCall has
  // already flipped the called subroutine's typeIsCertain to true
  if (found.kind === "variable" && !found.variable.typeIsCertain) {
    found.variable.type = expectedType;
    found.variable.typeIsCertain = true;
    return found;
  }

  if (foundType === expectedType) {
    return found;
  }

  // if STRING is expected, CHARACTER is ok
  if (expectedType === "string" && foundType === "character") {
    // but we'll need to cast it as a string
    return makeCastExpression(found.lexeme, "string", found);
  }

  // if CHARACTER is expected, STRING is ok
  // (the whole expression will end up being a string anyway)
  if (expectedType === "character" && foundType === "string") {
    return found;
  }

  // if CHARACTER is expected, INTEGER is ok
  if (expectedType === "character" && foundType === "integer") {
    return found;
  }

  // if INTEGER is expected, CHARACTER is ok
  if (expectedType === "integer" && foundType === "character") {
    return found;
  }

  // if BOOLINT is expected, either BOOLEAN or INTEGER is ok
  if (
    expectedType === "boolint" &&
    (foundType === "boolean" || foundType === "integer")
  ) {
    return found;
  }

  // if BOOLINT is found, either BOOLEAN or INTEGER expected is ok
  if (
    foundType === "boolint" &&
    (expectedType === "boolean" || expectedType === "integer")
  ) {
    return found;
  }

  // if INTEGER is found and BOOLEAN is expected, that's fine in Python and TypeScript
  if (
    (language === "Python" || language === "TypeScript") &&
    expectedType === "boolean" &&
    foundType === "integer"
  ) {
    return found;
  }

  // and the reverse, but Python only: real Python's bool is an int subtype,
  // where TypeScript has no such coercion
  if (
    language === "Python" &&
    expectedType === "integer" &&
    foundType === "boolean"
  ) {
    return found;
  }

  throw new CompilerError(
    `Type error: '${expectedType}' expected but '${foundType}' found.`,
    found.lexeme,
  );
};

export default typeCheck;

/**
 * Pins a list variable's element kind from the first value that reveals it - an
 * indexed write, ".append(v)", and so on. A no-op if the kind is already known.
 *
 * A list-typed `value` pins `variable` as a list of lists instead; if that
 * value's own element kind isn't known either, only isListOfLists is pinned.
 */
export const pinListElementKind = (
  variable: Variable,
  value: Expression,
): void => {
  // deno-coverage-ignore-start -- unreachable: both call sites
  // (common/arguments.ts's matchesListElement handling and
  // python/statements/variableAssignment.ts's indexed-write handling) only
  // call this after establishing that the element kind is still unknown, so
  // this guard - a defensive backstop for the "no-op if already known"
  // promise in the doc comment above - can never fire
  if (variable.listElementKind !== undefined) {
    return;
  }
  // deno-coverage-ignore-stop
  if (isListExpression(value)) {
    variable.isListOfLists = true;
    variable.listElementKind = "integer"; // opaque sublist pointers at the PCode level
    const innerKind = getListElementKind(value);
    variable.innerListElementKind = innerKind;
    variable.typeIsCertain = innerKind !== undefined;
  } else {
    const kind = getType(value);
    variable.listElementKind = kind === "string" ? "string" : "integer";
    variable.typeIsCertain = true;
  }
};
