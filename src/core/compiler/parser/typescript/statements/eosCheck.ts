import { CompilerError } from "../../../tools/error.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";

const eosCheck = (lexemes: Lexemes): void => {
  if (lexemes.get()) {
    if (lexemes.get()?.content !== ";" && lexemes.get()?.type !== "newline") {
      throw new CompilerError(
        "Statement must be followed by a semicolon or placed on a new line.",
        lexemes.get(-1),
      );
    }
    while (
      lexemes.get()?.content === ";" ||
      lexemes.get()?.type === "newline"
    ) {
      lexemes.next();
    }
  }
};

export default eosCheck;
