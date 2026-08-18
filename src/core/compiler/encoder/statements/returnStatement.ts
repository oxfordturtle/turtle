import { PCode } from "@/core/constants.ts";
import type { Program } from "../../parser/definitions/routines/program.ts";
import type { ReturnStatement } from "../../parser/definitions/statements/returnStatement.ts";
import makeVariableAssignment from "../../parser/definitions/statements/variableAssignment.ts";
import { resultAddress, subroutineAddress } from "../addresses.ts";
import type { Options } from "../options.ts";
import variableAssignment from "./variableAssignment.ts";

export default (
  stmt: ReturnStatement,
  program: Program,
  startLine: number,
  options: Options,
): number[][] => {
  // N.B. stmt.lexeme is a KeywordLexeme, but VariableAssignment constructor
  // requires an IdentifierLexeme; it makes no difference here
  const statement = makeVariableAssignment(
    stmt.lexeme as any,
    stmt.routine.variables[0],
    [],
    stmt.value,
  );

  const pcode = variableAssignment(statement, program, startLine, options);
  pcode.push([
    PCode.ldvg,
    subroutineAddress(stmt.routine),
    PCode.stvg,
    resultAddress(program),
    PCode.memr,
    subroutineAddress(stmt.routine),
    PCode.plsr,
    PCode.retn,
  ]);

  return pcode;
};
