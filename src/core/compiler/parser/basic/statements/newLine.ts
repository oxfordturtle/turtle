import { CompilerError } from "../../../tools/error.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";

const parseNewLine = (lexemes: Lexemes): void => {
  if (!lexemes.atEnd() && lexemes.peek()?.type !== "newline") {
    throw new CompilerError("Statement must be on a new line.", lexemes.peek());
  }
  while (lexemes.peek()?.type === "newline") {
    lexemes.advance();
  }
};

export default parseNewLine;
