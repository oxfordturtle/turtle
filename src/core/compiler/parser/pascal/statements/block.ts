import { type Lexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import type { Subroutine } from "../../definitions/routines/subroutine.ts";
import { type Statement } from "../../definitions/statement.ts";
import parseStatement from "../statement.ts";

const parseBlock = (
  lexemes: Lexemes,
  routine: Program | Subroutine,
  start: "begin" | "repeat",
): Statement[] => {
  const statements: Statement[] = [];
  let end = false;

  if (!lexemes.get()) {
    throw new CompilerError(
      `No commands found after "${start.toUpperCase()}".`,
      lexemes.get(-1),
    );
  }

  while (!end && lexemes.get()) {
    const lexeme = lexemes.get() as Lexeme;
    end = blockEndCheck(start, lexeme);
    if (end) {
      // move past the end lexeme
      lexemes.next();
    } else {
      // compile the statement
      statements.push(parseStatement(lexeme, lexemes, routine));
    }
  }

  // if we've run out of lexemes without reaching the end, this is an error
  if (!end) {
    if (start === "begin") {
      throw new CompilerError(
        '"BEGIN" does not have any matching "END".',
        lexemes.get(-1),
      );
    }
    throw new CompilerError(
      '"REPEAT" does not have any matching "UNTIL".',
      lexemes.get(-1),
    );
  }

  return statements;
};

export default parseBlock;

const blockEndCheck = (start: "begin" | "repeat", lexeme: Lexeme): boolean => {
  switch (lexeme.content.toLowerCase()) {
    case "end":
      if (start !== "begin") {
        throw new CompilerError(
          '"END" does not have any matching "BEGIN".',
          lexeme,
        );
      }
      return true;

    case "until":
      if (start !== "repeat") {
        throw new CompilerError(
          '"UNTIL" does not have any matching "REPEAT".',
          lexeme,
        );
      }
      return true;

    default:
      return false;
  }
};
