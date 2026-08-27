import { PCode, trueValue } from "@/core/constants.ts";
import {
  getTurtleVariables,
  type Program,
} from "../../parser/definitions/routines/program.ts";
import { getMemoryNeeded } from "../../parser/definitions/routine.ts";
import {
  elementCount,
  getSubVariables,
  isArray,
  type Variable,
} from "../../parser/definitions/variable.ts";
import {
  lengthByteAddress,
  turtleAddress,
  variableAddress,
} from "../addresses.ts";
import type { Options } from "../options.ts";

export default (program: Program, _options: Options): number[][] => {
  const turtleStart = turtleAddress(program);
  const turtleVariableCount = getTurtleVariables(program).length;
  const memoryNeeded = getMemoryNeeded(program);

  const pcode = [
    // line 1: global memory
    [
      PCode.ldin,
      turtleStart,
      PCode.dupl,
      PCode.dupl,
      PCode.ldin,
      0, // address of the turtle pointer
      PCode.sptr,
      PCode.ldin,
      turtleVariableCount,
      PCode.swap,
      PCode.sptr,
      PCode.incr,
      PCode.ldin,
      memoryNeeded + turtleVariableCount,
      PCode.zptr,
      PCode.ldin,
      turtleStart + memoryNeeded + turtleVariableCount,
      PCode.stmt,
    ],
    // line 2: turtle and keybuffer setup
    [
      PCode.true,
      trueValue[program.language],
      PCode.home,
      PCode.ldin,
      2,
      PCode.thik,
      PCode.ldin,
      360,
      PCode.angl,
      PCode.ldin,
      32,
      PCode.bufr,
      PCode.ldin,
      1, // address of the keybuffer pointer
      PCode.sptr,
      PCode.hfix,
      PCode.ldin,
      0,
      PCode.dupl,
      PCode.ldin,
      1000,
      PCode.dupl,
      PCode.dupl,
      PCode.dupl,
      PCode.reso,
      PCode.canv,
    ],
  ];

  for (const variable of program.variables) {
    const setup = setupGlobalVariable(variable);
    if (setup.length > 0) {
      pcode.push(...setup);
    }
  }

  return pcode;
};

const setupGlobalVariable = (variable: Variable): number[][] => {
  const pcode: number[][] = [];

  if (isArray(variable)) {
    pcode.push([
      PCode.ldag,
      lengthByteAddress(variable),
      PCode.stvg,
      variableAddress(variable),
      PCode.ldin,
      elementCount(variable),
      PCode.stvg,
      lengthByteAddress(variable),
    ]);
    for (const subVariable of getSubVariables(variable)) {
      const subPcode = setupGlobalVariable(subVariable);
      if (subPcode.length > 0) {
        pcode.push(...subPcode);
      }
    }
  } else if (variable.type === "string") {
    pcode.push([
      PCode.ldag,
      lengthByteAddress(variable) + 1,
      PCode.stvg,
      variableAddress(variable),
      PCode.ldin,
      variable.stringLength + 1, // +1 for the actual length byte (??)
      PCode.stvg,
      lengthByteAddress(variable),
    ]);
  }

  return pcode;
};
