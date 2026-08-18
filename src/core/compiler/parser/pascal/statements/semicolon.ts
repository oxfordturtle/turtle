import { CompilerError } from "../../../tools/error.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";

const parseSemicolon = (
  lexemes: Lexemes,
  compulsory = false,
  context = "statement",
): void => {
  // check for semicolon
  if (compulsory && (!lexemes.get() || lexemes.get()?.content !== ";")) {
    throw new CompilerError(
      `Semicolon needed after ${context}.`,
      lexemes.get(-1),
    );
  }

  // move past any semicolons
  while (lexemes.get() && lexemes.get()?.content === ";") {
    lexemes.next();
  }
};

export default parseSemicolon;
