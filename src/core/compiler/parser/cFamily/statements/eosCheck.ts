import type { Lexemes } from "../../definitions/lexemes.ts";

/** C's and Java's statement terminator. TypeScript has its own. */
const eosCheck = (lexemes: Lexemes): void => {
  lexemes.expectAfter(";", "Statement must be followed by a semicolon.");
};

export default eosCheck;
