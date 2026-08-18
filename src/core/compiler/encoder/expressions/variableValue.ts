import { PCode } from "@/core/constants.ts";
import type { Expression } from "../../parser/definitions/expression.ts";
import makeVariableValue, {
  type VariableValue,
} from "../../parser/definitions/expressions/variableValue.ts";
import type { Program } from "../../parser/definitions/routines/program.ts";
import { isArray } from "../../parser/definitions/variable.ts";
import {
  subroutineAddress,
  turtleAddress,
  variableAddress,
} from "../addresses.ts";
import expression from "../expression.ts";
import listElementValue from "./listElementValue.ts";
import merge from "../merge.ts";
import type { Options } from "../options.ts";

/**
 * Encodes "<string>[a:b]" onto PCode.copy, whose contract is (n3=length,
 * n2=1-based start, n1=string address). `base` must be a re-encodable
 * *expression*, not an already-emitted fragment, because it is encoded twice:
 * once as copy's n1, and again for len(s) when the end bound is omitted.
 *
 * The DUPL/INCR/SWAP below computes both a+1 and b-a from a single evaluation
 * of each bound. Either bound may be null, meaning Python omitted it; an
 * omitted start is pushed as a literal 0 rather than given its own code path.
 * A start past the end makes b-a negative, which copy's underlying substr
 * treats as empty - the same as Python.
 */
const stringSlice = (
  base: VariableValue,
  slice: [Expression | null, Expression | null],
  program: Program,
  options: Options,
): number[][] => {
  const [sliceStart, sliceEnd] = slice;
  const pcode: number[][] = [];
  pcode.push(...expression(base, program, options)); // string
  if (sliceStart === null) {
    merge(pcode, [[PCode.ldin, 0]]); // string, 0
  } else {
    merge(pcode, expression(sliceStart, program, options)); // string, a
  }
  merge(pcode, [[PCode.dupl, PCode.incr, PCode.swap]]); // string, a+1, a
  if (sliceEnd === null) {
    merge(pcode, expression(base, program, options)); // string, a+1, a, string
    merge(pcode, [[PCode.slen]]); // string, a+1, a, len
  } else {
    merge(pcode, expression(sliceEnd, program, options)); // string, a+1, a, b
  }
  merge(pcode, [[PCode.swap, PCode.subt]]); // string, a+1, b-a
  merge(pcode, [[PCode.copy]]);
  return pcode;
};

/**
 * Encodes "<string>[i]" - a single character read out of the string `base`
 * leaves on the stack. Same two callers as stringSlice above.
 */
const stringCharacter = (
  base: VariableValue,
  index: Expression,
  program: Program,
  options: Options,
): number[][] => {
  const pcode: number[][] = [];
  pcode.push(...expression(index, program, options));
  if (program.language === "Pascal") {
    // Pascal string indexes start from 1 instead of 0
    merge(pcode, [[PCode.decr]]);
  }
  merge(pcode, expression(base, program, options));
  merge(pcode, [[PCode.test, PCode.plus, PCode.incr, PCode.lptr]]);
  if (program.language === "Python" || program.language === "TypeScript") {
    // Python and TypeScript have no character type, so a contextual type cast
    // won't pick this up. BASIC has none either, but it can't index a string.
    merge(pcode, [[PCode.ctos]]);
  }
  return pcode;
};

export default (
  exp: VariableValue,
  program: Program,
  options: Options,
): number[][] => {
  // Python dynamic list element ("x[i]")
  if (exp.variable.isList && exp.indexes.length > 0) {
    // ...possibly with a character index or slice applied to a string element
    // ("p[0][1]", "p[0][1:3]"). The subject is then the element, so the base
    // handed to the helpers below carries the list indexes and nothing else -
    // dropping stringIndex/slice is what stops it recursing back in here.
    if (exp.slice !== null || exp.stringIndex !== null) {
      const elementExp = makeVariableValue(exp.lexeme, exp.variable);
      elementExp.indexes.push(...exp.indexes);
      return exp.slice !== null
        ? stringSlice(elementExp, exp.slice, program, options)
        : stringCharacter(
            elementExp,
            exp.stringIndex as Expression,
            program,
            options,
          );
    }
    return listElementValue(exp, program, options);
  }

  const pcode: number[][] = [];

  if (isArray(exp.variable) && exp.indexes.length > 0) {
    const baseVariableExp = makeVariableValue(exp.lexeme, exp.variable); // same variable, no indexes
    pcode.push(...expression(baseVariableExp, program, options));
    for (let i = 0; i < exp.indexes.length; i += 1) {
      const index = exp.indexes[i];
      const indexExp = expression(index, program, options);
      merge(pcode, indexExp);
      if (
        exp.variable.arrayDimensions[i] &&
        exp.variable.arrayDimensions[i][0] !== 0
      ) {
        // subtract the start index if not indexed from 0
        merge(pcode, [
          [PCode.ldin, exp.variable.arrayDimensions[i][0], PCode.subt],
        ]);
      } else if (exp.variable.arrayDimensions[i] === undefined) {
        // the final index is to a character within an array of strings
        if (program.language === "Pascal") {
          // Pascal string indexes start from 1 instead of 0
          merge(pcode, [[PCode.decr]]);
        }
      }
      merge(pcode, [
        [PCode.swap, PCode.test, PCode.plus, PCode.incr, PCode.lptr],
      ]);
    }
  } // string slice ("s[a:b]") - Python only
  else if (exp.variable.type === "string" && exp.slice !== null) {
    const baseVariableExp = makeVariableValue(exp.lexeme, exp.variable); // same variable, no indexes/slice
    pcode.push(...stringSlice(baseVariableExp, exp.slice, program, options));
  } // character from string variable as array
  else if (exp.variable.type === "string" && exp.indexes.length > 0) {
    const baseVariableExp = makeVariableValue(exp.lexeme, exp.variable); // same variable, no indexes
    pcode.push(
      ...stringCharacter(baseVariableExp, exp.indexes[0], program, options),
    );
  } // predefined turtle property
  else if (exp.variable.turtle) {
    pcode.push([PCode.ldvg, turtleAddress(program) + exp.variable.turtle]);
  } // global variable
  else if (exp.variable.routine.__ === "Program") {
    pcode.push([PCode.ldvg, variableAddress(exp.variable)]);
  } // local reference variable (except arrays and strings)
  else if (
    exp.variable.isReferenceParameter &&
    !isArray(exp.variable) &&
    exp.variable.type !== "string"
  ) {
    pcode.push([
      PCode.ldvr,
      subroutineAddress(exp.variable.routine),
      variableAddress(exp.variable),
    ]);
  } // local value variable (and arrays and strings passed by reference)
  else {
    pcode.push([
      PCode.ldvv,
      subroutineAddress(exp.variable.routine),
      variableAddress(exp.variable),
    ]);
  }

  if (exp.variable.isPointer) {
    merge(pcode, [[PCode.lptr]]);
  }

  return pcode;
};
