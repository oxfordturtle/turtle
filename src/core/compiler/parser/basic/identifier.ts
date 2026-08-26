import type { Type } from "../../lexer/types.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { SubroutineType } from "../definitions/routines/subroutine.ts";

export function identifier(lexemes: Lexemes): string {
  const identifier = lexemes.peek();

  if (!identifier) {
    throw new CompilerError(
      "{lex} must be followed by an identifier.",
      lexemes.peek(-1),
    );
  }

  if (identifier.type !== "identifier") {
    throw new CompilerError("{lex} is not a valid identifier.", identifier);
  }

  if (identifier.subtype === "turtle") {
    throw new CompilerError(
      "{lex} is already the name of a predefined Turtle property.",
      identifier,
    );
  }

  lexemes.advance();

  return identifier.content;
}

export function subroutineName(
  lexemes: Lexemes,
): [string, SubroutineType, Type, number] {
  const name = identifier(lexemes);

  let subroutineType: SubroutineType;
  if (name.slice(0, 4) === "PROC") {
    subroutineType = "procedure";
  } else if (name.slice(0, 2) === "FN") {
    subroutineType = "function";
  } else {
    throw new CompilerError(
      '{lex} is not a valid subroutine name. (Procedure names must begin with "PROC", and function names must begin with "FN".)',
      lexemes.peek(-1),
    );
  }

  const test = name.match(/\$(\d+)$/);
  let type: Type = "boolint";
  let stringLength = 64;
  if (name.slice(-1) === "$") {
    type = "string";
  } else if (test) {
    type = "string";
    stringLength = parseInt(test[1]!, 10); // group 1 of a successful match
  }

  return [name, subroutineType, type, stringLength];
}

export function variableName(lexemes: Lexemes): [string, Type, number] {
  const name = identifier(lexemes);

  const test = name.match(/\$(\d+)$/);
  let type: Type;
  let stringLength = 64;
  if (name.slice(-1) === "%") {
    type = "boolint";
  } else if (name.slice(-1) === "$") {
    type = "string";
  } else if (test) {
    type = "string";
    stringLength = parseInt(test[1]!, 10); // group 1 of a successful match
  } else {
    throw new CompilerError(
      '{lex} is not the name of any recognised command or a valid variable name. (Boolean and integer variables end with "%", and string variables end with "$".)',
      lexemes.peek(-1),
    );
  }

  return [name, type, stringLength];
}
