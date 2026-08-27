import { CompilerError } from "../../tools/error.ts";
import * as find from "../common/find.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";

/**
 * `duplicateCheck` is TypeScript's: it hoists its declarations on a first
 * pass, so the second pass sees each of them again and must not object to the
 * name it has already recorded. C and Java are single-pass here and leave it
 * alone.
 */
export default function identifier(
  lexemes: Lexemes,
  routine: Routine,
  duplicateCheck = true,
): string {
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

  if (duplicateCheck && find.isDuplicate(routine, identifier.value)) {
    throw new CompilerError(
      "{lex} is already defined in the current scope.",
      identifier,
    );
  }

  lexemes.advance();

  return identifier.value;
}
