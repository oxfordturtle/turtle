import { describe, it } from "@std/testing/bdd";
import {
  assert,
  assertEquals,
  assertExists,
  assertFalse,
  assertThrows,
} from "@std/assert";
import { lexify, tokenize } from "@/core/compiler.ts";
import { LANGUAGES } from "./lib/languages.ts";

describe("lexify", () => {
  it("returns no lexemes for empty input", () => {
    assertEquals(lexify(tokenize("", "Python"), "Python").length, 0);
  });

  it("skips spaces tokens", () => {
    const lexemes = lexify(tokenize("x   y", "Python"), "Python");
    assert(lexemes.every((l) => l.content !== "   "));
  });

  for (const language of LANGUAGES) {
    it(`produces lexemes with a type and line for every token in ${language}`, () => {
      const lexemes = lexify(tokenize("x = 1", language), language);
      assert(lexemes.length > 0);
      lexemes.forEach((lex) => {
        assertExists(lex.type);
        assertEquals(typeof lex.line, "number");
      });
    });
  }

  describe("newline significance", () => {
    for (const language of ["BASIC", "Python", "TypeScript"] as const) {
      it(`pushes newline lexemes between statements in ${language}`, () => {
        const lexemes = lexify(tokenize("x = 1\ny = 2", language), language);
        assert(lexemes.some((l) => l.type === "newline"));
      });

      it(`does not push a leading newline lexeme for blank lines at the start of a ${language} program`, () => {
        const lexemes = lexify(tokenize("\n\nx = 1", language), language);
        assertFalse(lexemes.some((l) => l.type === "newline"));
      });

      it(`collapses consecutive blank lines into a single newline lexeme in ${language}`, () => {
        const lexemes = lexify(
          tokenize("x = 1\n\n\ny = 2", language),
          language,
        );
        const newlineCount = lexemes.filter((l) => l.type === "newline").length;
        assertEquals(newlineCount, 1);
      });
    }

    for (const language of ["C", "Java", "Pascal"] as const) {
      it(`does not treat line breaks as significant in ${language}`, () => {
        const lexemes = lexify(tokenize("x = 1;\ny = 2;", language), language);
        assertFalse(lexemes.some((l) => l.type === "newline"));
      });
    }
  });

  describe("Python indentation", () => {
    it("pushes an indent lexeme when indentation increases", () => {
      const lexemes = lexify(tokenize("if x:\n    y = 1", "Python"), "Python");
      assert(lexemes.some((l) => l.type === "indent"));
    });

    it("pushes a dedent lexeme when indentation decreases", () => {
      const lexemes = lexify(
        tokenize("if x:\n    y = 1\nz = 2", "Python"),
        "Python",
      );
      assert(lexemes.some((l) => l.type === "dedent"));
    });

    it("pushes multiple dedent lexemes when indentation drops across several levels", () => {
      const code = "if a:\n    if b:\n        c = 1\nd = 2";
      const lexemes = lexify(tokenize(code, "Python"), "Python");
      const dedents = lexemes.filter((l) => l.type === "dedent");
      assertEquals(dedents.length, 2);
    });

    it("throws on inconsistent indentation", () => {
      const code = "if a:\n    if b:\n        c = 1\n   d = 2";
      assertThrows(
        () => lexify(tokenize(code, "Python"), "Python"),
        Error,
        "Inconsistent indentation",
      );
    });

    it("pushes a trailing dedent lexeme when the file ends immediately after an indented line", () => {
      const code = "if a:\n    b = 1\n";
      const lexemes = lexify(tokenize(code, "Python"), "Python");
      const dedent = lexemes.at(-1);
      assertExists(dedent);
      assertEquals(dedent.type, "dedent");
    });

    // N.B. the `tokens[index + 1] || tokens[index]` fallback *inside the
    // "Inconsistent indentation" message* is dead: it exists for the case
    // where there is no token after the newline, but then `indent` is
    // computed as 0, and 0 always sits at the bottom of the `indents` stack
    // (seeded as [0], never popped past it), so the mismatch check above it
    // can never fire. A real mismatch needs a truthy "spaces" token at
    // tokens[index + 1], so the `||` never falls through. The identical
    // fallback in the dedent-lexeme push just above it *is* reachable, and is
    // covered by the test directly above.
  });

  describe("comments", () => {
    for (const language of ["BASIC", "Python"] as const) {
      it(`pushes an implicit newline lexeme after a ${language} comment`, () => {
        const marker = language === "BASIC" ? "REM hi" : "# hi";
        const lexemes = lexify(
          tokenize(`${marker}\nx = 1`, language),
          language,
        );
        const commentIndex = lexemes.findIndex((l) => l.type === "comment");
        assertExists(lexemes[commentIndex + 1]);
        assertEquals(lexemes[commentIndex + 1].type, "newline");
      });
    }

    for (const language of ["C", "Java", "TypeScript"] as const) {
      it(`does not push an implicit newline lexeme after a ${language} comment`, () => {
        const lexemes = lexify(tokenize("// hi\nx = 1;", language), language);
        const commentIndex = lexemes.findIndex((l) => l.type === "comment");
        assertExists(lexemes[commentIndex]);
        assertFalse(lexemes[commentIndex + 1]?.type === "newline");
      });
    }

    it("trims and strips the comment marker from the lexeme value", () => {
      const lexemes = lexify(tokenize("# hello there", "Python"), "Python");
      const comment = lexemes.find((l) => l.type === "comment");
      assertEquals(
        comment && "value" in comment ? comment.value : undefined,
        "hello there",
      );
    });
  });

  describe("keywords and types", () => {
    for (const language of LANGUAGES) {
      it(`produces a keyword lexeme in ${language}`, () => {
        const code =
          language === "BASIC" ? "IF" : language === "Pascal" ? "IF" : "if";
        const lexemes = lexify(tokenize(code, language), language);
        assertEquals(lexemes[0].type, "keyword");
      });
    }

    for (const language of ["C", "Java", "Pascal", "TypeScript"] as const) {
      it(`produces a type lexeme in ${language}`, () => {
        const code =
          language === "Pascal"
            ? "integer"
            : language === "TypeScript"
              ? "number"
              : "int";
        const lexemes = lexify(tokenize(code, language), language);
        assertEquals(lexemes[0].type, "type");
      });
    }
  });

  describe("operators", () => {
    it("maps BASIC '=' to the 'eqal' subtype", () => {
      const lexemes = lexify(tokenize("x = 1", "BASIC"), "BASIC");
      const eq = lexemes.find((l) => l.type === "operator");
      assertEquals(eq && "subtype" in eq ? eq.subtype : undefined, "eqal");
    });

    it("maps Pascal '=' to the 'eqal' subtype", () => {
      const lexemes = lexify(tokenize("x = 1", "Pascal"), "Pascal");
      const eq = lexemes.find((l) => l.type === "operator");
      assertEquals(eq && "subtype" in eq ? eq.subtype : undefined, "eqal");
    });

    for (const language of ["C", "Java", "TypeScript"] as const) {
      it(`maps ${language} '=' to the 'asgn' subtype`, () => {
        const lexemes = lexify(tokenize("x = 1", language), language);
        const eq = lexemes.find((l) => l.type === "operator");
        assertEquals(eq && "subtype" in eq ? eq.subtype : undefined, "asgn");
      });
    }

    it("maps Python '=' to the 'asgn' subtype", () => {
      const lexemes = lexify(tokenize("x = 1", "Python"), "Python");
      const eq = lexemes.find((l) => l.type === "operator");
      assertEquals(eq && "subtype" in eq ? eq.subtype : undefined, "asgn");
    });

    it("maps non-Python 'and'/'or' to the 'and'/'or' subtypes", () => {
      const lexemes = lexify(tokenize("x and y or z", "Pascal"), "Pascal");
      const operators = lexemes.filter((l) => l.type === "operator");
      assertEquals(
        operators.map((l) => ("subtype" in l ? l.subtype : undefined)),
        ["and", "or"],
      );
    });

    it("maps Python 'and'/'or' to the 'andl'/'orl' subtypes", () => {
      const lexemes = lexify(tokenize("x and y or z", "Python"), "Python");
      const operators = lexemes.filter((l) => l.type === "operator");
      assertEquals(
        operators.map((l) => ("subtype" in l ? l.subtype : undefined)),
        ["andl", "orl"],
      );
    });
  });

  describe("delimiters", () => {
    for (const language of LANGUAGES) {
      it(`produces a delimiter lexeme in ${language}`, () => {
        const lexemes = lexify(tokenize("f(x)", language), language);
        assert(lexemes.some((l) => l.type === "delimiter"));
      });
    }
  });

  describe("strings, characters, and booleans", () => {
    for (const language of ["C", "Java", "Pascal"] as const) {
      it(`treats a single-quoted single character as a character literal in ${language}`, () => {
        const lexemes = lexify(tokenize("x = 'a'", language), language);
        const literal = lexemes.find(
          (l) =>
            l.type === "literal" && "subtype" in l && l.subtype === "character",
        );
        assertExists(literal);
      });
    }

    for (const language of ["BASIC", "Python", "TypeScript"] as const) {
      it(`treats a single-quoted single character as a plain string in ${language} (no character type)`, () => {
        const lexemes = lexify(tokenize("x = 'a'", language), language);
        const character = lexemes.find(
          (l) =>
            l.type === "literal" && "subtype" in l && l.subtype === "character",
        );
        assertEquals(character, undefined);
        const string = lexemes.find(
          (l) =>
            l.type === "literal" && "subtype" in l && l.subtype === "string",
        );
        assertExists(string);
      });
    }

    it("treats a multi-character string as a string literal even in a character-aware language", () => {
      const lexemes = lexify(tokenize('x = "hello"', "C"), "C");
      const string = lexemes.find(
        (l) => l.type === "literal" && "subtype" in l && l.subtype === "string",
      );
      assertExists(string);
    });

    for (const language of LANGUAGES) {
      it(`gives 'true' its language-specific value in ${language}`, () => {
        const code =
          language === "BASIC"
            ? "TRUE"
            : language === "Python"
              ? "True"
              : "true";
        const lexemes = lexify(tokenize(code, language), language);
        const bool = lexemes.find(
          (l) =>
            l.type === "literal" && "subtype" in l && l.subtype === "boolean",
        );
        assertExists(bool);
        assertEquals(
          bool && "value" in bool ? bool.value : undefined,
          language === "Python" || language === "TypeScript" ? 1 : -1,
        );
      });

      it(`gives 'false' the value 0 in ${language}`, () => {
        const code =
          language === "BASIC"
            ? "FALSE"
            : language === "Python"
              ? "False"
              : "false";
        const lexemes = lexify(tokenize(code, language), language);
        const bool = lexemes.find(
          (l) =>
            l.type === "literal" && "subtype" in l && l.subtype === "boolean",
        );
        assertEquals(bool && "value" in bool ? bool.value : undefined, 0);
      });
    }
  });

  describe("integer literals", () => {
    it("parses a binary literal with radix 2", () => {
      const lexemes = lexify(tokenize("0b101", "Python"), "Python");
      const literal = lexemes[0];
      assertEquals(literal.type, "literal");
      assertEquals("radix" in literal ? literal.radix : undefined, 2);
      assertEquals("value" in literal ? literal.value : undefined, 5);
    });

    it("parses an octal literal with radix 8", () => {
      const lexemes = lexify(tokenize("0o17", "Python"), "Python");
      const literal = lexemes[0];
      assertEquals("radix" in literal ? literal.radix : undefined, 8);
      assertEquals("value" in literal ? literal.value : undefined, 15);
    });

    it("parses a hexadecimal literal with radix 16", () => {
      const lexemes = lexify(tokenize("0x1A", "Python"), "Python");
      const literal = lexemes[0];
      assertEquals("radix" in literal ? literal.radix : undefined, 16);
      assertEquals("value" in literal ? literal.value : undefined, 26);
    });

    it("parses a plain decimal literal with radix 10 (no prefix to strip)", () => {
      const lexemes = lexify(tokenize("42", "Python"), "Python");
      const literal = lexemes[0];
      assertEquals("radix" in literal ? literal.radix : undefined, 10);
      assertEquals("value" in literal ? literal.value : undefined, 42);
    });

    it("reads a character literal's code point", () => {
      const lexemes = lexify(tokenize("x = 'a'", "C"), "C");
      const literal = lexemes.find(
        (l) =>
          l.type === "literal" && "subtype" in l && l.subtype === "character",
      );
      assertEquals(
        literal && "value" in literal ? literal.value : undefined,
        "a".charCodeAt(0),
      );
    });

    // N.B. integerLexeme's `firstNonInteger.index ?? 0` fallback is dead:
    // `firstNonInteger` comes from String.prototype.match, which always sets
    // `.index` on a successful match, and the `??` is only reached when the
    // match succeeded. The three prefixed-literal tests above are what
    // exercise the truthy path.
  });

  describe("input and query codes", () => {
    it("lower-cases a Pascal input code's value", () => {
      const lexemes = lexify(tokenize("\\KEY", "Pascal"), "Pascal");
      const input = lexemes.find((l) => l.type === "input");
      assertEquals(input && "value" in input ? input.value : undefined, "key");
    });

    it("preserves a non-Pascal input code's value as-is", () => {
      const lexemes = lexify(tokenize("\\key", "Python"), "Python");
      const input = lexemes.find((l) => l.type === "input");
      assertEquals(input && "value" in input ? input.value : undefined, "key");
    });

    it("lower-cases a Pascal query code's value", () => {
      const lexemes = lexify(tokenize("?KEY", "Pascal"), "Pascal");
      const query = lexemes.find((l) => l.type === "query");
      assertEquals(query && "value" in query ? query.value : undefined, "key");
    });

    it("preserves a non-Pascal query code's value as-is", () => {
      const lexemes = lexify(tokenize("?key", "Python"), "Python");
      const query = lexemes.find((l) => l.type === "query");
      assertEquals(query && "value" in query ? query.value : undefined, "key");
    });
  });

  describe("identifiers", () => {
    it("gives a turtle property the 'turtle' subtype", () => {
      const lexemes = lexify(tokenize("turtx", "Python"), "Python");
      const identifier = lexemes.find((l) => l.type === "identifier");
      assertEquals(
        identifier && "subtype" in identifier ? identifier.subtype : undefined,
        "turtle",
      );
    });

    it("gives a command the plain 'identifier' subtype", () => {
      const lexemes = lexify(tokenize("forward", "Python"), "Python");
      const identifier = lexemes.find((l) => l.type === "identifier");
      assertEquals(
        identifier && "subtype" in identifier ? identifier.subtype : undefined,
        "identifier",
      );
    });

    it("lower-cases a Pascal identifier's value", () => {
      const lexemes = lexify(tokenize("MyVar", "Pascal"), "Pascal");
      const identifier = lexemes.find((l) => l.type === "identifier");
      assertEquals(
        identifier && "value" in identifier ? identifier.value : undefined,
        "myvar",
      );
    });

    it("preserves a non-Pascal identifier's value as-is", () => {
      const lexemes = lexify(tokenize("MyVar", "Python"), "Python");
      const identifier = lexemes.find((l) => l.type === "identifier");
      assertEquals(
        identifier && "value" in identifier ? identifier.value : undefined,
        "MyVar",
      );
    });
  });

  describe("errors", () => {
    it("throws on an unterminated comment", () => {
      assertThrows(
        () => lexify(tokenize("{ never closes\nx", "Pascal"), "Pascal"),
        Error,
        "Unterminated comment",
      );
    });

    it("throws on an unterminated string", () => {
      assertThrows(
        () => lexify(tokenize("x = 'hello", "Python"), "Python"),
        Error,
        "Unterminated string",
      );
    });

    it("throws on an ill-formed binary literal", () => {
      assertThrows(
        () => lexify(tokenize("0b101", "BASIC"), "BASIC"),
        Error,
        "Ill-formed integer literal",
      );
    });

    it("throws on an ill-formed octal literal", () => {
      assertThrows(
        () => lexify(tokenize("0o17", "Pascal"), "Pascal"),
        Error,
        "Ill-formed integer literal",
      );
    });

    it("throws on an ill-formed hexadecimal literal", () => {
      assertThrows(
        () => lexify(tokenize("$1A", "BASIC"), "BASIC"),
        Error,
        "Ill-formed integer literal",
      );
    });

    it("throws on a real number literal (unsupported)", () => {
      assertThrows(
        () => lexify(tokenize("3.14", "Python"), "Python"),
        Error,
        "does not support real numbers",
      );
    });

    it("throws on an unrecognised input code", () => {
      assertThrows(
        () => lexify(tokenize("\\zzz", "Python"), "Python"),
        Error,
        "Unrecognised input code",
      );
    });

    it("throws on an unrecognised query code", () => {
      assertThrows(
        () => lexify(tokenize("?zzz", "Python"), "Python"),
        Error,
        "Unrecognised input query",
      );
    });

    it("throws on an illegal character", () => {
      assertThrows(
        () => lexify(tokenize("@", "Python"), "Python"),
        Error,
        "Illegal character",
      );
    });
  });
});
