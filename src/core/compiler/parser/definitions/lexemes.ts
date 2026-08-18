import type { Lexeme } from "../../lexer/lexeme.ts";

export interface Lexemes {
  lexemes: Lexeme[];
  index: number;
  get(offset?: number): Lexeme | undefined;
  next(): void;
}

const makeLexemes = (lexemes: Lexeme[]): Lexemes => ({
  lexemes,
  index: 0,

  get(offset = 0) {
    return this.lexemes[this.index + offset];
  },

  next() {
    this.index += 1;
  },
});

export default makeLexemes;
