import type { KeywordLexeme, TypeLexeme } from "../../../lexer/lexeme.ts";
import type { Type } from "../../../lexer/types.ts";
import makeRoutine, { type RoutineCommon } from "../routine.ts";
import type { Variable } from "../variable.ts";
import type { Program } from "./program.ts";

export interface Subroutine extends RoutineCommon {
  readonly __: "Subroutine";
  readonly lexeme: KeywordLexeme | TypeLexeme; // the routine's initial (defining) lexeme
  readonly parent: Program | Subroutine;
  readonly level: -1; // needed for the usage data table
  hasReturnStatement: boolean; // for C, Java, Python, and TypeScript
  typeIsCertain: boolean;
  globals: string[]; // for Python
  nonlocals: string[]; // for Python
  indent: number; // for Python
  startLine: number; // first line in PCode (fixed later by the encoder module)
}

const makeSubroutine = (
  lexeme: KeywordLexeme | TypeLexeme,
  parent: Program | Subroutine,
  name = "",
): Subroutine => ({
  __: "Subroutine",
  ...makeRoutine(parent.language, name),
  lexeme,
  parent,
  level: -1,
  hasReturnStatement: false,
  typeIsCertain: parent.language === "Python" ? false : true,
  globals: [],
  nonlocals: [],
  indent: 0,
  startLine: 0,
});

export default makeSubroutine;

export const getParameters = (subroutine: Subroutine): Variable[] =>
  subroutine.variables.filter((x) => x.isParameter);

export const getProgram = (subroutine: Subroutine): Program =>
  subroutine.parent.__ === "Program"
    ? subroutine.parent
    : getProgram(subroutine.parent);

export const getResultVariable = (
  subroutine: Subroutine,
): Variable | undefined =>
  subroutine.variables.find((x) =>
    subroutine.language === "Pascal"
      ? x.name === "result"
      : x.name === "!result",
  );

export const getResultType = (subroutine: Subroutine): Type | null => {
  const resultVariable = getResultVariable(subroutine);
  return resultVariable ? resultVariable.type : null;
};

export type SubroutineType = "function" | "procedure";

export const getSubroutineType = (subroutine: Subroutine): SubroutineType =>
  getResultVariable(subroutine) ? "function" : "procedure";
