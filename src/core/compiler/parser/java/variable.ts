import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import makeVariable, { type Variable } from "../definitions/variable.ts";
import identifier from "./identifier.ts";
import type from "./type.ts";

export default function variable(lexemes: Lexemes, routine: Routine): Variable {
  const [variableType, stringLength, arrayDimensions] = type(lexemes, routine);

  if (variableType === null) {
    throw new CompilerError(
      'Variable cannot be void (expected "boolean", "char", "int", or "String").',
      lexemes.peek(),
    );
  }

  const name = identifier(lexemes, routine);

  const variable = makeVariable(name, routine);
  variable.type = variableType;
  variable.stringLength = stringLength;
  variable.arrayDimensions = arrayDimensions;

  return variable;
}
