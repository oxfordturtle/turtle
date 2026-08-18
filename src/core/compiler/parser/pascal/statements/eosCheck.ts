import { CompilerError } from "../../../tools/error.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";

const eosCheck = (lexemes: Lexemes): void => {
  const noSemiAfter = ["begin", "do", ".", "repeat", ";", "then"];
  const noSemiBefore = ["else", "end", ";", "until"];
  // a comment right after a command (e.g. "closefile(handle) {comment}")
  // is transparent for semicolon purposes - it doesn't itself need one
  // (parseStatement's own "comment" case handles that separately), and it
  // shouldn't stand in for whatever real lexeme follows it when deciding
  // whether *this* command needed one. noSemiAfter needs the command's own
  // last lexeme (e.g. "then"), not the comment that came after it - so walk
  // back past any comments here too, not just forwards below: a nested
  // single-statement body (e.g. an "if" inside a "for") makes eosCheck run
  // several times in a row at the same lexeme position (once per wrapping
  // statement), and an earlier call in that chain may already have skipped
  // this same trailing comment, leaving it as lexemes.get(-1) for this one.
  let precedingOffset = -1;
  while (lexemes.get(precedingOffset)?.type === "comment") {
    precedingOffset -= 1;
  }
  const precedingLexeme = lexemes.get(precedingOffset);
  while (lexemes.get()?.type === "comment") {
    lexemes.next();
  }
  if (lexemes.get()) {
    if (lexemes.get()?.content !== ";") {
      if (
        noSemiAfter.indexOf(
          precedingLexeme?.content?.toLowerCase() as string,
        ) === -1
      ) {
        if (
          noSemiBefore.indexOf(
            lexemes.get()?.content?.toLowerCase() as string,
          ) === -1
        ) {
          throw new CompilerError(
            "Semicolon needed after command.",
            lexemes.get(),
          );
        }
      }
    } else {
      while (lexemes.get() && lexemes.get()?.content === ";") {
        lexemes.next();
      }
    }
  }
};

export default eosCheck;
