import type { Lexeme } from "../../lexer/lexeme.ts";
import { type Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import parseStatement from "./statement.ts";

export default function body(lexemes: Lexemes, routine: Routine): void {
  lexemes.index = routine.start;
  while (lexemes.index < routine.end) {
    routine.statements.push(
      parseStatement(lexemes.get() as Lexeme, lexemes, routine),
    );
  }
}
