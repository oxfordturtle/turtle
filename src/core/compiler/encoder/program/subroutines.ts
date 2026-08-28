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
  getLength,
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

export interface SubroutinesCode {
  /** the subroutines' pcode, back to back */
  readonly pcode: number[][];
  /**
   * where each subroutine's pcode begins. A call site emits the subroutine's
   * index, which encode.ts back-patches to the line number recorded here - it
   * is not knowable until every subroutine before it has been encoded.
   */
  readonly startLines: Map<Subroutine, number>;
}

export default (
  subroutines: Subroutine[],
  startLine: number,
  options: Options,
): SubroutinesCode => {
  const pcode: number[][] = [];
  const startLines = new Map<Subroutine, number>();

  for (const subroutine of subroutines) {
    startLines.set(subroutine, startLine);

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

  return { pcode, startLines };
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
      if (isArray(variable) && variable.isParameter) {
        // an array parameter's block is the parameter loop's business below: a
        // reference one has no block at all, and a by-value one's has to be
        // built after the copy, which overwrites it
        continue;
      }
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
        const lastStartLine = pcode[pcode.length - 1]!; // pushed just above
        if (isArray(parameter) && !parameter.isReferenceParameter) {
          // a by-value array is copied into the block this frame reserves for
          // it: point the variable's slot at that block, then copy the
          // caller's length byte and every element over it. The length is a
          // compile-time constant because a value array parameter declares its
          // dimensions, and the call site has checked the argument's against
          // them - the two blocks have the same shape, so copying the whole of
          // one over the other brings any nested strings and arrays with it
          lastStartLine.push(
            PCode.ldav,
            subroutineAddress(subroutine),
            lengthByteAddress(parameter),
            PCode.dupl,
            PCode.stvv,
            subroutineAddress(subroutine),
            variableAddress(parameter),
            PCode.ldin,
            getLength(parameter) - 1, // the block, less the pointer to it
            PCode.cptr,
          );
          // what the copy brought with it includes the caller's own internal
          // pointers, so the block's pointers and length bytes are rebuilt to
          // point within this copy
          pcode.push(...setupLocalVariable(parameter));
        } else if (
          parameter.type === "string" &&
          !parameter.isReferenceParameter
        ) {
          // a by-value string is copied into the local buffer
          // setupLocalVariable made for it
          lastStartLine.push(
            PCode.ldvv,
            subroutineAddress(subroutine),
            variableAddress(parameter),
            PCode.cstr,
          );
        } else {
          // booleans and integers, and everything held as an address: a
          // reference parameter of any type, and so an array parameter in
          // every language but Pascal, whose value parameter is the copy
          // above. The value or address is stored as it stands
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

  if (getLength(variable) === 1) {
    // Whatever holds an address rather than a block of its own - a reference
    // parameter, a pointer, a list - has exactly the one word getLength gives
    // it, as has a plain integer or boolean. There is nothing to set up, and
    // no room to try: a string's two length bytes would go into the word after
    // this variable's, which belongs to the one declared next.
    return pcode;
  }

  if (isArray(variable)) {
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

  // a string is the only other thing with a block of its own: getLength gives a
  // block to arrays, handled above, and to strings, and one word to everything
  // else, returned above
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
