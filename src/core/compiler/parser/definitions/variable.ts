import { foldCase } from "@/core/constants.ts";
import type { Type } from "../../lexer/types.ts";
import type { Routine } from "./routine.ts";
import type { Subroutine } from "./routines/subroutine.ts";

export interface Variable {
  readonly kind: "Variable";
  readonly name: string;
  readonly routine: Routine;
  readonly isGlobal: boolean;
  isParameter: boolean;
  isReferenceParameter: boolean;
  isPointer: boolean;
  type: Type;
  typeIsCertain: boolean;
  turtle?: number; // index of turtle variable (if this is one)
  stringLength: number;
  arrayDimensions: [number, number][]; // for array variables
  // a list variable's own fixed slot holds one integer, the list's current heap
  // base address; isList and arrayDimensions are mutually exclusive
  isList: boolean;
  listElementKind?: "integer" | "string"; // matches the machine's decodeLp binary split; undefined until inferred
  listDimensions?: number; // reserved for lp/size encoding; always 1 for Python's dynamic lists today
  // each element is an independently allocated list referenced by an opaque
  // pointer, so listElementKind stays "integer"; innerListElementKind is the
  // sublist's own scalar kind, used for type-checking and never read by the
  // encoder. Two levels only - every usage in the example corpus is two.
  isListOfLists?: boolean;
  innerListElementKind?: "integer" | "string";
  private?: Subroutine; // subroutine for private variables (BASIC only)
}

const makeVariable = (name: string, routine: Routine): Variable => ({
  kind: "Variable",
  name: foldCase(routine.language, name),
  routine,
  isGlobal: routine.kind === "Program",
  isParameter: false,
  isReferenceParameter: false,
  isPointer: false,
  type: "boolint",
  typeIsCertain: routine.language === "Python" ? false : true,
  stringLength: 64,
  arrayDimensions: [],
  isList: false,
});

export default makeVariable;

export const isArray = (variable: Variable): boolean =>
  variable.arrayDimensions.length > 0;

export const baseLength = (variable: Variable): number =>
  variable.type === "string"
    ? variable.stringLength + 3 // 3 = pointer + max length byte + actual length byte
    : 1;

// deno-coverage-ignore-start -- the ": 0" arm is unreachable: all three
// callers (encoder/addresses.ts, encoder/program/programStart.ts and
// encoder/program/subroutines.ts) either test isArray() first or pass a
// SubVariable's parent, and getSubVariables only ever creates a SubVariable
// under an array. (The array arm is live and tested; it sits inside this
// range only because a branch cannot be excluded mid-expression.)
export const elementCount = (variable: Variable): number =>
  // isArray() is exactly "arrayDimensions is non-empty", so the subscript holds
  isArray(variable)
    ? variable.arrayDimensions[0]![1] - variable.arrayDimensions[0]![0] + 1
    : 0;
// deno-coverage-ignore-stop

export const getLength = (variable: Variable): number => {
  // these all simply hold an address - an array parameter included, whether it
  // was declared by reference or by value: no language here declares the size
  // of an array parameter, so the callee has nowhere to copy one into and takes
  // the caller's array as it stands
  if (
    variable.isReferenceParameter ||
    variable.isPointer ||
    variable.isList ||
    (variable.isParameter && isArray(variable))
  ) {
    return 1;
  }

  if (isArray(variable)) {
    // every element has the same length, so measure one rather than building
    // a SubVariable for all of them
    return getLength(makeSubVariable(variable, 0)) * elementCount(variable) + 2; // +2 for pointer and length byte
  }

  return baseLength(variable);
};

export const getSubVariables = (variable: Variable): SubVariable[] => {
  const subVariables: SubVariable[] = [];
  if (isArray(variable)) {
    for (let i = 0; i < elementCount(variable); i += 1) {
      subVariables.push(makeSubVariable(variable, i));
    }
  }
  return subVariables;
};

export interface SubVariable extends Variable {
  readonly variable: Variable | SubVariable;
  readonly index: number;
}

export const makeSubVariable = (
  variable: Variable | SubVariable,
  index: number,
): SubVariable => ({
  ...makeVariable(`${variable.name}_${index.toString(10)}`, variable.routine),
  isGlobal: variable.isGlobal,
  isParameter: variable.isParameter,
  isReferenceParameter: variable.isReferenceParameter,
  isPointer: variable.isPointer,
  type: variable.type,
  typeIsCertain: variable.typeIsCertain,
  turtle: variable.turtle,
  stringLength: variable.stringLength,
  arrayDimensions: variable.arrayDimensions.slice(1),
  private: variable.private,
  variable,
  index,
});
