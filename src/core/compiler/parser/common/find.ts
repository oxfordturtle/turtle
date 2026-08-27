import {
  type Colour,
  colours,
  type Command,
  commands,
  foldCase,
  type Input,
  inputs,
} from "@/core/constants.ts";
import type { Constant } from "../definitions/constant.ts";
import { type Routine } from "../definitions/routine.ts";
import { getTurtleVariables } from "../definitions/routines/program.ts";
import {
  getProgram,
  type Subroutine,
} from "../definitions/routines/subroutine.ts";
import type { Variable } from "../definitions/variable.ts";

export const constant = (
  routine: Routine,
  name: string,
): Constant | undefined => {
  const searchName = foldCase(routine.language, name);
  const match = routine.constants.find((x) => x.name === searchName);
  if (match) {
    return match;
  }
  if (routine.kind === "Subroutine") {
    return constant(routine.parent, name);
  }
};

export const colour = (routine: Routine, name: string): Colour | undefined => {
  const tempName = foldCase(routine.language, name);
  const searchName = tempName.replace(/gray$/, "grey").replace(/GRAY$/, "GREY"); // allow American spelling
  return colours.find((x) => x.names[routine.language] === searchName);
};

export const input = (routine: Routine, name: string): Input | undefined => {
  const searchName = foldCase(routine.language, name);
  return inputs.find((x) => x.name === searchName);
};

export const query = (routine: Routine, name: string): Input | undefined => {
  const searchName = foldCase(routine.language, name);
  return inputs
    .filter((input) => input.value < 0)
    .find((x) => x.name === searchName);
};

export const variable = (
  routine: Routine,
  name: string,
  origin: Routine = routine,
): Variable | undefined => {
  const searchName = foldCase(routine.language, name);

  const turtleVariables =
    routine.kind === "Program"
      ? getTurtleVariables(routine)
      : getTurtleVariables(getProgram(routine));
  const turtleVariable = turtleVariables.find((x) => x.name === searchName);
  if (turtleVariable) {
    return turtleVariable;
  }

  if (routine.language === "Python" && routine.kind === "Subroutine") {
    const isGlobal = routine.globals.indexOf(name) > -1;
    if (isGlobal) {
      return variable(getProgram(routine), name, origin);
    }
  }

  let match = routine.variables.find((x) => x.name === name);
  if (match === undefined && routine.kind === "Subroutine") {
    match = variable(routine.parent, name, origin);
  }
  if (match) {
    if (match.private && match.private !== origin) {
      // BASIC private variables are visible only in their own routine
      return undefined;
    }
    return match;
  }
};

/**
 * Resolves what `name = ...` (or `for name in ...:`) binds to. Unlike
 * `variable()` above, which is for reads and does fall through to an enclosing
 * scope, an assignment target must *not* walk up just because a same-named
 * variable exists there: real Python makes a name assigned anywhere in a
 * function body local to the whole function, unless declared `global` or
 * `nonlocal`.
 *
 * Undefined if no local binding exists yet, in which case the caller creates a
 * fresh local.
 */
export const assignmentTarget = (
  routine: Routine,
  name: string,
): Variable | undefined => {
  // foldCase is a no-op here in practice: assignmentTarget exists for
  // Python's binding rules (see the doc comment above) and is only called from
  // python/statement.ts and python/statements/forStatement.ts. It is kept for
  // symmetry with variable() above.
  const searchName = foldCase(routine.language, name);

  const turtleVariables =
    routine.kind === "Program"
      ? getTurtleVariables(routine)
      : getTurtleVariables(getProgram(routine));
  const turtleVariable = turtleVariables.find((x) => x.name === searchName);
  if (turtleVariable) {
    return turtleVariable;
  }

  if (routine.language === "Python" && routine.kind === "Subroutine") {
    if (routine.globals.indexOf(name) > -1) {
      return variable(getProgram(routine), name);
    }
    if (routine.nonlocals.indexOf(name) > -1) {
      return variable(routine.parent, name);
    }
  }

  return routine.variables.find((x) => x.name === name);
};

export const isDuplicate = (routine: Routine, name: string): boolean => {
  const searchName = foldCase(routine.language, name);
  if (routine.constants.some((x) => x.name === searchName)) return true;
  // no check against `routine.globals`, unlike `nonlocals` below:
  // python/subroutine.ts's hoisting pass has already created the Program-level
  // variable, so the `variables` check below catches it first
  if (routine.language === "Python" && routine.kind === "Subroutine") {
    if (routine.nonlocals.some((x) => x === searchName)) return true;
  }
  if (routine.variables.some((x) => x.name === searchName)) return true;
  if (routine.subroutines.some((x) => x.name === searchName)) return true;
  return false;
};

export const subroutine = (
  routine: Routine,
  name: string,
): Subroutine | undefined => {
  const searchName = foldCase(routine.language, name);
  const match = routine.subroutines.find((x) => x.name === searchName);
  if (match) {
    return match;
  }
  if (routine.kind === "Subroutine") {
    // only needed for Pascal, where a recursive self-reference occurs before
    // the subroutine has been added to its parent
    if (routine.name === searchName) {
      return routine;
    }
    return subroutine(routine.parent, searchName);
  }
};

export const nativeCommand = (
  routine: Routine,
  name: string,
  // whether the method's receiver is a list
  receiverIsList?: boolean,
): Command | undefined => {
  const searchName = foldCase(routine.language, name);
  const candidates = commands.filter(
    (x) => x.names[routine.language] === searchName,
  );
  // a list method can collide by spelling with a non-list command of the same
  // name (".index"), so `receiverIsList` disambiguates
  if (receiverIsList) {
    return (
      candidates.find((x) => x.forList) ?? candidates.find((x) => !x.forList)
    );
  }
  return candidates.find((x) => !x.forList) ?? candidates[0];
};

export const command = (
  routine: Routine,
  name: string,
): Command | Subroutine | undefined =>
  // N.B. custom subroutines have priority
  subroutine(routine, name) || nativeCommand(routine, name);
