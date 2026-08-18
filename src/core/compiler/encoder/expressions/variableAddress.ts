import { PCode } from "@/core/constants.ts";
import type { VariableAddress } from "../../parser/definitions/expressions/variableAddress.ts";
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
import merge from "../merge.ts";
import type { Options } from "../options.ts";

export default (
  exp: VariableAddress | VariableValue,
  program: Program,
  options: Options,
): number[][] => {
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
        // this means the final index expression is to a character within an array of strings
        if (program.language === "Pascal") {
          merge(pcode, [[PCode.decr]]); // Pascal strings are indexed from 1 instead of zero
        }
      }
      merge(pcode, [[PCode.swap, PCode.test, PCode.plus, PCode.incr]]);
    }
  } // character from string variable as array
  else if (exp.variable.type === "string" && exp.indexes.length > 0) {
    pcode.push(...expression(exp.indexes[0], program, options));
    if (program.language === "Pascal") {
      // Pascal string indexes start from 1 instead of 0
      merge(pcode, [[PCode.decr]]);
    }
    const baseVariableExp = makeVariableValue(exp.lexeme, exp.variable); // same variable, no indexes
    merge(pcode, expression(baseVariableExp, program, options));
    merge(pcode, [[PCode.test, PCode.plus, PCode.incr]]);
  } // predefined turtle property
  else if (exp.variable.turtle) {
    pcode.push([PCode.ldag, turtleAddress(program) + exp.variable.turtle]);
  } // global variable
  else if (exp.variable.routine.__ === "Program") {
    pcode.push([PCode.ldag, variableAddress(exp.variable)]);
  } // local variable
  else {
    pcode.push([
      PCode.ldav,
      subroutineAddress(exp.variable.routine),
      variableAddress(exp.variable),
    ]);
  }

  return pcode;
};
