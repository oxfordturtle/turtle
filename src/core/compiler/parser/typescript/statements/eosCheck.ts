import { CompilerError } from "../../../tools/error.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";

const eosCheck = (lexemes: Lexemes): void => {
  if (lexemes.peek()) {
    if (lexemes.peek()?.content !== ";" && lexemes.peek()?.type !== "newline") {
      throw new CompilerError(
        "Statement must be followed by a semicolon or placed on a new line.",
        lexemes.peek(-1),
      );
    }
    while (
      lexemes.peek()?.content === ";" ||
      lexemes.peek()?.type === "newline"
    ) {
      lexemes.advance();
    }
  }
};

export default eosCheck;
