export interface Token {
  readonly type: TokenType;
  readonly content: string;
  readonly line: number;
  readonly character: number;
}

export type TokenType =
  | "spaces"
  | "newline"
  | "comment"
  | "unterminatedComment"
  | "keyword"
  | "type"
  | "operator"
  | "delimiter"
  | "string"
  | "unterminatedString"
  | "boolean"
  | "binary"
  | "badBinary"
  | "octal"
  | "badOctal"
  | "hexadecimal"
  | "badHexadecimal"
  | "decimal"
  | "real"
  | "inputCode"
  | "badInputCode"
  | "queryCode"
  | "badQueryCode"
  | "turtle"
  | "command"
  | "colour"
  | "identifier"
  | "illegal";

export const token = (
  type: TokenType,
  content: string,
  line: number,
  character: number,
): Token => ({
  type,
  content,
  line,
  character,
});
