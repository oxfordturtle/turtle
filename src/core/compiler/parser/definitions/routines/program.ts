import type { Language } from "@/core/constants.ts";
import makeVariable, { type Variable } from "../variable.ts";
import makeRoutine, { type RoutineCommon } from "../routine.ts";

export interface Program extends RoutineCommon {
  readonly kind: "Program";
}

const makeProgram = (language: Language, name = "!"): Program => ({
  kind: "Program",
  ...makeRoutine(language, name),
});

export default makeProgram;

export const getTurtleVariables = (program: Program): Variable[] => [
  makeTurtleVariable("x", program),
  makeTurtleVariable("y", program),
  makeTurtleVariable("d", program),
  makeTurtleVariable("a", program),
  makeTurtleVariable("t", program),
  makeTurtleVariable("c", program),
];

type TurtleVariableName = "x" | "y" | "d" | "a" | "t" | "c";

const makeTurtleVariable = (
  name: TurtleVariableName,
  program: Program,
): Variable => {
  const fullName =
    program.language === "BASIC" ? `turt${name}%` : `turt${name}`;
  const variable = makeVariable(fullName, program);
  variable.type = "integer";
  variable.typeIsCertain = true;
  variable.turtle = ["x", "y", "d", "a", "t", "c"].indexOf(name) + 1;
  return variable;
};
