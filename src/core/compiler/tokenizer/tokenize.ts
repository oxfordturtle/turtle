import {
  colours,
  commands,
  inputs,
  keywords,
  type Language,
} from "@/core/constants.ts";
import { type Token, token, type TokenType } from "./token.ts";

/**
 * A single pass over `code` with an integer cursor. Nothing here slices or
 * splits the source: the matchers are sticky (`/y`) regexes run at `index` via
 * `lastIndex`, and every per-language table is built once at module load. Both
 * matter more than they look - the editor re-tokenizes the whole file on every
 * keystroke, so anything that touches the remaining source per token is
 * quadratic in file size, which is exactly what this used to be.
 */
export default (code: string, language: Language): Token[] => {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let character = 1;
  while (index < code.length) {
    const nextToken =
      spaces(code, index, line, character) ||
      newline(code, index, line, character) ||
      comment(code, index, line, character, language) ||
      // the two are ordered per language: Pascal must see the ':=' operator
      // before the ':' delimiter, Python the '->' delimiter before the '-'
      // operator
      firstMatch(SYMBOLS[language], code, index, line, character) ||
      string(code, index, line, character, language) ||
      firstMatch(LITERALS[language], code, index, line, character) ||
      inputCode(code, index, line, character, language) ||
      queryCode(code, index, line, character, language) ||
      turtle(code, index, line, character, language) ||
      identifier(code, index, line, character, language) ||
      illegal(code, index, line, character);
    tokens.push(nextToken);
    index += nextToken.content.length;
    if (nextToken.type === "newline") {
      line += 1;
      character = 1;
    } else {
      character += nextToken.content.length;
    }
  }
  return tokens;
};

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

interface Rule {
  readonly type: TokenType;
  readonly regex: RegExp;
}

/**
 * Applies a sticky regex at `index`, returning the text it matched there or
 * null. Every regex in this file is sticky, so "does this match here?" is a
 * `lastIndex` assignment rather than a slice of everything that follows.
 */
const matchAt = (regex: RegExp, code: string, index: number): string | null => {
  regex.lastIndex = index;
  const match = regex.exec(code);
  return match === null ? null : match[0];
};

/** The first of an ordered list of rules that matches at `index`. */
const firstMatch = (
  rules: readonly Rule[],
  code: string,
  index: number,
  line: number,
  character: number,
): Token | null => {
  for (const rule of rules) {
    const content = matchAt(rule.regex, code, index);
    if (content !== null) {
      return token(rule.type, content, line, character);
    }
  }
  return null;
};

/**
 * A per-language table whose entries are all built the same way. Spelled out
 * rather than derived from `languages` so that it needs no cast, and so that
 * a language added to the constants is a type error here.
 */
const byLanguage = <T>(
  make: (language: Language) => T,
): Record<Language, T> => ({
  BASIC: make("BASIC"),
  C: make("C"),
  Java: make("Java"),
  Pascal: make("Pascal"),
  Python: make("Python"),
  TypeScript: make("TypeScript"),
});

/** The index of the next "\n" at or after `index`, or the end of the code. */
const lineEnd = (code: string, index: number): number => {
  const next = code.indexOf("\n", index);
  return next === -1 ? code.length : next;
};

// ---------------------------------------------------------------------------
// Whitespace
// ---------------------------------------------------------------------------

const SPACES = / +/y;

const spaces = (
  code: string,
  index: number,
  line: number,
  character: number,
): Token | null => {
  const content = matchAt(SPACES, code, index);
  return content === null ? null : token("spaces", content, line, character);
};

// Matches "\n", "\r\n" and a lone "\r" as one newline token: source files
// arrive with any line-ending convention, and an unmatched "\r" would reach the
// "illegal" fallback below, which could hang the tokenizer on a zero-length
// token.
const newline = (
  code: string,
  index: number,
  line: number,
  character: number,
): Token | null => {
  if (code[index] === "\n") return token("newline", "\n", line, character);
  if (code[index] === "\r") {
    return token(
      "newline",
      code[index + 1] === "\n" ? "\r\n" : "\r",
      line,
      character,
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/** Every language has one, so a comment is ruled out by a `startsWith`. */
const COMMENT_STARTS: Record<Language, string> = {
  BASIC: "REM",
  C: "//",
  Java: "//",
  Pascal: "{",
  Python: "#",
  TypeScript: "//",
};

const comment = (
  code: string,
  index: number,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  if (!code.startsWith(COMMENT_STARTS[language], index)) {
    return null;
  }
  if (language !== "Pascal") {
    // everywhere else a comment runs to the end of its line
    const content = code.slice(index, lineEnd(code, index));
    return token("comment", content, line, character);
  }
  // Pascal's braces may span lines; an unclosed one is reported as far as the
  // end of the line it opens on
  const end = code.indexOf("}", index);
  return end === -1
    ? token(
        "unterminatedComment",
        code.slice(index, lineEnd(code, index)),
        line,
        character,
      )
    : token("comment", code.slice(index, end + 1), line, character);
};

// ---------------------------------------------------------------------------
// Operators and delimiters
// ---------------------------------------------------------------------------

const SYMBOLS: Record<Language, readonly Rule[]> = {
  BASIC: [
    {
      type: "operator",
      regex:
        /(?:\+|-|\*|\/|DIV\b|MOD\b|=|<>|<=|>=|<|>|ANDL\b|ORL\b|NOT\b|AND\b|OR\b|EOR\b)/y,
    },
    { type: "delimiter", regex: /(?:\(|\)|,|:)/y },
  ],
  C: [
    {
      type: "operator",
      regex: /(?:\+|-|\*|\/|div\b|%|==|!=|<=|>=|<|>|=|!|&&|\|\||~|&|\||\^)/y,
    },
    { type: "delimiter", regex: /(?:\(|\)|{|}|\[|\]|,|;)/y },
  ],
  Java: [
    {
      type: "operator",
      regex: /(?:\+|-|\*|\/|div\b|%|==|!=|<=|>=|<|>|=|!|&&|\|\||~|&|\||\^)/y,
    },
    { type: "delimiter", regex: /(?:\(|\)|{|}|\[|\]|,|;)/y },
  ],
  // check for the ':=' operator before the ':' delimiter
  Pascal: [
    {
      type: "operator",
      regex:
        /(?:\+|-|\*|\/|div\b|mod\b|=|<>|<=|>=|<|>|:=|andl\b|orl\b|not\b|and\b|or\b|xor\b)/iy,
    },
    { type: "delimiter", regex: /(?:\(|\)|\[|\]|,|:|;|\.\.|\.)/y },
  ],
  // check for the '->' delimiter before the '-' operator
  Python: [
    { type: "delimiter", regex: /(?:\(|\)|\[|\]|,|:|;|\.|->)/y },
    {
      type: "operator",
      regex:
        /(?:\+=|-=|\+|-|\*|\/\/|\/|%|==|!=|<=|>=|<|>|=|not\b|and\b|or\b|~|&|\||\^)/y,
    },
  ],
  TypeScript: [
    {
      type: "operator",
      regex: /(?:\+|-|\*|\/|div\b|%|==|!=|<=|>=|<|>|=|!|&&|\|\||~|&|\||\^)/y,
    },
    { type: "delimiter", regex: /(?:\(|\)|{|}|\[|\]|,|;|:)/y },
  ],
};

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

/** BASIC and Pascal escape a quote by doubling it; the rest use a backslash. */
const DOUBLES_QUOTES: Record<Language, boolean> = {
  BASIC: true,
  C: false,
  Java: false,
  Pascal: true,
  Python: false,
  TypeScript: false,
};

const string = (
  code: string,
  index: number,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  const quote = code[index];
  // TODO: rule out single-quoted strings in BASIC ??
  if (quote !== "'" && quote !== '"') {
    return null;
  }
  // No string runs past the end of its line - one cut off by a line break is
  // an unterminated string, not the start of a very long one.
  const limit = lineEnd(code, index);
  let position = index + 1;
  if (DOUBLES_QUOTES[language]) {
    while (position < limit) {
      if (code[position] !== quote) {
        position += 1;
        continue;
      }
      position += 1;
      if (code[position] !== quote) {
        return token("string", code.slice(index, position), line, character);
      }
      position += 1; // a doubled quote is an escaped quote, not the end
    }
    return token(
      "unterminatedString",
      code.slice(index, position),
      line,
      character,
    );
  }
  // Scanned character by character rather than by regex: "the first quote not
  // preceded by a backslash" is wrong for an escaped backslash immediately
  // before the closing quote, so "'a\\'" would be read as unterminated. The
  // unescaping itself is in lexer/lexeme.ts.
  while (position < limit) {
    if (code[position] === "\\") {
      position += 2; // a backslash escapes whatever follows, quote or backslash
      continue;
    }
    if (code[position] === quote) {
      return token("string", code.slice(index, position + 1), line, character);
    }
    position += 1;
  }
  return token("unterminatedString", code.slice(index, limit), line, character);
};

// ---------------------------------------------------------------------------
// Literals, keywords and types
// ---------------------------------------------------------------------------

/**
 * The keyword names are a constant, so the alternation is compiled once per
 * language here rather than rebuilt for every token.
 */
const keywordRule = (language: Language): Rule => {
  const names = keywords[language].map((keyword) => keyword.name).join("|");
  return {
    type: "keyword",
    regex: new RegExp(`(?:${names})\\b`, language === "Pascal" ? "iy" : "y"),
  };
};

/**
 * Ordered, and the order is load-bearing: a "bad" spelling is listed next to
 * the good one it must beat or lose to, and the real-number rule comes before
 * the decimal rule it would otherwise be a prefix of.
 *
 * TODO: errors for binary numbers with digits > 1
 * TODO: errors for octal numbers with digits > 7
 */
const LITERALS: Record<Language, readonly Rule[]> = {
  BASIC: [
    { type: "boolean", regex: /(?:TRUE|FALSE)\b/y },
    { type: "binary", regex: /%[01]+\b/y },
    { type: "badBinary", regex: /0b[01]+\b/y },
    // BASIC has no octal notation
    { type: "badHexadecimal", regex: /(?:\$|0x)[A-Fa-f0-9]+\b/y },
    { type: "hexadecimal", regex: /(?:&|#)[A-Fa-f0-9]+\b/y }, // also allow '#' notation
    { type: "real", regex: /\d+\.\d+/y },
    { type: "decimal", regex: /\d+\b/y },
    keywordRule("BASIC"),
    // BASIC has no type keywords
  ],
  C: [
    { type: "boolean", regex: /(?:true|false)\b/y },
    // N.B. there's no bad binary or octal in the C-family languages or Python,
    // since '%' matches the MOD operator and '&' the boolean AND
    { type: "binary", regex: /0b[01]+\b/y },
    { type: "octal", regex: /0o[0-7]+\b/y },
    { type: "badHexadecimal", regex: /(?:&|#|\$)[A-Fa-f0-9]+\b/y },
    { type: "hexadecimal", regex: /(?:0x|#)[A-Fa-f0-9]+\b/y }, // also allow '#' notation
    { type: "real", regex: /\d+\.\d+/y },
    { type: "decimal", regex: /\d+\b/y },
    keywordRule("C"),
    { type: "type", regex: /(?:void|bool|char|int|string)\b/y },
  ],
  Java: [
    { type: "boolean", regex: /(?:true|false)\b/y },
    { type: "binary", regex: /0b[01]+\b/y },
    { type: "octal", regex: /0o[0-7]+\b/y },
    { type: "badHexadecimal", regex: /(?:&|#|\$)[A-Fa-f0-9]+\b/y },
    { type: "hexadecimal", regex: /(?:0x|#)[A-Fa-f0-9]+\b/y }, // also allow '#' notation
    { type: "real", regex: /\d+\.\d+/y },
    { type: "decimal", regex: /\d+\b/y },
    keywordRule("Java"),
    { type: "type", regex: /(?:void|boolean|char|int|String)\b/y },
  ],
  Pascal: [
    { type: "boolean", regex: /(?:true|false)\b/iy },
    { type: "binary", regex: /%[01]+\b/y },
    { type: "badBinary", regex: /0b[01]+\b/y },
    { type: "octal", regex: /&[0-7]+\b/y },
    { type: "badOctal", regex: /0o[0-7]+\b/y },
    { type: "badHexadecimal", regex: /(?:&|0x)[A-Fa-f0-9]+\b/y },
    { type: "hexadecimal", regex: /(?:\$|#)[A-Fa-f0-9]+\b/y }, // also allow '#' notation
    { type: "real", regex: /\d+\.\d+/y },
    { type: "decimal", regex: /\d+\b/y },
    keywordRule("Pascal"),
    { type: "type", regex: /(?:boolean|char|integer|string)\b/iy },
  ],
  Python: [
    { type: "boolean", regex: /(?:True|False)\b/y },
    { type: "binary", regex: /0b[01]+\b/y },
    { type: "octal", regex: /0o[0-7]+\b/y },
    { type: "badHexadecimal", regex: /(?:&|#|\$)[A-Fa-f0-9]+\b/y },
    { type: "hexadecimal", regex: /0x[A-Fa-f0-9]+\b/y }, // don't allow '#' notation ('#' is for comments)
    { type: "real", regex: /\d+\.\d+/y },
    { type: "decimal", regex: /\d+\b/y },
    keywordRule("Python"),
    // Python has no type keywords
  ],
  TypeScript: [
    { type: "boolean", regex: /(?:true|false)\b/y },
    { type: "binary", regex: /0b[01]+\b/y },
    { type: "octal", regex: /0o[0-7]+\b/y },
    { type: "badHexadecimal", regex: /(?:&|#|\$)[A-Fa-f0-9]+\b/y },
    { type: "hexadecimal", regex: /(?:0x|#)[A-Fa-f0-9]+\b/y }, // also allow '#' notation
    { type: "real", regex: /\d+\.\d+/y },
    { type: "decimal", regex: /\d+\b/y },
    keywordRule("TypeScript"),
    { type: "type", regex: /(?:void|boolean|number|string)\b/y },
  ],
};

// ---------------------------------------------------------------------------
// Input and query codes
// ---------------------------------------------------------------------------

/**
 * The input names are a constant too, so - as with the keywords above - the
 * alternation is compiled once per language rather than per token.
 */
const codeRegex =
  (prefix: string, names: readonly string[]) =>
  (language: Language): RegExp =>
    new RegExp(
      `(?:${names.map((name) => `${prefix}${name}`).join("|")})\\b`,
      language === "Pascal" ? "iy" : "y",
    );

const INPUT_CODES = byLanguage(
  codeRegex(
    "\\\\",
    inputs.map((input) => input.name),
  ),
);

const BAD_INPUT_CODE = /\\[#a-zA-Z0-9]*\b/y;

const inputCode = (
  code: string,
  index: number,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  if (code[index] !== "\\") {
    return null;
  }
  const good = matchAt(INPUT_CODES[language], code, index);
  if (good !== null) {
    return token("inputCode", good, line, character);
  }
  const bad = matchAt(BAD_INPUT_CODE, code, index);
  if (bad !== null) {
    return token("badInputCode", bad, line, character);
  }
  // a backslash with no word character after it is neither: it falls through
  // to the "illegal" fallback
  return null;
};

const QUERY_CODES = byLanguage(
  codeRegex(
    "\\?",
    inputs.filter((input) => input.value < 0).map((input) => input.name),
  ),
);

const BAD_QUERY_CODE = /\?[#a-zA-Z0-9]*\b/y;

const queryCode = (
  code: string,
  index: number,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  if (code[index] !== "?") {
    return null;
  }
  const good = matchAt(QUERY_CODES[language], code, index);
  if (good !== null) {
    return token("queryCode", good, line, character);
  }
  const bad = matchAt(BAD_QUERY_CODE, code, index);
  if (bad !== null) {
    return token("badQueryCode", bad, line, character);
  }
  // as with a lone backslash above
  return null;
};

// ---------------------------------------------------------------------------
// Turtle properties and identifiers
// ---------------------------------------------------------------------------

const TURTLES: Record<Language, RegExp> = {
  BASIC: /turt[xydatc]%/y,
  C: /turt[xydatc]\b/y,
  Java: /turt[xydatc]\b/y,
  Pascal: /turt[xydatc]\b/iy,
  Python: /turt[xydatc]\b/y,
  TypeScript: /turt[xydatc]\b/y,
};

const turtle = (
  code: string,
  index: number,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  const content = matchAt(TURTLES[language], code, index);
  return content === null ? null : token("turtle", content, line, character);
};

const IDENTIFIERS: Record<Language, RegExp> = {
  // "#" isn't a valid suffix on user-declared identifiers - it only ever
  // appears on the fixed set of "#"-suffixed built-in file commands (CLOSE#,
  // EOF#, FREADLN#, etc. - see commands.ts), hence the separate alternative
  // rather than folding it into the general "%?" suffix case
  BASIC:
    /(?:[_a-zA-Z][_a-zA-Z0-9]*\$\d*|[_a-zA-Z][_a-zA-Z0-9]*#|[_a-zA-Z][_a-zA-Z0-9]*%?)/y,
  C: /[_a-zA-Z][_a-zA-Z0-9]*\b/y,
  Java: /[_a-zA-Z][_a-zA-Z0-9]*\b/y,
  Pascal: /[_a-zA-Z][_a-zA-Z0-9]*\b/y,
  Python: /[_a-zA-Z][_a-zA-Z0-9]*\b/y,
  TypeScript: /[_a-zA-Z][_a-zA-Z0-9]*\b/y,
};

/**
 * Name to token type for every built-in colour and command, so that
 * classifying an identifier is a hash lookup rather than two linear scans of
 * the constants tables. Colours are written last because they take precedence
 * over commands of the same name.
 */
const nameTypes = (language: Language): Map<string, TokenType> => {
  const names = new Map<string, TokenType>();
  for (const command of commands) {
    const name = command.names[language];
    if (name !== null) {
      names.set(name, "command");
    }
  }
  if (language === "Python") {
    names.set("range", "command"); // pretend 'range' is a command in Python
  }
  for (const colour of colours) {
    names.set(colour.names[language], "colour");
  }
  return names;
};

const NAMES = byLanguage(nameTypes);

const identifier = (
  code: string,
  index: number,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  const content = matchAt(IDENTIFIERS[language], code, index);
  if (content === null) {
    return null;
  }
  const name = language === "Pascal" ? content.toLowerCase() : content;
  return token(
    NAMES[language].get(name) ?? "identifier",
    content,
    line,
    character,
  );
};

// ---------------------------------------------------------------------------
// The fallback
// ---------------------------------------------------------------------------

const WHITESPACE = /\s/;

/**
 * Whatever is here that nothing else claimed, up to the next whitespace. That
 * run is empty when the character here is itself unmatched whitespace (a tab,
 * say), so the fallback to a single character is what guarantees the main loop
 * always advances and can't stall on a zero-length token.
 */
const illegal = (
  code: string,
  index: number,
  line: number,
  character: number,
): Token => {
  let end = index;
  while (end < code.length && !WHITESPACE.test(code[end]!)) {
    end += 1;
  }
  const content = end > index ? code.slice(index, end) : code[index]!;
  return token("illegal", content, line, character);
};
