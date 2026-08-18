import { CompilerError } from "../../../tools/error.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";

export default (lexemes: Lexemes): void => {
  // a trailing comment on the same line. lexify.ts inserts a synthetic newline
  // after every comment lexeme, so skipping it falls through to the case below.
  while (lexemes.get()?.type === "comment") {
    lexemes.next();
  }
  if (lexemes.get()) {
    if (lexemes.get()?.content === ";") {
      lexemes.next();
      while (lexemes.get()?.type === "newline") {
        lexemes.next();
      }
    } else if (lexemes.get()?.type === "newline") {
      while (lexemes.get()?.type === "newline") {
        lexemes.next();
      }
    } else {
      throw new CompilerError(
        "Statement must be separated by a semicolon or placed on a new line.",
        lexemes.get(),
      );
    }
  }
};
