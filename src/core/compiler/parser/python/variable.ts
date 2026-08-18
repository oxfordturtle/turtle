import constant, { type Constant } from "../definitions/constant.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import makeVariable, { type Variable } from "../definitions/variable.ts";
import identifier from "./identifier.ts";
import type from "./type.ts";

export default (lexemes: Lexemes, routine: Routine): Constant | Variable => {
  const name = identifier(lexemes, routine, true);

  if (lexemes.get() && lexemes.get()?.content === ":") {
    lexemes.next();

    const [isConstant, variableType, stringLength, arrayDimensions, isList] =
      type(lexemes, routine);

    if (isConstant) {
      return constant("Python", name, 0);
    }

    const variable = makeVariable(name, routine);
    if (isList) {
      // "List[T]" hint
      variable.isList = true;
      variable.listElementKind =
        variableType === "string" ? "string" : "integer";
      variable.typeIsCertain = true;
    } else {
      variable.type = variableType;
      variable.typeIsCertain = true;
      variable.stringLength = stringLength;
      variable.arrayDimensions = arrayDimensions;
    }
    return variable;
  }

  return makeVariable(name, routine);
};
