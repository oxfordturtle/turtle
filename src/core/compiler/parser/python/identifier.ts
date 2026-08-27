import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import * as find from "../common/find.ts";

export default (
  lexemes: Lexemes,
  routine: Routine,
  duplicateCheck: boolean,
): string => {
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

  if (duplicateCheck) {
    if (identifier.subtype === "turtle") {
      throw new CompilerError(
        "{lex} is already the name of a Turtle attribute.",
        identifier,
      );
    }
    if (find.isDuplicate(routine, identifier.value)) {
      throw new CompilerError(
        "{lex} is already the name of a variable or subroutine in the current scope.",
        identifier,
      );
    }
  }

  lexemes.advance();

  return identifier.value;
};
