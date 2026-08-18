import { CompilerError } from "../../../tools/error.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";

const eosCheck = (lexemes: Lexemes): void => {
  if (!lexemes.get() || lexemes.get()?.content !== ";") {
    throw new CompilerError(
      "Statement must be followed by a semicolon.",
      lexemes.get(-1),
    );
  }
  lexemes.next();
};

export default eosCheck;
