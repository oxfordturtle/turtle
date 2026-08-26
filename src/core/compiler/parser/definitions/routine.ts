import type { Language } from "@/core/constants.ts";
import type { Constant } from "./constant.ts";
import type { Statement } from "./statement.ts";
import { getLength, type Variable } from "./variable.ts";
import type { Program } from "./routines/program.ts";
import type { Subroutine } from "./routines/subroutine.ts";

export type Routine = Program | Subroutine;

export interface RoutineCommon {
  readonly language: Language;
  name: string;
  index: number;
  constants: Constant[];
  variables: Variable[];
  subroutines: Subroutine[];
  statements: Statement[];
}

const makeRoutine = (language: Language, name: string): RoutineCommon => ({
  language,
  name: language === "Pascal" ? name.toLowerCase() : name,
  index: 0,
  constants: [],
  variables: [],
  subroutines: [],
  statements: [],
});

export default makeRoutine;

export const getMemoryNeeded = (routine: Routine): number =>
  routine.variables.reduce((x, y) => x + getLength(y), 0);

export const getAllSubroutines = (routine: Routine): Subroutine[] => {
  const allSubroutines: Subroutine[] = [];
  for (const subroutine of routine.subroutines) {
    allSubroutines.push(...getAllSubroutines(subroutine));
    allSubroutines.push(subroutine);
  }
  return allSubroutines;
};
