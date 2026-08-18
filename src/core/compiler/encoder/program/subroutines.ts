import { PCode } from "@/core/constants.ts";
import { getMemoryNeeded } from "../../parser/definitions/routine.ts";
import {
  getParameters,
  getProgram,
  getSubroutineType,
  type Subroutine,
} from "../../parser/definitions/routines/subroutine.ts";
import {
  elementCount,
  getSubVariables,
  isArray,
  type Variable,
} from "../../parser/definitions/variable.ts";
import {
  lengthByteAddress,
  resultAddress,
  subroutineAddress,
  variableAddress,
} from "../addresses.ts";
import type { Options } from "../options.ts";
import statements from "./statements.ts";

export default (
  subroutines: Subroutine[],
  startLine: number,
  options: Options,
): number[][] => {
  const pcode: number[][] = [];

  for (const subroutine of subroutines) {
    subroutine.startLine = startLine;

    const startCode = subroutineStartCode(subroutine, options);
    const innerCode = statements(
      subroutine,
      startLine + startCode.length,
      options,
    );
    const subroutineCode = startCode.concat(innerCode);

    if (
      getSubroutineType(subroutine) === "procedure" ||
      subroutine.language === "Pascal"
    ) {
      // procedures always need end code, and so do Pascal functions; functions
      // in the other languages always include at least one RETURN
      const endCode = subroutineEndCode(subroutine, options);
      subroutineCode.push(...endCode);
    }

    startLine += subroutineCode.length;

    pcode.push(...subroutineCode);
  }

  return pcode;
};

const subroutineStartCode = (
  subroutine: Subroutine,
  options: Options,
): number[][] => {
  const pcode: number[][] = [];

  pcode.push([PCode.pssr, subroutine.index]);

  if (subroutine.variables.length > 0) {
    pcode.push([
      PCode.memc,
      subroutineAddress(subroutine),
      getMemoryNeeded(subroutine),
    ]);

    if (options.initialiseLocals) {
      if (subroutine.variables.length > getParameters(subroutine).length) {
        // TODO: speak to Peter about this - his latest compiler doesn't appear to be doing this in every case
        pcode.push([
          PCode.ldav,
          subroutineAddress(subroutine),
          1,
          PCode.ldin,
          getMemoryNeeded(subroutine),
          PCode.zptr,
        ]);
      }
    }

    for (const variable of subroutine.variables) {
      const setup = setupLocalVariable(variable);
      if (setup.length > 0) {
        pcode.push(...setup);
      }
    }

    // parameters were loaded onto the stack before the call
    const parameters = getParameters(subroutine);
    if (parameters.length > 0) {
      pcode.push([]);
      for (const parameter of parameters.reverse()) {
        const lastStartLine = pcode[pcode.length - 1];
        if (isArray(parameter) && !parameter.isReferenceParameter) {
          // TODO: copy the array
        } else if (
          parameter.type === "string" &&
          !parameter.isReferenceParameter
        ) {
          lastStartLine.push(
            PCode.ldvv,
            subroutineAddress(subroutine),
            variableAddress(parameter),
            PCode.cstr,
          );
        } else {
          // for booleans and integers, or longer reference parameters, just store the value/address
          lastStartLine.push(
            PCode.stvv,
            subroutineAddress(subroutine),
            variableAddress(parameter),
          );
        }
      }
    }
  }

  return pcode;
};

const setupLocalVariable = (variable: Variable): number[][] => {
  const subroutine = variable.routine as Subroutine;
  const pcode: number[][] = [];

  if (isArray(variable) && !variable.isReferenceParameter) {
    pcode.push([
      PCode.ldav,
      subroutineAddress(subroutine),
      lengthByteAddress(variable),
      PCode.stvv,
      subroutineAddress(subroutine),
      variableAddress(variable),
      PCode.ldin,
      elementCount(variable),
      PCode.stvv,
      subroutineAddress(subroutine),
      lengthByteAddress(variable),
    ]);
    for (const subVariable of getSubVariables(variable)) {
      const subPcode = setupLocalVariable(subVariable);
      if (subPcode.length > 0) {
        pcode.push(...subPcode);
      }
    }
    return pcode;
  }

  if (variable.type === "string") {
    pcode.push([
      PCode.ldav,
      subroutineAddress(subroutine),
      lengthByteAddress(variable) + 1,
      PCode.stvv,
      subroutineAddress(subroutine),
      variableAddress(variable),
      PCode.ldin,
      variable.stringLength + 1, // +1 for the actual length byte (??)
      PCode.stvv,
      subroutineAddress(subroutine),
      lengthByteAddress(variable),
    ]);
  }

  return pcode;
};

const subroutineEndCode = (
  subroutine: Subroutine,
  _options: Options,
): number[][] => {
  const pcode: number[] = [];
  if (getSubroutineType(subroutine) === "function") {
    pcode.push(
      PCode.ldvg,
      subroutineAddress(subroutine),
      PCode.stvg,
      resultAddress(getProgram(subroutine)),
    );
  }
  if (subroutine.variables.length > 0) {
    pcode.push(PCode.memr, subroutineAddress(subroutine));
  }
  pcode.push(PCode.plsr, PCode.retn);

  return [pcode];
};
