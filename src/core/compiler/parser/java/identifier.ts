import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import * as find from "../common/find.ts";

export default function identifier(lexemes: Lexemes, routine: Routine): string {
  const identifier = lexemes.get();

  // deno-coverage-ignore-start -- unreachable: identifier() is only ever
  // called right after type() has succeeded, whose last consumed lexeme (a
  // type keyword, ")", or "]") can never be the program's final lexeme --
  // program.ts guarantees that's "}" -- so the stream cannot be dry here
  if (!identifier) {
    throw new CompilerError(
      "{lex} must be followed by an identifier.",
      lexemes.get(-1),
    );
  }
  // deno-coverage-ignore-stop

  if (identifier.type !== "identifier") {
    throw new CompilerError("{lex} is not a valid identifier.", identifier);
  }

  if (identifier.subtype === "turtle") {
    throw new CompilerError(
      "{lex} is already the name of a predefined Turtle property.",
      identifier,
    );
  }

  if (find.isDuplicate(routine, identifier.value)) {
    throw new CompilerError(
      "{lex} is already defined in the current scope.",
      identifier,
    );
  }

  lexemes.next();

  return identifier.value;
}
