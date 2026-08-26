import type { Command } from "@/core/constants.ts";
import type { IdentifierLexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import basicBody from "../basic/body.ts";
import type { VariableValue } from "../definitions/expressions/variableValue.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import {
  getSubroutineType,
  type Subroutine,
} from "../definitions/routines/subroutine.ts";
import makeProcedureCall, {
  type ProcedureCall,
} from "../definitions/statements/procedureCall.ts";
import parseArguments, { typeCheckArgument } from "./arguments.ts";

const parseProcedureCall = (
  lexeme: IdentifierLexeme,
  lexemes: Lexemes,
  routine: Routine,
  command: Command | Subroutine,
): ProcedureCall => {
  if (
    routine.language === "BASIC" ||
    routine.language === "Pascal" ||
    routine.language === "C" ||
    routine.language === "Java"
  ) {
    const commandType =
      command.kind === "Command" ? command.type : getSubroutineType(command);
    if (commandType === "function") {
      throw new CompilerError("{lex} is a function, not a procedure.", lexeme);
    }
  }

  const procedureCall = makeProcedureCall(lexeme, command);
  parseArguments(lexeme, lexemes, routine, procedureCall);
  if (
    procedureCall.command.kind === "Subroutine" &&
    procedureCall.command !== routine
  ) {
    if (
      routine.language === "BASIC" &&
      procedureCall.command.statements.length === 0
    ) {
      const resumeFrom = lexemes.mark();
      basicBody(lexemes, procedureCall.command);
      lexemes.seek(resumeFrom);
    }
  }

  return procedureCall;
};

export default parseProcedureCall;

/** "mylist.append(64)" as a bare statement, with no assignment. */
export const parseMethodProcedureCall = (
  lexeme: IdentifierLexeme,
  lexemes: Lexemes,
  routine: Routine,
  method: Command,
  variableValue: VariableValue,
): ProcedureCall => {
  try {
    typeCheckArgument(
      routine.language,
      method,
      variableValue,
      method.parameters[0]!, // a method declares its receiver
    );
  } catch {
    throw new CompilerError(
      `Method "${
        method.names[routine.language]
      }" is not defined for type "${variableValue.variable.type}".`,
      lexeme,
    );
  }

  const procedureCall = makeProcedureCall(lexeme, method);
  procedureCall.arguments.push(variableValue);
  parseArguments(lexeme, lexemes, routine, procedureCall);

  return procedureCall;
};
