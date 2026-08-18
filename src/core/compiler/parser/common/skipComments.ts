import type { Lexemes } from "../definitions/lexemes.ts";

// Called right before a control structure decides whether its body is a block
// or a single statement. parseStatement treats a comment as a complete no-op
// statement, so a comment between the keyword and the real body would otherwise
// be taken for the whole body.
const skipComments = (lexemes: Lexemes): void => {
  while (lexemes.get()?.type === "comment") {
    lexemes.next();
  }
};

export default skipComments;
