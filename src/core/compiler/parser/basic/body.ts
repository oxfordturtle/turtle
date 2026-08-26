import type { Lexeme } from "../../lexer/lexeme.ts";
import { type Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import parseStatement from "./statement.ts";

export default function body(lexemes: Lexemes, routine: Routine): void {
  lexemes.seek(routine.start);
  while (lexemes.before(routine.end)) {
    routine.statements.push(
      parseStatement(lexemes.peek() as Lexeme, lexemes, routine),
    );
  }
}
