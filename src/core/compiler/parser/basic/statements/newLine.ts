import { CompilerError } from "../../../tools/error.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";

const parseNewLine = (lexemes: Lexemes): void => {
  if (lexemes.get() && lexemes.get()?.type !== "newline") {
    throw new CompilerError("Statement must be on a new line.", lexemes.get());
  }
  while (lexemes.get()?.type === "newline") {
    lexemes.next();
  }
};

export default parseNewLine;
