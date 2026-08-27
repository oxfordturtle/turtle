import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import makeProgram, { type Program } from "../definitions/routines/program.ts";

export default function program(lexemes: Lexemes): Program {
  const keyword = lexemes.at(0);
  const identifier = lexemes.at(1);
  const openingBracket = lexemes.at(2);
  const closingBracket = lexemes.at(lexemes.length - 1);

  // "class" check
  if (!keyword) {
    throw new CompilerError('Program must begin with keyword "class".');
  }
  if (keyword.content !== "class") {
    throw new CompilerError(
      'Program must begin with keyword "class".',
      keyword,
    );
  }

  // identifier (program name) check
  if (!identifier) {
    throw new CompilerError(
      "{lex} must be followed by a program name.",
      keyword,
    );
  }
  if (identifier.type !== "identifier") {
    throw new CompilerError("{lex} is not a valid program name.", identifier);
  }
  if (identifier.subtype === "turtle") {
    throw new CompilerError(
      "{lex} is the name of a predefined Turtle attribute, and cannot be used as the name of the program.",
      identifier,
    );
  }
  const firstCharacterCode = (identifier.content as string).charCodeAt(0);
  if (firstCharacterCode < 65 || firstCharacterCode > 90) {
    throw new CompilerError(
      "Program name must begin with a capital letter.",
      identifier,
    );
  }

  // opening curly bracket
  if (!openingBracket) {
    throw new CompilerError(
      'Program name must be followed by an opening bracket "{".',
      identifier,
    );
  }
  if (openingBracket.content !== "{") {
    throw new CompilerError(
      'Program name must be followed by an opening bracket "{".',
      openingBracket,
    );
  }

  // closing curly bracket
  // deno-coverage-ignore-start -- unreachable: lexemes[length - 1] is only
  // undefined when the lexeme array is empty, in which case `keyword` was
  // undefined too and the "class" check above has already thrown
  if (!closingBracket) {
    throw new CompilerError(
      'Program must end with a closing bracket "}".',
      lexemes.at(lexemes.length - 1),
    );
  }
  // deno-coverage-ignore-stop
  if (closingBracket.content !== "}") {
    throw new CompilerError(
      'Program must end with a closing bracket "}".',
      // TODO: one past the last lexeme is always undefined, so this error
      // reaches the user without a line or character. It should be
      // `closingBracket`. Left as it is here to keep the refactor behavioural
      // a no-op.
      lexemes.at(lexemes.length),
    );
  }

  const prog = makeProgram("Java", identifier.content as string);
  lexemes.setBody(prog, 3, lexemes.length - 1);

  return prog;
}
