import type { Lexemes } from "../../definitions/lexemes.ts";

const eosCheck = (lexemes: Lexemes): void => {
  lexemes.expectAfter(";", "Statement must be followed by a semicolon.");
};

export default eosCheck;
