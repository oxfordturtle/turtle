import type { KeywordLexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import makeProgram, { type Program } from "../definitions/routines/program.ts";
import body from "./body.ts";
import subroutine from "./subroutine.ts";

export default function basic(lexemes: Lexemes): Program {
  const program = makeProgram("BASIC");

  // find the (first) "END" lexeme
  const endMark = lexemes.indexOf("END");
  if (endMark < 0) {
    throw new CompilerError('Program must end with keyword "END".');
  }
  lexemes.setBody(program, 0, endMark);

  // first (semi) pass: loop through any lexemes after "END" and hoist subroutine definitions
  lexemes.seek(endMark + 1);
  while (!lexemes.atEnd()) {
    if (
      lexemes.peek()?.type === "newline" ||
      lexemes.peek()?.type === "comment"
    ) {
      lexemes.advance();
    } else if (lexemes.match("DEF")) {
      program.subroutines.push(
        subroutine(lexemes.peek(-1) as KeywordLexeme, lexemes, program),
      );
    } else {
      throw new CompilerError(
        'Only subroutine definitions are permissible after program "END".',
        lexemes.peek(),
      );
    }
  }

  // this will also parse subroutine statements after the first call of each
  body(lexemes, program);

  // in case there is a subroutine that isn't called, parse it now
  for (const subroutine of program.subroutines) {
    if (subroutine.statements.length === 0) {
      body(lexemes, subroutine);
    }
  }

  return program;
}
