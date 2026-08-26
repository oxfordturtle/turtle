import { PCode } from "@/core/constants.ts";
import type { OperatorLexeme } from "../../lexer/lexeme.ts";
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
  // N.B. stmt.lexeme is a KeywordLexeme, but the VariableAssignment constructor
  // wants an OperatorLexeme. It makes no difference here: the constructor only
  // reads `.content`, to spot a "+="/"-=" compound assignment, and a keyword is
  // neither. The two lexeme types have no subtype in common, hence the detour
  // through `unknown`.
  const statement = makeVariableAssignment(
    stmt.lexeme as unknown as OperatorLexeme,
    // a function's result variable, added when the function was defined
    stmt.routine.variables[0]!,
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
