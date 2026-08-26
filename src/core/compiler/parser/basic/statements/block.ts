import { type Lexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import type { Statement } from "../../definitions/statement.ts";
import parseStatement from "../statement.ts";

type Start = "IF" | "ELSE" | "FOR" | "REPEAT" | "WHILE";

const parseBlock = (
  lexemes: Lexemes,
  routine: Program | Subroutine,
  start: Start,
): Statement[] => {
  const statements: Statement[] = [];
  let end = false;

  if (lexemes.atEnd()) {
    throw new CompilerError(
      `No commands found after "${start}".`,
      lexemes.peek(-1),
    );
  }

  while (!end && lexemes.before(routine.end)) {
    const lexeme = lexemes.peek() as Lexeme;
    end = blockEndCheck(start, lexeme);
    if (end) {
      // move past the next lexeme, unless it's "else"
      if (lexeme.content !== "ELSE") {
        lexemes.advance();
      }
    } else {
      // compile the structure
      statements.push(parseStatement(lexeme, lexemes, routine));
    }
  }

  // final checks
  if (!end) {
    throw new CompilerError(
      `Unterminated "${start}" statement.`,
      lexemes.peek(-1),
    );
  }

  return statements;
};

export default parseBlock;

const blockEndCheck = (start: Start, lexeme: Lexeme): boolean => {
  switch (lexeme.content) {
    case "ELSE":
      if (start !== "IF") {
        throw new CompilerError(
          '"ELSE" does not have any matching "IF".',
          lexeme,
        );
      }
      return true;

    case "ENDIF":
      if (start !== "IF" && start !== "ELSE") {
        throw new CompilerError(
          '"ENDIF" does not have any matching "IF".',
          lexeme,
        );
      }
      return true;

    case "NEXT":
      if (start !== "FOR") {
        throw new CompilerError(
          '"NEXT" does not have any matching "FOR".',
          lexeme,
        );
      }
      return true;

    case "UNTIL":
      if (start !== "REPEAT") {
        throw new CompilerError(
          '"UNTIL" does not have any matching "REPEAT".',
          lexeme,
        );
      }
      return true;

    case "ENDWHILE":
      if (start !== "WHILE") {
        throw new CompilerError(
          '"ENDWHILE" does not have any matching "WHILE".',
          lexeme,
        );
      }
      return true;

    default:
      return false;
  }
};
