import type { Language } from "@/core/constants.ts";
import type { Constant } from "./constant.ts";
import type { Mark } from "./lexemes.ts";
import type { Statement } from "./statement.ts";
import { getLength, type Variable } from "./variable.ts";
import type { Program } from "./routines/program.ts";
import type { Subroutine } from "./routines/subroutine.ts";

export type Routine = Program | Subroutine;

export interface RoutineCommon {
  readonly language: Language;
  name: string;
  index: number;
  // the first lexeme of this routine's body, and the one just past its end
  start: Mark;
  end: Mark;
  constants: Constant[];
  variables: Variable[];
  subroutines: Subroutine[];
  statements: Statement[];
  // how many "while"/"for" loops the parser is currently inside, for this
  // routine's own body - not the routine's calling context, since a nested
  // subroutine's "break"/"continue" can never target a loop in an enclosing
  // routine (real Python scopes them the same way). Parse-time only; the
  // encoder doesn't read it.
  loopDepth: number;
}

const makeRoutine = (language: Language, name: string): RoutineCommon => ({
  language,
  name: language === "Pascal" ? name.toLowerCase() : name,
  index: 0,
  start: 0,
  end: 0,
  constants: [],
  variables: [],
  subroutines: [],
  statements: [],
  loopDepth: 0,
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
