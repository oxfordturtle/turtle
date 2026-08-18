import { type IdentifierLexeme } from "../../../lexer/lexeme.ts";
import * as find from "../../common/find.ts";
import parseProcedureCall from "../../common/procedureCall.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import {
  getProgram,
  type Subroutine,
} from "../../definitions/routines/subroutine.ts";
import { type ProcedureCall } from "../../definitions/statements/procedureCall.ts";
import { type VariableAssignment } from "../../definitions/statements/variableAssignment.ts";
import { variable } from "../variable.ts";
import parseVariableAssignment from "./variableAssignment.ts";

const parseSimpleStatement = (
  lexeme: IdentifierLexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
): VariableAssignment | ProcedureCall => {
  // check for command
  const foo = find.command(routine, lexeme.content);
  if (foo) {
    lexemes.next();
    return parseProcedureCall(lexeme, lexemes, routine, foo);
  }

  // check for variable
  const bar = find.variable(routine, lexeme.content);
  if (bar) {
    lexemes.next();
    return parseVariableAssignment(lexeme, lexemes, routine, bar);
  }

  // otherwise create the variable as a global
  const program = routine.__ === "Program" ? routine : getProgram(routine);
  const baz = variable(lexemes, program);
  program.variables.push(baz);
  return parseVariableAssignment(lexeme, lexemes, routine, baz);
};

export default parseSimpleStatement;
