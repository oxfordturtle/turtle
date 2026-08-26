import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { highlight, type Token } from "@/core/compiler.ts";
import { LANGUAGES } from "./lib/languages.ts";

// A hand-built token, used to reach highlighter branches that the tokenizer
// itself can never produce (e.g. a "colour" token whose content doesn't
// actually match a known colour name) — Token is a plain exported interface,
// so building one directly here doesn't reach into any internal module.
const fakeToken = (type: Token["type"], content: string): Token => ({
  type,
  content,
  line: 1,
  character: 1,
});

describe("highlight", () => {
  for (const language of LANGUAGES) {
    it(`highlights source code without throwing in ${language}`, () => {
      const html = highlight("x = 1", language);
      assertEquals(typeof html, "string");
    });
  }

  it("accepts a pre-tokenized array as well as a source string", () => {
    const html = highlight([fakeToken("keyword", "if")], "Python");
    assertEquals(html, '<span class="keyword">if</span>');
  });

  it("passes spaces through unchanged", () => {
    const html = highlight([fakeToken("spaces", "   ")], "Python");
    assertEquals(html, "   ");
  });

  it("passes newlines through unchanged", () => {
    const html = highlight([fakeToken("newline", "\n")], "Python");
    assertEquals(html, "\n");
  });

  describe("error-class tokens", () => {
    const errorTypes: Token["type"][] = [
      "unterminatedComment",
      "unterminatedString",
      "badBinary",
      "badOctal",
      "badHexadecimal",
      "real",
      "badInputCode",
      "badQueryCode",
      "illegal",
    ];

    for (const type of errorTypes) {
      it(`renders a(n) ${type} token with the 'error' class`, () => {
        const html = highlight([fakeToken(type, "x")], "Python");
        assertEquals(html, '<span class="error">x</span>');
      });
    }
  });

  describe("integer-class tokens", () => {
    const integerTypes: Token["type"][] = [
      "binary",
      "octal",
      "hexadecimal",
      "decimal",
    ];

    for (const type of integerTypes) {
      it(`renders a(n) ${type} token with the 'integer' class`, () => {
        const html = highlight([fakeToken(type, "42")], "Python");
        assertEquals(html, '<span class="integer">42</span>');
      });
    }
  });

  describe("colour tokens", () => {
    it("renders a recognised colour with its hex value as an inline border colour", () => {
      const html = highlight([fakeToken("colour", "green")], "Python");
      assertStringIncludes(html, 'class="colour"');
      assertStringIncludes(html, "border-color:#228B22;");
      assertStringIncludes(html, ">green<");
    });

    it("looks up the colour name per-language", () => {
      const html = highlight([fakeToken("colour", "GREEN")], "BASIC");
      assertStringIncludes(html, "border-color:#228B22;");
    });

    it("renders an unrecognised colour name plainly, with no inline style", () => {
      const html = highlight([fakeToken("colour", "notacolour")], "Python");
      assertEquals(html, '<span class="colour">notacolour</span>');
    });
  });

  describe("default-class tokens", () => {
    const defaultTypes: Token["type"][] = [
      "comment",
      "keyword",
      "type",
      "operator",
      "delimiter",
      "string",
      "boolean",
      "inputCode",
      "queryCode",
      "turtle",
      "command",
      "identifier",
    ];

    for (const type of defaultTypes) {
      it(`renders a(n) ${type} token wrapped in a span of its own type`, () => {
        const html = highlight([fakeToken(type, "x")], "Python");
        assertEquals(html, `<span class="${type}">x</span>`);
      });
    }
  });

  it("joins multiple tokens into a single highlighted string", () => {
    const html = highlight(
      [
        fakeToken("keyword", "if"),
        fakeToken("spaces", " "),
        fakeToken("identifier", "x"),
      ],
      "Python",
    );
    assertEquals(
      html,
      '<span class="keyword">if</span> <span class="identifier">x</span>',
    );
  });

  it("highlights real tokenized BASIC source with keywords, commands, and strings", () => {
    const html = highlight('IF x THEN FORWARD\nname$ = "hi"', "BASIC");
    assertStringIncludes(html, '<span class="keyword">IF</span>');
    assertStringIncludes(html, '<span class="command">FORWARD</span>');
    assertStringIncludes(html, '<span class="string">"hi"</span>');
  });
});
