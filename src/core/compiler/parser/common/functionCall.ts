import type { Command } from "@/core/constants.ts";
import type { IdentifierLexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import basicBody from "../basic/body.ts";
import {
  type Expression,
  getListElementKind,
  getType,
} from "../definitions/expression.ts";
import makeFunctionCall, {
  type FunctionCall,
} from "../definitions/expressions/functionCall.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import {
  getSubroutineType,
  type Subroutine,
} from "../definitions/routines/subroutine.ts";
import makeVariable from "../definitions/variable.ts";
import parseArguments, { typeCheckArgument } from "./arguments.ts";

const parseFunctionCall = (
  lexeme: IdentifierLexeme,
  lexemes: Lexemes,
  routine: Routine,
  command: Command | Subroutine,
): FunctionCall => {
  if (command.kind === "Subroutine" && !command.typeIsCertain) {
    command.typeIsCertain = true;
    command.variables.unshift(makeVariable("!result", command));
  }

  const commandType =
    command.kind === "Command" ? command.type : getSubroutineType(command);
  if (commandType === "procedure") {
    throw new CompilerError(
      "{lex} is a procedure, not a function.",
      lexemes.peek(-1),
    );
  }

  const functionCall = makeFunctionCall(lexeme, command);
  parseArguments(lexeme, lexemes, routine, functionCall);

  if (
    functionCall.command.kind === "Subroutine" &&
    functionCall.command !== routine
  ) {
    if (
      routine.language === "BASIC" &&
      functionCall.command.statements.length === 0
    ) {
      const resumeFrom = lexemes.mark();
      basicBody(lexemes, functionCall.command);
      lexemes.seek(resumeFrom);
    }
  }

  return functionCall;
};

export default parseFunctionCall;

/**
 * `receiver` is any `Expression`, not just a variable, so that a string literal
 * (`'012'.find(s)`), a call result (`read(1).upper()`) or a chain
 * (`s.upper().lower()`) can all be a method receiver, as in real Python.
 */
export const parseMethodFunctionCall = (
  lexeme: IdentifierLexeme,
  lexemes: Lexemes,
  routine: Routine,
  method: Command,
  receiver: Expression,
): FunctionCall => {
  try {
    typeCheckArgument(
      routine.language,
      method,
      receiver,
      method.parameters[0]!,
    ); // a method declares its receiver
  } catch {
    throw new CompilerError(
      `Method "${method.names[routine.language]}" is not defined for type "${getType(
        receiver,
      )}".`,
      lexeme,
    );
  }

  const functionCall = makeFunctionCall(lexeme, method);
  functionCall.arguments.push(receiver);
  parseArguments(lexeme, lexemes, routine, functionCall);

  // ".copy()" returns a list of the receiver's element kind, which
  // Command.returns cannot express statically
  if (method.returnsList) {
    functionCall.listElementKind = getListElementKind(receiver);
  }

  return functionCall;
};
