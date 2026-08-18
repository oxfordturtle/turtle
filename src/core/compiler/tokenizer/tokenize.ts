import {
  colours,
  commands,
  inputs,
  keywords,
  type Language,
} from "@/core/constants.ts";
import { type Token, token } from "./token.ts";

export default (code: string, language: Language): Token[] => {
  const tokens: Token[] = [];
  let line = 1;
  let character = 1;
  while (code.length > 0) {
    const nextToken =
      spaces(code, line, character) ||
      newline(code, line, character) ||
      comment(code, line, character, language) ||
      operatorOrDelimiter(code, line, character, language) ||
      string(code, line, character, language) ||
      boolean(code, line, character, language) ||
      binary(code, line, character, language) ||
      octal(code, line, character, language) ||
      hexadecimal(code, line, character, language) ||
      decimal(code, line, character) ||
      keyword(code, line, character, language) ||
      type(code, line, character, language) ||
      inputCode(code, line, character, language) ||
      queryCode(code, line, character, language) ||
      turtle(code, line, character, language) ||
      identifier(code, line, character, language) ||
      // code.split(/\s/)[0] is "" whenever code[0] is itself unmatched
      // whitespace, so the fallback to code[0] is what guarantees at least one
      // character is consumed and the main loop can't stall
      token("illegal", code.split(/\s/)[0] || code[0], line, character);
    tokens.push(nextToken);
    code = code.slice(nextToken.content.length);
    if (nextToken.type === "newline") {
      line += 1;
      character = 1;
    } else {
      character += nextToken.content.length;
    }
  }
  return tokens;
};

const spaces = (
  code: string,
  line: number,
  character: number,
): Token | null => {
  const test = code.match(/^( +)/);
  return test ? token("spaces", test[0], line, character) : null;
};

// Matches "\n", "\r\n" and a lone "\r" as one newline token: source files
// arrive with any line-ending convention, and an unmatched "\r" would reach the
// "illegal" fallback below, which could hang the tokenizer on a zero-length
// token.
const newline = (
  code: string,
  line: number,
  character: number,
): Token | null => {
  if (code[0] === "\n") return token("newline", "\n", line, character);
  if (code[0] === "\r") {
    return token("newline", code[1] === "\n" ? "\r\n" : "\r", line, character);
  }
  return null;
};

const comment = (
  code: string,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  switch (language) {
    case "BASIC": {
      const startBASIC = code.match(/^REM/);
      return startBASIC
        ? token("comment", code.split("\n")[0], line, character)
        : null;
    }

    case "C": // fallthrough
    case "Java": // fallthrough
    case "TypeScript": {
      const startCorTS = code.match(/^\/\//);
      return startCorTS
        ? token("comment", code.split("\n")[0], line, character)
        : null;
    }

    case "Pascal": {
      const start = code[0] === "{";
      const end = code.match(/}/);
      if (start && end) {
        return token(
          "comment",
          code.slice(0, (end.index as number) + 1),
          line,
          character,
        );
      }
      if (start) {
        return token(
          "unterminatedComment",
          code.split("\n")[0],
          line,
          character,
        );
      }
      return null;
    }

    case "Python": {
      const startPython = code.match(/^#/);
      return startPython
        ? token("comment", code.split("\n")[0], line, character)
        : null;
    }
  }
};

const operatorOrDelimiter = (
  code: string,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  switch (language) {
    case "BASIC": // fallthrough
    case "C": // fallthrough
    case "Java": // fallthrough
    case "TypeScript":
      return (
        operator(code, line, character, language) ||
        delimiter(code, line, character, language)
      );

    case "Pascal":
      // check for operator ':=' before delimiter ':'
      return (
        operator(code, line, character, language) ||
        delimiter(code, line, character, language)
      );

    case "Python":
      // check for delimiter '->' before operator '-'
      return (
        delimiter(code, line, character, language) ||
        operator(code, line, character, language)
      );
  }
};

const operator = (
  code: string,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  const tests = {
    BASIC:
      /^(\+|-|\*|\/|DIV\b|MOD\b|=|<>|<=|>=|<|>|ANDL\b|ORL\b|NOT\b|AND\b|OR\b|EOR\b)/,
    C: /^(\+|-|\*|\/|div\b|%|==|!=|<=|>=|<|>|=|!|&&|\|\||~|&|\||\^)/,
    Java: /^(\+|-|\*|\/|div\b|%|==|!=|<=|>=|<|>|=|!|&&|\|\||~|&|\||\^)/,
    Pascal:
      /^(\+|-|\*|\/|div\b|mod\b|=|<>|<=|>=|<|>|:=|andl\b|orl\b|not\b|and\b|or\b|xor\b)/i,
    Python:
      /^(\+=|-=|\+|-|\*|\/\/|\/|%|==|!=|<=|>=|<|>|=|not\b|and\b|or\b|~|&|\||\^)/,
    TypeScript: /^(\+|-|\*|\/|div\b|%|==|!=|<=|>=|<|>|=|!|&&|\|\||~|&|\||\^)/,
  };
  const test = code.match(tests[language]);
  return test ? token("operator", test[0], line, character) : null;
};

const delimiter = (
  code: string,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  const tests = {
    BASIC: /^(\(|\)|,|:)/,
    C: /^(\(|\)|{|}|\[|\]|,|;)/,
    Java: /^(\(|\)|{|}|\[|\]|,|;)/,
    Pascal: /^(\(|\)|\[|\]|,|:|;|\.\.|\.)/,
    Python: /^(\(|\)|\[|\]|,|:|;|\.|->)/,
    TypeScript: /^(\(|\)|{|}|\[|\]|,|;|:)/,
  };
  const test = code.match(tests[language]);
  return test ? token("delimiter", test[0], line, character) : null;
};

const string = (
  code: string,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  code = code.split("\n")[0];
  switch (language) {
    case "BASIC": // fallthrough
    case "Pascal":
      // TODO: rule out single-quoted strings in BASIC ??
      if (code[0] === "'" || code[0] === '"') {
        const quote = code[0];
        let length = 1;
        let end = false;
        while (code[length] && !end) {
          if (code[length] === "\n") {
            return token(
              "unterminatedString",
              code.slice(0, length),
              line,
              character,
            );
          }
          if (code[length] !== quote) {
            length += 1;
          } else {
            length += 1;
            if (code[length] !== quote) {
              end = true;
            } else {
              length += 1;
            }
          }
        }
        if (!end) {
          return token(
            "unterminatedString",
            code.slice(0, length),
            line,
            character,
          );
        }
        return token("string", code.slice(0, length), line, character);
      }
      return null;

    case "C": // fallthrough
    case "Java": // fallthrough
    case "Python": // fallthrough
    case "TypeScript": {
      // These four escape with a backslash; BASIC and Pascal double the quote
      // instead, above. Scanned character by character rather than by regex:
      // "the first quote not preceded by a backslash" is wrong for an escaped
      // backslash immediately before the closing quote, so "'a\\'" would be
      // read as unterminated. The unescaping itself is in lexer/lexeme.ts.
      const quote = code[0];
      if (quote !== "'" && quote !== '"') {
        return null;
      }
      let length = 1;
      while (length < code.length) {
        if (code[length] === "\\") {
          length += 2; // a backslash escapes whatever follows, quote or backslash
          continue;
        }
        if (code[length] === quote) {
          return token("string", code.slice(0, length + 1), line, character);
        }
        length += 1;
      }
      // `code` was truncated to its first line at the top of this function,
      // so running off the end means the line ended mid-string
      return token("unterminatedString", code, line, character);
    }
  }
};

const boolean = (
  code: string,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  const tests = {
    BASIC: /^(TRUE|FALSE)\b/,
    C: /^(true|false)\b/,
    Java: /^(true|false)\b/,
    Pascal: /^(true|false)\b/i,
    Python: /^(True|False)\b/,
    TypeScript: /^(true|false)\b/,
  };
  const test = code.match(tests[language]);
  return test ? token("boolean", test[0], line, character) : null;
};

const binary = (
  code: string,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  // TODO: errors for binary numbers with digits > 1
  switch (language) {
    case "BASIC": // fallthrough
    case "Pascal": {
      const good = code.match(/^(%[01]+)\b/);
      const bad = code.match(/^(0b[01]+)\b/);
      if (good) {
        return token("binary", good[0], line, character);
      }
      if (bad) {
        return token("badBinary", bad[0], line, character);
      }
      return null;
    }

    case "C": // fallthrough
    case "Java": // fallthrough
    case "Python": // fallthrough
    case "TypeScript": {
      // N.B. there's no bad binary in these languages, since '%' will match the MOD operator
      const test = code.match(/^(0b[01]+)\b/);
      if (test) {
        return token("binary", test[0], line, character);
      }
      return null;
    }
  }
};

const octal = (
  code: string,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  // TODO: errors for octal numbers with digits > 7
  switch (language) {
    case "BASIC":
      // BASIC doesn't support octal numbers
      return null;

    case "Pascal": {
      const goodPascal = code.match(/^(&[0-7]+)\b/);
      const badPascal = code.match(/^(0o[0-7]+)\b/);
      if (goodPascal) {
        return token("octal", goodPascal[0], line, character);
      }
      if (badPascal) {
        return token("badOctal", badPascal[0], line, character);
      }
      return null;
    }

    case "C": // fallthrough
    case "Java": // fallthrough
    case "Python": // fallthrough
    case "TypeScript": {
      // N.B. there's no bad octal in these languages, since '&' will match the boolean AND operator
      const testPython = code.match(/^(0o[0-7]+)\b/);
      if (testPython) {
        return token("octal", testPython[0], line, character);
      }
      return null;
    }
  }
};

const hexadecimal = (
  code: string,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  const bads = {
    BASIC: /^((\$|(0x))[A-Fa-f0-9]+)\b/,
    C: /^((&|#|\$)[A-Fa-f0-9]+)\b/,
    Java: /^((&|#|\$)[A-Fa-f0-9]+)\b/,
    Pascal: /^((&|(0x))[A-Fa-f0-9]+)\b/,
    Python: /^((&|#|\$)[A-Fa-f0-9]+)\b/,
    TypeScript: /^((&|#|\$)[A-Fa-f0-9]+)\b/,
  };
  const goods = {
    BASIC: /^((&|#)[A-Fa-f0-9]+)\b/, // also allow '#' notation
    C: /^((0x|#)[A-Fa-f0-9]+)\b/, // also allow '#' notation
    Java: /^((0x|#)[A-Fa-f0-9]+)\b/, // also allow '#' notation
    Pascal: /^((\$|#)[A-Fa-f0-9]+)\b/, // also allow '#' notation
    Python: /^(0x[A-Fa-f0-9]+)\b/, // don't allow '#' notation ('#' is for comments)
    TypeScript: /^((0x|#)[A-Fa-f0-9]+)\b/, // also allow '#' notation
  };
  const bad = code.match(bads[language]);
  const good = code.match(goods[language]);
  if (bad) {
    return token("badHexadecimal", bad[0], line, character);
  }
  if (good) {
    return token("hexadecimal", good[0], line, character);
  }
  return null;
};

const decimal = (
  code: string,
  line: number,
  character: number,
): Token | null => {
  const good = code.match(/^(\d+)\b/);
  const bad = code.match(/^(\d+\.\d+)/);
  if (bad) {
    // good will also match if bad matches, so give this priority
    return token("real", bad[0], line, character);
  }
  if (good) {
    return token("decimal", good[0], line, character);
  }
  return null;
};

const keyword = (
  code: string,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  const names = keywords[language].map((keyword) => keyword.name).join("|");
  const regex =
    language === "Pascal"
      ? new RegExp(`^(${names})\\b`, "i")
      : new RegExp(`^(${names})\\b`);
  const test = code.match(regex);
  return test ? token("keyword", test[0], line, character) : null;
};

const type = (
  code: string,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  let test: RegExpMatchArray | null = null;
  switch (language) {
    case "C":
      test = code.match(/^(void|bool|char|int|string)\b/);
      break;
    case "Java":
      test = code.match(/^(void|boolean|char|int|String)\b/);
      break;
    case "Pascal":
      test = code.match(/^(boolean|char|integer|string)\b/i);
      break;
    case "TypeScript":
      test = code.match(/^(void|boolean|number|string)\b/);
      break;
  }
  return test ? token("type", test[0], line, character) : null;
};

const inputCode = (
  code: string,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  const names = inputs.map((x) => `\\\\${x.name}`).join("|");
  const regex =
    language === "Pascal"
      ? new RegExp(`^(${names})\\b`, "i")
      : new RegExp(`^(${names})\\b`);
  const good = code.match(regex);
  const bad = code.match(/^(\\[#a-zA-Z0-9]*)\b/);
  if (good) {
    return token("inputCode", good[0], line, character);
  }
  if (bad) {
    return token("badInputCode", bad[0], line, character);
  }
  return null;
};

const queryCode = (
  code: string,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  const names = inputs
    .filter((input) => input.value < 0)
    .map((x) => `\\?${x.name}`)
    .join("|");
  const regex =
    language === "Pascal"
      ? new RegExp(`^(${names})\\b`, "i")
      : new RegExp(`^(${names})\\b`);
  const good = code.match(regex);
  const bad = code.match(/^(\?[#a-zA-Z0-9]*)\b/);
  if (good) {
    return token("queryCode", good[0], line, character);
  }
  if (bad) {
    return token("badQueryCode", bad[0], line, character);
  }
  return null;
};

const turtle = (
  code: string,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  const tests = {
    BASIC: /^(turt[xydatc]%)/,
    C: /^(turt[xydatc])\b/,
    Java: /^(turt[xydatc])\b/,
    Pascal: /^(turt[xydatc])\b/i,
    Python: /^(turt[xydatc])\b/,
    TypeScript: /^(turt[xydatc])\b/,
  };
  const test = code.match(tests[language]);
  return test ? token("turtle", test[0], line, character) : null;
};

const identifier = (
  code: string,
  line: number,
  character: number,
  language: Language,
): Token | null => {
  const test =
    language === "BASIC"
      ? // "#" isn't a valid suffix on user-declared identifiers - it only
        // ever appears on the fixed set of "#"-suffixed built-in file
        // commands (CLOSE#, EOF#, FREADLN#, etc. - see commands.ts), hence
        // the separate alternative rather than folding it into the general
        // "%?" suffix case
        code.match(
          /^([_a-zA-Z][_a-zA-Z0-9]*\$\d*|[_a-zA-Z][_a-zA-Z0-9]*#|[_a-zA-Z][_a-zA-Z0-9]*%?)/,
        )
      : code.match(/^([_a-zA-Z][_a-zA-Z0-9]*)\b/);
  if (test) {
    const name = language === "Pascal" ? test[0].toLowerCase() : test[0];
    const colour = colours.find((x) => x.names[language] === name);
    const command = commands.find((x) => x.names[language] === name);
    if (colour) {
      return token("colour", test[0], line, character);
    }
    if (command) {
      return token("command", test[0], line, character);
    }
    if (language === "Python" && name === "range") {
      // pretend 'range' is a command in Python
      return token("command", test[0], line, character);
    }
    return token("identifier", test[0], line, character);
  }
  return null;
};
