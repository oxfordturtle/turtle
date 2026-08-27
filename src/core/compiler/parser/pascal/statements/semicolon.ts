import { CompilerError } from "../../../tools/error.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";

const parseSemicolon = (
  lexemes: Lexemes,
  compulsory = false,
  context = "statement",
): void => {
  // check for semicolon
  if (compulsory && lexemes.peek()?.content !== ";") {
    throw new CompilerError(
      `Semicolon needed after ${context}.`,
      lexemes.peek(-1),
    );
  }

  // move past any semicolons
  while (lexemes.peek()?.content === ";") {
    lexemes.advance();
  }
};

export default parseSemicolon;
