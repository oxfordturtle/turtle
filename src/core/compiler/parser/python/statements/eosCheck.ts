import { CompilerError } from "../../../tools/error.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";

export default (lexemes: Lexemes): void => {
  // a trailing comment on the same line. lexify.ts inserts a synthetic newline
  // after every comment lexeme, so skipping it falls through to the case below.
  while (lexemes.peek()?.type === "comment") {
    lexemes.advance();
  }
  if (lexemes.peek()) {
    if (lexemes.match(";")) {
      while (lexemes.peek()?.type === "newline") {
        lexemes.advance();
      }
    } else if (lexemes.peek()?.type === "newline") {
      while (lexemes.peek()?.type === "newline") {
        lexemes.advance();
      }
    } else {
      throw new CompilerError(
        "Statement must be separated by a semicolon or placed on a new line.",
        lexemes.peek(),
      );
    }
  }
};
