import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { lexify, tokenize } from "@/core/compiler.ts";
import type { Language } from "@/core/constants.ts";

/**
 * Backslash escape sequences in string literals, for the four languages that
 * use them. Only `\'` and `\"` used to be resolved, so `'a\nb'` was seven
 * characters of literal text rather than three, and `'a\\'` couldn't even
 * be tokenized ("Unterminated string").
 *
 * Asserted at the *lexeme* level rather than by running a program: the
 * value a string literal carries is exactly what this step changes, and a
 * printed-output test would additionally depend on the console adapter's
 * own newline handling.
 */
describe("compiler: string literal escape sequences", () => {
  /** the value of the first string/character literal in `code` */
  const literalValue = (language: Language, code: string): string | number => {
    const lexeme = lexify(tokenize(code, language), language).find(
      (x) => x.type === "literal" && x.subtype !== "boolean",
    );
    if (!lexeme || lexeme.type !== "literal") {
      throw new Error(`no literal found in ${code}`);
    }
    return lexeme.value as string | number;
  };

  /** the token types tokenize() produced, in order - for checking a literal was delimited correctly */
  const tokenTypes = (language: Language, code: string): string[] =>
    tokenize(code, language)
      .filter((x) => x.type !== "spaces")
      .map((x) => x.type);

  const BACKSLASH_LANGUAGES: Language[] = ["C", "Java", "Python", "TypeScript"];

  describe("Python", () => {
    const value = (code: string) => literalValue("Python", code);

    it("resolves \\n to a real newline", () => {
      assertEquals(value("s='a\\nb'"), "a\nb");
    });

    it("resolves \\t and \\r", () => {
      assertEquals(value("s='a\\tb'"), "a\tb");
      assertEquals(value("s='a\\rb'"), "a\rb");
    });

    it("resolves \\\\ to a single backslash", () => {
      assertEquals(value("s='a\\\\b'"), "a\\b");
    });

    it("resolves \\0 to a null character", () => {
      assertEquals(value("s='a\\0b'"), "a\0b");
    });

    it("consumes \\\\ before its second character can start another escape", () => {
      // "'a\\nb'" in source: backslash, backslash, n, b - four characters,
      // NOT a newline. A naive sequence of .replace() calls gets this wrong
      // unless \\ goes last,
      // and then gets 'a\\\\b' wrong instead
      assertEquals(value("s='a\\\\nb'"), "a\\nb");
      assertEquals(String(value("s='a\\\\nb'")).length, 4);
    });

    it("still resolves the two escapes that already worked", () => {
      assertEquals(value("s='\\''"), "'");
      assertEquals(value('s="\\""'), '"');
    });

    it("leaves an unrecognised escape, backslash and all, unchanged", () => {
      // real Python keeps the backslash (with a warning); keeping it is the
      // compatible choice, and the one that can't silently change a value
      assertEquals(value("s='a\\qb'"), "a\\qb");
    });

    it("leaves a lone trailing backslash alone rather than eating the quote", () => {
      assertEquals(value("s='a\\\\'"), "a\\");
    });

    it("tokenizes a literal whose last character is an escaped backslash", () => {
      // "s = 'a' + '\\' + 'b'" used to fail
      // with "Unterminated string", because the closing quote was preceded
      // by a backslash and so wasn't recognised as closing
      assertEquals(tokenTypes("Python", "s='a'+'\\\\'+'b'"), [
        "identifier",
        "operator",
        "string",
        "operator",
        "string",
        "operator",
        "string",
      ]);
    });

    it("leaves the input constants lexing as input codes, not strings", () => {
      // "\escape" and friends are backslash-prefixed but live in expression
      // position, never inside a literal - so escape processing must not
      // reach them
      const lexemes = lexify(tokenize("k=\\escape", "Python"), "Python");
      const input = lexemes.find((x) => x.type === "input");
      assertEquals(input?.value, "escape");
    });

    it("leaves a backslash-free literal exactly as it was", () => {
      assertEquals(value("s='hello world'"), "hello world");
    });
  });

  describe("the other backslash languages behave the same", () => {
    // each language's own way of writing "s = <literal>"; the literal
    // itself is spelled identically in all four
    const wrap: Partial<Record<Language, (literal: string) => string>> = {
      C: (literal) => `PROC main() {\n  string s = ${literal};\n}`,
      Java: (literal) =>
        `class Test {\n  void main() {\n    String s = ${literal};\n  }\n}`,
      TypeScript: (literal) => `let s: string = ${literal};`,
    };

    for (const language of BACKSLASH_LANGUAGES) {
      if (language === "Python") continue;
      it(`resolves \\n and \\\\ in ${language}`, () => {
        const code = wrap[language] as (literal: string) => string;
        assertEquals(literalValue(language, code("'a\\nb'")), "a\nb");
        assertEquals(literalValue(language, code("'a\\\\b'")), "a\\b");
      });
    }

    it("gives C's \\' character literal the quote, not the backslash", () => {
      // a one-character value lexes as a character in C/Java/Pascal, whose
      // code point used to be read off the raw source's second character -
      // the backslash. assets/examples/C/Further/StringFunctions.tc prints
      // one of these and used to show a backslash
      assertEquals(literalValue("C", "PROC main() {\n  print('\\'');\n}"), 39);
    });
  });

  describe("BASIC and Pascal are untouched", () => {
    it("Pascal doubles the quote and treats a backslash as an ordinary character", () => {
      assertEquals(
        literalValue(
          "Pascal",
          "PROGRAM t;\nVAR s: string;\nBEGIN\n  s := 'a\\nb';\nEND.",
        ),
        "a\\nb",
      );
      assertEquals(
        literalValue(
          "Pascal",
          "PROGRAM t;\nVAR s: string;\nBEGIN\n  s := 'it''s';\nEND.",
        ),
        "it's",
      );
    });

    it("BASIC doubles the quote and treats a backslash as an ordinary character", () => {
      assertEquals(literalValue("BASIC", 's$ = "a\\nb"'), "a\\nb");
      assertEquals(literalValue("BASIC", 's$ = "say ""hi"""'), 'say "hi"');
    });
  });

  describe("unterminated strings are still reported", () => {
    it("reports a string with no closing quote at all", () => {
      assertEquals(tokenTypes("Python", "s='abc"), [
        "identifier",
        "operator",
        "unterminatedString",
      ]);
    });

    it("reports one whose only closing quote is escaped", () => {
      assertEquals(tokenTypes("Python", "s='abc\\'"), [
        "identifier",
        "operator",
        "unterminatedString",
      ]);
    });
  });
});
