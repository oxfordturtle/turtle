import { type Language, trueValue } from "@/core/constants.ts";
import type { Token } from "../tokenizer/token.ts";
import type { Delimiter, Keyword, Operator, Type } from "./types.ts";

export type Lexeme =
  | NewlineLexeme
  | IndentLexeme
  | DedentLexeme
  | CommentLexeme
  | KeywordLexeme
  | TypeLexeme
  | OperatorLexeme
  | DelimiterLexeme
  | BooleanLexeme
  | IntegerLexeme
  | CharacterLexeme
  | StringLexeme
  | InputCodeLexeme
  | QueryCodeLexeme
  | IdentifierLexeme;

interface LexemeCommon {
  readonly __: "Lexeme";
  readonly line: number;
  readonly character: number;
  readonly content: string;
}

const lexeme = (
  line: number,
  character: number,
  content: string,
): LexemeCommon => ({
  __: "Lexeme",
  line,
  character,
  content,
});

export interface NewlineLexeme extends LexemeCommon {
  readonly type: "newline";
}

export const newlineLexeme = (token: Token): NewlineLexeme => ({
  ...lexeme(token.line, token.character, "[newline]"),
  type: "newline",
});

export interface IndentLexeme extends LexemeCommon {
  readonly type: "indent";
}

export const indentLexeme = (token: Token): IndentLexeme => ({
  ...lexeme(token.line, token.character, "[indent]"),
  type: "indent",
});

export interface DedentLexeme extends LexemeCommon {
  readonly type: "dedent";
}

export const dedentLexeme = (token: Token): DedentLexeme => ({
  ...lexeme(token.line, token.character, "[dedent]"),
  type: "dedent",
});

export interface CommentLexeme extends LexemeCommon {
  readonly type: "comment";
  readonly value: string;
}

export const commentLexeme = (
  token: Token,
  language: Language,
): CommentLexeme => {
  const values = {
    BASIC: token.content.slice(3).trim(),
    C: token.content.slice(2).trim(),
    Java: token.content.slice(2).trim(),
    Pascal: token.content.slice(1, -1).trim(),
    Python: token.content.slice(1).trim(),
    TypeScript: token.content.slice(2).trim(),
  };

  return {
    ...lexeme(token.line, token.character, token.content),
    type: "comment",
    value: values[language],
  };
};

export interface KeywordLexeme extends LexemeCommon {
  readonly type: "keyword";
  readonly subtype: Keyword;
}

export const keywordLexeme = (token: Token): KeywordLexeme => ({
  ...lexeme(token.line, token.character, token.content),
  type: "keyword",
  subtype: token.content.toLowerCase() as Keyword,
});

export interface TypeLexeme extends LexemeCommon {
  readonly type: "type";
  readonly subtype: Type | null;
}

export const typeLexeme = (token: Token): TypeLexeme => {
  const subtypes: Record<string, Type | null> = {
    bool: "boolean",
    boolean: "boolean",
    char: "character",
    int: "integer",
    integer: "integer",
    number: "integer",
    string: "string",
    void: null,
  };

  return {
    ...lexeme(token.line, token.character, token.content),
    type: "type",
    subtype: subtypes[token.content.toLowerCase()],
  };
};

export interface OperatorLexeme extends LexemeCommon {
  readonly type: "operator";
  readonly subtype: Operator | "asgn";
}

export const operatorLexeme = (
  token: Token,
  language: Language,
): OperatorLexeme => {
  const subtypes: Record<string, Operator | "asgn"> = {
    "+": "plus",
    "-": "subt",
    "*": "mult",
    "/": "divr",
    div: "div",
    "//": "div",
    mod: "mod",
    "%": "mod",
    "=": language === "BASIC" || language === "Pascal" ? "eqal" : "asgn",
    ":=": "asgn",
    "+=": "asgn",
    "-=": "asgn",
    "==": "eqal",
    "<>": "noeq",
    "!=": "noeq",
    "<=": "lseq",
    ">=": "mreq",
    "<": "less",
    ">": "more",
    not: "not",
    "~": "not",
    "!": "not",
    and: language === "Python" ? "andl" : "and",
    or: language === "Python" ? "orl" : "or",
    andl: "andl",
    "&&": "andl",
    "&": "and",
    orl: "orl",
    "||": "orl",
    "|": "or",
    eor: "xor",
    xor: "xor",
    "^": "xor",
  };

  return {
    ...lexeme(token.line, token.character, token.content),
    type: "operator",
    subtype: subtypes[token.content.toLowerCase()],
  };
};

export interface DelimiterLexeme extends LexemeCommon {
  readonly type: "delimiter";
  readonly subtype: Delimiter;
}

export const delimiterLexeme = (token: Token): DelimiterLexeme => ({
  ...lexeme(token.line, token.character, token.content),
  type: "delimiter",
  subtype: token.content as Delimiter,
});

export interface BooleanLexeme extends LexemeCommon {
  readonly type: "literal";
  readonly subtype: "boolean";
  readonly value: 0 | 1 | -1;
}

export const booleanLexeme = (
  token: Token,
  language: Language,
): BooleanLexeme => ({
  ...lexeme(token.line, token.character, token.content),
  type: "literal",
  subtype: "boolean",
  value: token.content.toLowerCase() === "true" ? trueValue[language] : 0,
});

export interface IntegerLexeme extends LexemeCommon {
  readonly type: "literal";
  readonly subtype: "integer";
  readonly value: number;
  readonly radix: number;
}

export const integerLexeme = (token: Token, radix: number): IntegerLexeme => {
  const firstNonInteger = token.content.match(/[^0-9]/);
  const trimmedContent = firstNonInteger
    ? token.content.slice((firstNonInteger.index ?? 0) + 1)
    : token.content;

  return {
    ...lexeme(token.line, token.character, token.content),
    type: "literal",
    subtype: "integer",
    value: parseInt(trimmedContent, radix),
    radix,
  };
};

export interface CharacterLexeme extends LexemeCommon {
  readonly type: "literal";
  readonly subtype: "character";
  readonly value: number;
}

export const characterLexeme = (
  token: Token,
  language: Language,
): CharacterLexeme => ({
  ...stringLexeme(token, language),
  subtype: "character",
  // from the *unescaped* value, not the source's second character: C's "'\''"
  // is the quote character, but source position 1 is the backslash
  value: stringLexeme(token, language).value.charCodeAt(0),
});

export interface StringLexeme extends LexemeCommon {
  readonly type: "literal";
  readonly subtype: "string";
  readonly value: string;
}

/**
 * The escape sequences C, Java, Python and TypeScript share. BASIC and Pascal
 * have none - they double the quote instead - so `unescape` is never applied to
 * them. Numeric and unicode escapes are not supported.
 */
const escapes: Record<string, string> = {
  "\\": "\\",
  "'": "'",
  '"': '"',
  n: "\n",
  t: "\t",
  r: "\r",
  "0": "\0",
};

/**
 * Resolves backslash escapes in a string literal's body.
 *
 * A single left-to-right pass, so "\\" is consumed as one unit before its
 * second character can start another escape: "'a\\nb'" is a, backslash, n, b -
 * not a newline.
 *
 * An unrecognised escape keeps its backslash and the character after it, as
 * real Python does. C/Java/TypeScript would rather reject it, but a compile
 * error here would newly reject programs that work today.
 */
const unescape = (body: string): string =>
  body.replace(/\\([\s\S])/g, (match, character: string) =>
    character in escapes ? escapes[character] : match,
  );

export const stringLexeme = (
  token: Token,
  language: Language,
): StringLexeme => {
  const values = {
    BASIC: token.content.slice(1, -1).replace(/""/g, '"'),
    C: unescape(token.content.slice(1, -1)),
    Java: unescape(token.content.slice(1, -1)),
    Pascal:
      token.content[0] === "'"
        ? token.content.slice(1, -1).replace(/''/g, "'")
        : token.content.slice(1, -1).replace(/""/g, '"'),
    Python: unescape(token.content.slice(1, -1)),
    TypeScript: unescape(token.content.slice(1, -1)),
  };

  return {
    ...lexeme(token.line, token.character, token.content),
    type: "literal",
    subtype: "string",
    value: values[language],
  };
};

export interface InputCodeLexeme extends LexemeCommon {
  readonly type: "input";
  readonly value: string;
}

export const inputCodeLexeme = (
  token: Token,
  language: Language,
): InputCodeLexeme => ({
  ...lexeme(token.line, token.character, token.content),
  type: "input",
  value:
    language === "Pascal"
      ? token.content.slice(1).toLowerCase()
      : token.content.slice(1),
});

export interface QueryCodeLexeme extends LexemeCommon {
  readonly type: "query";
  readonly value: string;
}

export const queryCodeLexeme = (
  token: Token,
  language: Language,
): QueryCodeLexeme => ({
  ...lexeme(token.line, token.character, token.content),
  type: "query",
  value:
    language === "Pascal"
      ? token.content.slice(1).toLowerCase()
      : token.content.slice(1),
});

export interface IdentifierLexeme extends LexemeCommon {
  readonly type: "identifier";
  readonly subtype: "turtle" | "identifier";
  readonly value: string;
}

export const identifierLexeme = (
  token: Token,
  language: Language,
): IdentifierLexeme => ({
  ...lexeme(token.line, token.character, token.content),
  type: "identifier",
  subtype: token.type === "turtle" ? "turtle" : "identifier",
  value: language === "Pascal" ? token.content.toLowerCase() : token.content,
});
