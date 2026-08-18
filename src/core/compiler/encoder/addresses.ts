import {
  getAllSubroutines,
  getMemoryNeeded,
} from "../parser/definitions/routine.ts";
import makeProgram, {
  getTurtleVariables,
  type Program,
} from "../parser/definitions/routines/program.ts";
import {
  getSubroutineType,
  type Subroutine,
} from "../parser/definitions/routines/subroutine.ts";
import {
  elementCount,
  getLength,
  type SubVariable,
  type Variable,
} from "../parser/definitions/variable.ts";

const baseGlobals = 12; // turtle, keybuffer, and 10 file handles
const baseOffset = 11; // baseGlobals - 1

export const turtleAddress = (program: Program): number => {
  const allSubroutines = getAllSubroutines(program);
  const subroutinePointers = allSubroutines.some(
    (x) => getSubroutineType(x) === "function",
  )
    ? allSubroutines.length + 1
    : allSubroutines.length;
  return subroutinePointers + baseGlobals;
};

export const resultAddress = (program: Program): number => {
  const allSubroutines = getAllSubroutines(program);
  return allSubroutines.length + baseGlobals;
};

export const subroutineAddress = (subroutine: Subroutine): number =>
  subroutine.index + baseOffset;

export const variableAddress = (variable: Variable | SubVariable): number => {
  if ("variable" in variable) {
    return lengthByteAddress(variable.variable) + variable.index + 1;
  } else {
    const arrayIndex = variable.routine.variables.indexOf(variable);
    const routine = makeProgram(variable.routine.language);
    routine.variables = variable.routine.variables.slice(0, arrayIndex);
    return variable.routine.__ === "Program"
      ? turtleAddress(variable.routine) +
          getTurtleVariables(variable.routine).length +
          getMemoryNeeded(routine) +
          1
      : getMemoryNeeded(routine) + 1;
  }
};

export const lengthByteAddress = (variable: Variable | SubVariable): number => {
  if ("variable" in variable) {
    const base =
      lengthByteAddress(variable.variable) +
      elementCount(variable.variable) +
      1;
    return base + (getLength(variable) - 1) * variable.index; // length - 1 because we don't want to count the pointer here
  } else {
    return variableAddress(variable) + 1;
  }
};
