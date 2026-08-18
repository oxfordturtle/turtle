import { CompilerError } from "../../tools/error.ts";
import evaluate from "../common/evaluate.ts";
import parseExpression from "../common/expression.ts";
import typeCheck from "../common/typeCheck.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import makeVariable, { type Variable } from "../definitions/variable.ts";
import identifier from "./identifier.ts";
import type from "./type.ts";

export default function variable(lexemes: Lexemes, routine: Routine): Variable {
  const [variableType, stringLength] = type(lexemes);

  if (variableType === null) {
    throw new CompilerError(
      'Variable cannot be void (expected "boolean", "char", "int", or "String").',
      lexemes.get(),
    );
  }

  // "*" possible here (to indicate pointer variable)
  let isPointer = false;
  if (lexemes.get()?.content === "*") {
    lexemes.next();
    isPointer = true;
  }

  const name = identifier(lexemes, routine);

  const variable = makeVariable(name, routine);
  variable.type = variableType;
  variable.stringLength = stringLength;
  variable.isPointer = isPointer;

  while (lexemes.get()?.content === "[") {
    lexemes.next();

    if (!lexemes.get()) {
      throw new CompilerError(
        'Opening bracket "[" must be followed by an array size.',
        lexemes.get(-1),
      );
    }
    const exp = parseExpression(lexemes, routine);
    typeCheck(routine.language, exp, "integer");
    const value = evaluate(exp, "C", "array");
    if (typeof value === "string") {
      throw new CompilerError("Array size must be an integer.", lexemes.get());
    }
    if (value <= 0) {
      throw new CompilerError("Array size must be positive.", lexemes.get());
    }
    variable.arrayDimensions.push([0, value - 1]); // -1 because arrays are indexed from zero

    if (!lexemes.get()) {
      throw new CompilerError(
        'Array size specification must be followed by closing bracket "]".',
        lexemes.get(-1),
      );
    }
    if (lexemes.get()?.content !== "]") {
      throw new CompilerError(
        'Array size specification must be followed by closing bracket "]".',
        lexemes.get(),
      );
    }
    lexemes.next();
  }

  // N.B. no "array of void" sanity check here (unlike java/type.ts,
  // typescript/type.ts): the "Variable cannot be void" check above already
  // throws before array dimensions are parsed, since C's array brackets
  // come after the variable name, not as part of the type specification

  return variable;
}
