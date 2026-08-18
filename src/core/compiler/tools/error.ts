import type { Lexeme, Token } from "../../compiler.ts";

export class CompilerError extends Error {
  readonly token: Token | Lexeme | null;

  constructor(message: string, token: Token | Lexeme | null = null) {
    if (token) {
      message = message.replace("{lex}", `"${token.content}"`);
      message += ` ("${token.content}", line ${token.line}, index ${token.character})`;
    }
    super(message);
    this.token = token;
  }
}
