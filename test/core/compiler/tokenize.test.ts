import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertExists, assertFalse } from "@std/assert";
import { tokenize } from "@/core/compiler.ts";
import { LANGUAGES } from "./lib/languages.ts";

const withoutSpacing = (tokens: ReturnType<typeof tokenize>) =>
  tokens.filter((t) => t.type !== "spaces" && t.type !== "newline");

describe("tokenize", () => {
  describe("whitespace and newlines", () => {
    it("returns no tokens for empty code", () => {
      assertEquals(tokenize("", "Python").length, 0);
    });

    it("tokenizes a run of spaces as a single token", () => {
      const tokens = tokenize("x    y", "Python");
      const spaces = tokens.find((t) => t.type === "spaces");
      assertExists(spaces);
      assertEquals(spaces.content, "    ");
    });

    it("tokenizes a newline and resets the character count", () => {
      const tokens = tokenize("x\ny", "Python");
      const newline = tokens.find((t) => t.type === "newline");
      assertExists(newline);
      assertEquals(newline.content, "\n");
      const y = tokens.find((t) => t.content === "y");
      assertEquals(y?.line, 2);
      assertEquals(y?.character, 1);
    });

    it("tokenizes a Windows CRLF line ending as a single newline token, resetting the character count", () => {
      // regression test: "\r" was matched by no token type, which sent it
      // through the "illegal" fallback - and because that fallback could
      // itself produce a zero-length token (see the next test), the main
      // tokenize loop never advanced and hung forever. Found via a real
      // CRLF-encoded example file.
      const tokens = tokenize("x\r\ny", "Python");
      const newline = tokens.find((t) => t.type === "newline");
      assertExists(newline);
      assertEquals(newline.content, "\r\n");
      const y = tokens.find((t) => t.content === "y");
      assertEquals(y?.line, 2);
      assertEquals(y?.character, 1);
    });

    it("tokenizes a lone '\\r' (old Mac line ending) as a newline token too", () => {
      const tokens = tokenize("x\ry", "Python");
      const newline = tokens.find((t) => t.type === "newline");
      assertExists(newline);
      assertEquals(newline.content, "\r");
      const y = tokens.find((t) => t.content === "y");
      assertEquals(y?.line, 2);
    });

    it("never produces a zero-length 'illegal' token (which would stall tokenization) for an unmatched whitespace character", () => {
      // a tab is whitespace but isn't matched by spaces() (only literal
      // " " runs) or any other matcher - the same hang-hazard "\r" used to
      // trigger, for a different unmatched character
      const tokens = tokenize("x\ty", "Python");
      const illegal = tokens.find((t) => t.type === "illegal");
      assertExists(illegal);
      assertEquals(illegal.content, "\t");
    });

    it("doesn't hang on a list-multiplication line followed by a list-literal line", () => {
      // regression test for a confirmed, reproduced infinite loop: tokenizing
      // "A=[0]*(n)" alone was fine, and tokenizing the list-literal line
      // alone was fine, but the *combination* used to hang tokenize()
      // forever. Already fixed as a side effect of the "\r"/zero-length-
      // "illegal"-token fix above (both hangs shared the same root cause:
      // the main loop stalling on a token that didn't advance `code`) -
      // this test locks that in, since it wasn't covered by the "\r"-
      // specific tests above. This only asserts that the lexical-scanning stage
      // itself terminates.
      const tokens = tokenize("A=[0]*(n)\ncaption=['a','b']\n", "Python");
      assert(tokens.length > 0);
      assertFalse(tokens.some((t) => t.type === "illegal"));
    });

    for (const language of LANGUAGES) {
      it(`tracks line and character across multiple lines in ${language}`, () => {
        const tokens = tokenize("x\ny\nz", language);
        const x = tokens.find((t) => t.content === "x");
        const y = tokens.find((t) => t.content === "y");
        const z = tokens.find((t) => t.content === "z");
        assertEquals(x?.line, 1);
        assertEquals(y?.line, 2);
        assertEquals(z?.line, 3);
      });
    }
  });

  describe("comments", () => {
    it("tokenizes a BASIC REM comment", () => {
      const tokens = tokenize("REM this is a comment\nx = 1", "BASIC");
      const comment = tokens.find((t) => t.type === "comment");
      assertExists(comment);
      assertEquals(comment.content, "REM this is a comment");
    });

    for (const language of ["C", "Java", "TypeScript"] as const) {
      it(`tokenizes a ${language} // comment`, () => {
        const tokens = tokenize("// this is a comment\nx = 1;", language);
        const comment = tokens.find((t) => t.type === "comment");
        assertExists(comment);
        assertEquals(comment.content, "// this is a comment");
      });
    }

    it("tokenizes a Pascal { } comment", () => {
      const tokens = tokenize("{ this is a comment } x", "Pascal");
      const comment = tokens.find((t) => t.type === "comment");
      assertExists(comment);
      assertEquals(comment.content, "{ this is a comment }");
    });

    it("tokenizes an unterminated Pascal comment", () => {
      const tokens = tokenize("{ this never closes\nx", "Pascal");
      const comment = tokens.find((t) => t.type === "unterminatedComment");
      assertExists(comment);
      assertEquals(comment.content, "{ this never closes");
    });

    it("tokenizes a Python # comment", () => {
      const tokens = tokenize("# this is a comment\nx = 1", "Python");
      const comment = tokens.find((t) => t.type === "comment");
      assertExists(comment);
      assertEquals(comment.content, "# this is a comment");
    });
  });

  describe("operators and delimiters", () => {
    for (const language of ["BASIC", "C", "Java", "TypeScript"] as const) {
      it(`tokenizes operators and delimiters in ${language}`, () => {
        const tokens = withoutSpacing(tokenize("x+y", language));
        assert(tokens.some((t) => t.type === "operator" && t.content === "+"));
      });

      it(`tokenizes a parenthesis delimiter in ${language}`, () => {
        const tokens = withoutSpacing(tokenize("f(x)", language));
        const delimiters = tokens.filter((t) => t.type === "delimiter");
        assertEquals(
          delimiters.map((t) => t.content),
          ["(", ")"],
        );
      });
    }

    it("prioritizes Pascal ':=' over the ':' delimiter", () => {
      const tokens = withoutSpacing(tokenize("x:=1", "Pascal"));
      assertEquals(tokens[1].type, "operator");
      assertEquals(tokens[1].content, ":=");
    });

    it("tokenizes a lone Pascal ':' as a delimiter", () => {
      const tokens = withoutSpacing(tokenize("x:y", "Pascal"));
      assertEquals(tokens[1].type, "delimiter");
      assertEquals(tokens[1].content, ":");
    });

    it("prioritizes the Python '->' delimiter over the '-' operator", () => {
      const tokens = withoutSpacing(tokenize("x->y", "Python"));
      assertEquals(tokens[1].type, "delimiter");
      assertEquals(tokens[1].content, "->");
    });

    it("tokenizes a lone Python '-' as an operator", () => {
      const tokens = withoutSpacing(tokenize("x-y", "Python"));
      assertEquals(tokens[1].type, "operator");
      assertEquals(tokens[1].content, "-");
    });

    it("tokenizes BASIC keyword operators", () => {
      const tokens = withoutSpacing(
        tokenize("x DIV y MOD z ANDL w ORL v", "BASIC"),
      );
      const operators = tokens
        .filter((t) => t.type === "operator")
        .map((t) => t.content);
      assertEquals(operators, ["DIV", "MOD", "ANDL", "ORL"]);
    });

    it("tokenizes Pascal keyword operators case-insensitively", () => {
      const tokens = withoutSpacing(tokenize("x div y mod z XOR w", "Pascal"));
      const operators = tokens
        .filter((t) => t.type === "operator")
        .map((t) => t.content);
      assertEquals(operators, ["div", "mod", "XOR"]);
    });

    it("tokenizes Python keyword operators", () => {
      const tokens = withoutSpacing(tokenize("x and y or z not w", "Python"));
      const operators = tokens
        .filter((t) => t.type === "operator")
        .map((t) => t.content);
      assertEquals(operators, ["and", "or", "not"]);
    });
  });

  describe("strings", () => {
    for (const language of ["BASIC", "Pascal"] as const) {
      it(`tokenizes a simple ${language} string`, () => {
        const tokens = tokenize(`x = 'hello'`, language);
        const string = tokens.find((t) => t.type === "string");
        assertExists(string);
        assertEquals(string.content, "'hello'");
      });

      it(`tokenizes a double-quoted ${language} string`, () => {
        const tokens = tokenize(`x = "hello"`, language);
        const string = tokens.find((t) => t.type === "string");
        assertExists(string);
        assertEquals(string.content, '"hello"');
      });

      it(`tokenizes a ${language} string with a doubled-quote escape`, () => {
        const tokens = tokenize(`x = 'it''s'`, language);
        const string = tokens.find((t) => t.type === "string");
        assertExists(string);
        assertEquals(string.content, "'it''s'");
      });

      it(`tokenizes a ${language} string left unterminated by a newline`, () => {
        const tokens = tokenize(`x = 'hello\nbye'`, language);
        const string = tokens.find((t) => t.type === "unterminatedString");
        assertExists(string);
        assertEquals(string.content, "'hello");
      });

      it(`tokenizes a ${language} string left unterminated by the end of the code`, () => {
        const tokens = tokenize(`x = 'hello`, language);
        const string = tokens.find((t) => t.type === "unterminatedString");
        assertExists(string);
        assertEquals(string.content, "'hello");
      });
    }

    // N.B. the BASIC/Pascal scanner's mid-loop `code[length] === "\n"` check
    // is dead code: string() does `code = code.split("\n")[0]` before the
    // loop runs, so by then `code` cannot contain a newline at all. Both of
    // the cases that check was meant to catch (the two tests above -- a
    // string cut off by a real line break, and one cut off by the end of the
    // file) fall through to the `!end` check after the loop instead, and both
    // are asserted above. Deliberately not force-tested.

    for (const language of ["C", "Java", "Python", "TypeScript"] as const) {
      it(`tokenizes a single-quoted ${language} string`, () => {
        const tokens = tokenize(`x = 'a'`, language);
        const string = tokens.find((t) => t.type === "string");
        assertExists(string);
        assertEquals(string.content, "'a'");
      });

      it(`tokenizes a double-quoted ${language} string`, () => {
        const tokens = tokenize(`x = "hello"`, language);
        const string = tokens.find((t) => t.type === "string");
        assertExists(string);
        assertEquals(string.content, '"hello"');
      });

      it(`tokenizes an unterminated single-quoted ${language} string`, () => {
        const tokens = tokenize(`x = 'hello`, language);
        const string = tokens.find((t) => t.type === "unterminatedString");
        assertExists(string);
      });

      it(`tokenizes an unterminated double-quoted ${language} string`, () => {
        const tokens = tokenize(`x = "hello`, language);
        const string = tokens.find((t) => t.type === "unterminatedString");
        assertExists(string);
      });
    }
  });

  describe("booleans", () => {
    it("tokenizes BASIC TRUE and FALSE", () => {
      const tokens = withoutSpacing(tokenize("TRUE FALSE", "BASIC"));
      assert(tokens.every((t) => t.type === "boolean"));
    });

    it("tokenizes Python True and False", () => {
      const tokens = withoutSpacing(tokenize("True False", "Python"));
      assert(tokens.every((t) => t.type === "boolean"));
    });

    for (const language of ["C", "Java", "TypeScript"] as const) {
      it(`tokenizes ${language} true and false`, () => {
        const tokens = withoutSpacing(tokenize("true false", language));
        assert(tokens.every((t) => t.type === "boolean"));
      });
    }

    it("tokenizes Pascal booleans case-insensitively", () => {
      const tokens = withoutSpacing(tokenize("true True TRUE false", "Pascal"));
      assert(tokens.every((t) => t.type === "boolean"));
    });
  });

  describe("binary numbers", () => {
    for (const language of ["BASIC", "Pascal"] as const) {
      it(`tokenizes a good ${language} binary literal`, () => {
        const tokens = tokenize("%101", language);
        assertEquals(tokens[0].type, "binary");
        assertEquals(tokens[0].content, "%101");
      });

      it(`tokenizes a bad ${language} binary literal`, () => {
        const tokens = tokenize("0b101", language);
        assertEquals(tokens[0].type, "badBinary");
        assertEquals(tokens[0].content, "0b101");
      });
    }

    for (const language of ["C", "Java", "Python", "TypeScript"] as const) {
      it(`tokenizes a good ${language} binary literal`, () => {
        const tokens = tokenize("0b101", language);
        assertEquals(tokens[0].type, "binary");
        assertEquals(tokens[0].content, "0b101");
      });
    }
  });

  describe("octal numbers", () => {
    it("does not treat a BASIC '&' number as octal (BASIC has no octal notation)", () => {
      const tokens = tokenize("&17", "BASIC");
      assertEquals(tokens[0].type, "hexadecimal");
    });

    it("tokenizes a good Pascal octal literal", () => {
      const tokens = tokenize("&17", "Pascal");
      assertEquals(tokens[0].type, "octal");
      assertEquals(tokens[0].content, "&17");
    });

    it("tokenizes a bad Pascal octal literal", () => {
      const tokens = tokenize("0o17", "Pascal");
      assertEquals(tokens[0].type, "badOctal");
      assertEquals(tokens[0].content, "0o17");
    });

    for (const language of ["C", "Java", "Python", "TypeScript"] as const) {
      it(`tokenizes a good ${language} octal literal`, () => {
        const tokens = tokenize("0o17", language);
        assertEquals(tokens[0].type, "octal");
        assertEquals(tokens[0].content, "0o17");
      });
    }
  });

  describe("hexadecimal numbers", () => {
    it("tokenizes a bad BASIC hexadecimal literal", () => {
      const tokens = tokenize("$1A", "BASIC");
      assertEquals(tokens[0].type, "badHexadecimal");
    });

    it("tokenizes a good BASIC hexadecimal literal", () => {
      const tokens = tokenize("#1A", "BASIC");
      assertEquals(tokens[0].type, "hexadecimal");
    });

    it("tokenizes a bad Pascal hexadecimal literal", () => {
      const tokens = tokenize("0x1A", "Pascal");
      assertEquals(tokens[0].type, "badHexadecimal");
    });

    it("tokenizes a good Pascal hexadecimal literal", () => {
      const tokens = tokenize("$1A", "Pascal");
      assertEquals(tokens[0].type, "hexadecimal");
    });

    for (const language of ["C", "Java", "TypeScript"] as const) {
      it(`tokenizes a bad ${language} hexadecimal literal`, () => {
        const tokens = tokenize("#1A", language);
        assertEquals(tokens[0].type, "badHexadecimal");
      });

      it(`tokenizes a good ${language} hexadecimal literal`, () => {
        const tokens = tokenize("0x1A", language);
        assertEquals(tokens[0].type, "hexadecimal");
      });
    }

    it("tokenizes a bad Python hexadecimal literal", () => {
      const tokens = tokenize("$1A", "Python");
      assertEquals(tokens[0].type, "badHexadecimal");
    });

    it("tokenizes a good Python hexadecimal literal", () => {
      const tokens = tokenize("0x1A", "Python");
      assertEquals(tokens[0].type, "hexadecimal");
    });
  });

  describe("decimal and real numbers", () => {
    for (const language of LANGUAGES) {
      it(`tokenizes a good decimal literal in ${language}`, () => {
        const tokens = tokenize("42", language);
        assertEquals(tokens[0].type, "decimal");
        assertEquals(tokens[0].content, "42");
      });

      it(`tokenizes a real number literal as 'real' in ${language}`, () => {
        const tokens = tokenize("3.14", language);
        assertEquals(tokens[0].type, "real");
        assertEquals(tokens[0].content, "3.14");
      });
    }
  });

  describe("keywords", () => {
    it("tokenizes a BASIC keyword", () => {
      const tokens = tokenize("IF", "BASIC");
      assertEquals(tokens[0].type, "keyword");
    });

    for (const language of ["C", "Java", "Python", "TypeScript"] as const) {
      it(`tokenizes a ${language} keyword`, () => {
        const tokens = tokenize("if", language);
        assertEquals(tokens[0].type, "keyword");
      });
    }

    it("tokenizes a Pascal keyword case-insensitively", () => {
      const lower = tokenize("if", "Pascal");
      const upper = tokenize("IF", "Pascal");
      assertEquals(lower[0].type, "keyword");
      assertEquals(upper[0].type, "keyword");
    });
  });

  describe("types", () => {
    it("tokenizes a C type", () => {
      assertEquals(tokenize("int", "C")[0].type, "type");
    });

    it("tokenizes a Java type", () => {
      assertEquals(tokenize("int", "Java")[0].type, "type");
    });

    it("tokenizes a Pascal type", () => {
      assertEquals(tokenize("integer", "Pascal")[0].type, "type");
    });

    it("tokenizes a TypeScript type", () => {
      assertEquals(tokenize("number", "TypeScript")[0].type, "type");
    });

    it("does not tokenize 'int' as a type in BASIC (no type keywords)", () => {
      assertEquals(tokenize("int", "BASIC")[0].type, "identifier");
    });

    it("does not tokenize 'int' as a type in Python (no type keywords; it's a command there)", () => {
      assertEquals(tokenize("int", "Python")[0].type, "command");
    });
  });

  describe("input codes", () => {
    for (const language of [
      "BASIC",
      "C",
      "Java",
      "Python",
      "TypeScript",
    ] as const) {
      it(`tokenizes a recognised ${language} input code`, () => {
        const tokens = tokenize("\\key", language);
        assertEquals(tokens[0].type, "inputCode");
        assertEquals(tokens[0].content, "\\key");
      });

      it(`tokenizes an unrecognised ${language} input code`, () => {
        const tokens = tokenize("\\zzz", language);
        assertEquals(tokens[0].type, "badInputCode");
      });
    }

    it("tokenizes a recognised Pascal input code case-insensitively", () => {
      const tokens = tokenize("\\KEY", "Pascal");
      assertEquals(tokens[0].type, "inputCode");
    });

    it("tokenizes an unrecognised Pascal input code", () => {
      const tokens = tokenize("\\zzz", "Pascal");
      assertEquals(tokens[0].type, "badInputCode");
    });
  });

  describe("query codes", () => {
    for (const language of [
      "BASIC",
      "C",
      "Java",
      "Python",
      "TypeScript",
    ] as const) {
      it(`tokenizes a recognised ${language} query code`, () => {
        const tokens = tokenize("?key", language);
        assertEquals(tokens[0].type, "queryCode");
        assertEquals(tokens[0].content, "?key");
      });

      it(`tokenizes an unrecognised ${language} query code`, () => {
        const tokens = tokenize("?zzz", language);
        assertEquals(tokens[0].type, "badQueryCode");
      });
    }

    it("tokenizes a recognised Pascal query code case-insensitively", () => {
      const tokens = tokenize("?KEY", "Pascal");
      assertEquals(tokens[0].type, "queryCode");
    });

    it("tokenizes an unrecognised Pascal query code", () => {
      const tokens = tokenize("?zzz", "Pascal");
      assertEquals(tokens[0].type, "badQueryCode");
    });
  });

  describe("turtle properties", () => {
    it("tokenizes a BASIC turtle property (with its % suffix)", () => {
      const tokens = tokenize("turtx%", "BASIC");
      assertEquals(tokens[0].type, "turtle");
      assertEquals(tokens[0].content, "turtx%");
    });

    for (const language of [
      "C",
      "Java",
      "Pascal",
      "Python",
      "TypeScript",
    ] as const) {
      it(`tokenizes a ${language} turtle property`, () => {
        const tokens = tokenize("turtx", language);
        assertEquals(tokens[0].type, "turtle");
      });
    }
  });

  describe("identifiers", () => {
    it("tokenizes a BASIC colour name (upper case)", () => {
      assertEquals(tokenize("GREEN", "BASIC")[0].type, "colour");
    });

    for (const language of [
      "C",
      "Java",
      "Pascal",
      "Python",
      "TypeScript",
    ] as const) {
      it(`tokenizes a ${language} colour name`, () => {
        assertEquals(tokenize("green", language)[0].type, "colour");
      });
    }

    it("tokenizes a BASIC command name (upper case)", () => {
      assertEquals(tokenize("FORWARD", "BASIC")[0].type, "command");
    });

    for (const language of [
      "C",
      "Java",
      "Pascal",
      "Python",
      "TypeScript",
    ] as const) {
      it(`tokenizes a ${language} command name`, () => {
        assertEquals(tokenize("forward", language)[0].type, "command");
      });
    }

    for (const language of LANGUAGES) {
      it(`tokenizes a plain identifier in ${language}`, () => {
        assertEquals(tokenize("myVariable", language)[0].type, "identifier");
      });
    }

    it("treats Python's 'range' as a command", () => {
      assertEquals(tokenize("range", "Python")[0].type, "command");
    });

    it("does not treat 'range' as a command in other languages", () => {
      assertEquals(tokenize("range", "C")[0].type, "identifier");
    });

    it("tokenizes a BASIC string-suffixed identifier", () => {
      const tokens = tokenize("name$", "BASIC");
      assertEquals(tokens[0].type, "identifier");
      assertEquals(tokens[0].content, "name$");
    });

    it("tokenizes a BASIC integer-suffixed identifier", () => {
      const tokens = tokenize("count%", "BASIC");
      assertEquals(tokens[0].type, "identifier");
      assertEquals(tokens[0].content, "count%");
    });
  });

  describe("illegal characters", () => {
    for (const language of LANGUAGES) {
      it(`tokenizes an illegal character in ${language}`, () => {
        const tokens = tokenize("@", language);
        assertEquals(tokens[0].type, "illegal");
        assertEquals(tokens[0].content, "@");
      });
    }
  });
});
