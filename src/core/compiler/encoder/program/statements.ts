import { type Routine } from "../../parser/definitions/routine.ts";
import { getProgram } from "../../parser/definitions/routines/subroutine.ts";
import type { Options } from "../options.ts";
import statement from "../statement.ts";

export default (
  routine: Routine,
  startLine: number,
  options: Options,
): number[][] => {
  const program = routine.__ === "Subroutine" ? getProgram(routine) : routine;
  const pcode: number[][] = [];
  for (const stmt of routine.statements) {
    pcode.push(...statement(stmt, program, startLine + pcode.length, options));
  }
  return pcode;
};
