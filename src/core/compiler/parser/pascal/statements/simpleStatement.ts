import { type IdentifierLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import * as find from "../../common/find.ts";
import parseProcedureCall from "../../common/procedureCall.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import type { Subroutine } from "../../definitions/routines/subroutine.ts";
import type { ProcedureCall } from "../../definitions/statements/procedureCall.ts";
import type { VariableAssignment } from "../../definitions/statements/variableAssignment.ts";
import parseVariableAssignment from "./variableAssignment.ts";

const parseSimpleStatement = (
  lexeme: IdentifierLexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
): VariableAssignment | ProcedureCall => {
  // look for a constant (for meaningful error message)
  const constant = find.constant(routine, lexeme.value);
  if (constant) {
    throw new CompilerError("{lex} is a constant, not a variable.", lexeme);
  }

  // look for a variable
  // N.B. look for variable before command, in case variable name overwrites a native command
  const variable = find.variable(routine, lexeme.value);
  if (variable) {
    lexemes.next();
    return parseVariableAssignment(lexeme, lexemes, routine, variable);
  }

  // look for a command
  const command = find.command(routine, lexeme.value);
  if (command) {
    lexemes.next();
    return parseProcedureCall(lexeme, lexemes, routine, command);
  }

  // if there are no matches, throw an error
  throw new CompilerError("Identifier {lex} is not defined.", lexeme);
};

export default parseSimpleStatement;
