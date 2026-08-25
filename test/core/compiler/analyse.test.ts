import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertFalse } from "@std/assert";
import {
  analyse,
  lexify,
  parse,
  tokenize,
  type UsageCategory,
} from "@/core/compiler.ts";
import type { Language } from "@/core/constants.ts";
import { LANGUAGES } from "./lib/languages.ts";
import { wrapProgram } from "./parser/lib/programs.ts";

/**
 * `analyse()` is a pure lexeme-usage report: for every command/keyword
 * "category" defined in `@/core/constants.ts` (turtle commands, maths
 * functions, `if`/`for`/etc., variable-scope modifiers), plus a synthetic
 * "Subroutine calls" category, it scans the raw lexeme stream for lexemes
 * whose content matches that expression's name, and reports how many times
 * and on which lines each *used* expression appears. It does not consult
 * the parsed `Program` for semantic information (declared-but-unused
 * variables, read/write distinctions, etc.) - matching is purely
 * name-against-lexeme-content, so it can't tell a definition site from a
 * call site, and it raises no errors of its own (undeclared identifiers
 * etc. are caught earlier, during `parse()`).
 */
const compileAndAnalyse = (
  language: Language,
  code: string,
): UsageCategory[] => {
  const tokens = tokenize(code, language);
  const lexemes = lexify(tokens, language);
  const program = parse(lexemes, language);
  return analyse(lexemes, program);
};

const findCategory = (
  result: UsageCategory[],
  title: string,
): UsageCategory | undefined =>
  result.find((category) => category.category === title);

describe("analyse", () => {
  it("reports no usage categories for a program that uses no commands or keywords", () => {
    const result = compileAndAnalyse("BASIC", "END");
    assertEquals(result, []);
  });

  describe("command usage, across languages", () => {
    const forwardCalls: Record<Language, string> = {
      BASIC: "FORWARD(10)",
      C: "forward(10);",
      Java: "forward(10);",
      Pascal: "forward(10);",
      Python: "forward(10)",
      TypeScript: "forward(10);",
    };

    for (const language of LANGUAGES) {
      it(`records a single use of "forward" for ${language}`, () => {
        const result = compileAndAnalyse(
          language,
          wrapProgram(language, forwardCalls[language]),
        );
        const category = findCategory(result, "Turtle: relative movement");

        const expectedName = language === "BASIC" ? "FORWARD" : "forward";
        assertEquals(category?.total, 1);
        assertEquals(category?.expressions, [
          {
            name: expectedName,
            level: 1,
            count: 1,
            lines: category!.expressions[0].lines,
          },
        ]);
      });
    }
  });

  it("matches Pascal command names case-insensitively, and reports the name lower-cased", () => {
    const result = compileAndAnalyse(
      "Pascal",
      "program Test;\nbegin\nForWard(10);\nend.",
    );
    const category = findCategory(result, "Turtle: relative movement");
    assertEquals(category?.expressions, [
      {
        name: "forward",
        level: 1,
        count: 1,
        lines: "3",
      },
    ]);
  });

  it("counts multiple uses on different lines and reports lines in ascending order", () => {
    const result = compileAndAnalyse(
      "BASIC",
      "FORWARD(1)\nFORWARD(2)\nBACK(3)\nEND",
    );
    const category = findCategory(result, "Turtle: relative movement");
    assertEquals(category, {
      category: "Turtle: relative movement",
      total: 3,
      expressions: [
        { name: "BACK", level: 1, count: 1, lines: "3" },
        { name: "FORWARD", level: 1, count: 2, lines: "1 2" },
      ],
    });
  });

  it("sorts expressions within a category by level, then alphabetically", () => {
    // "forward"/"back" are level 0, "drawXY" is level 1 - drawXY should sort
    // last regardless of its position in the source or in the alphabet.
    const result = compileAndAnalyse(
      "BASIC",
      "DRAWXY(1, 2)\nFORWARD(1)\nBACK(1)\nEND",
    );
    const category = findCategory(result, "Turtle: relative movement");
    assertEquals(
      category?.expressions.map((e) => e.name),
      ["BACK", "FORWARD", "DRAWXY"],
    );
  });

  it("omits categories with no used expressions", () => {
    const result = compileAndAnalyse("BASIC", "FORWARD(1)\nEND");
    // "Canvas operations" is a real category, but nothing in it is used here
    assertEquals(findCategory(result, "Canvas operations"), undefined);
    assertEquals(result.length, 1);
  });

  it("records keyword usage under its own category", () => {
    const result = compileAndAnalyse(
      "BASIC",
      "IF TRUE THEN\nFORWARD(10)\nENDIF\nEND",
    );
    const category = findCategory(result, "Command structures");
    assertEquals(category?.expressions, [
      {
        name: "IF",
        level: 1,
        count: 1,
        lines: "1",
      },
    ]);
  });

  it("records BASIC's PRIVATE variable-scope-modifier keyword", () => {
    const result = compileAndAnalyse(
      "BASIC",
      "FORWARD(1)\nEND\nDEF PROCfoo\nPRIVATE x%\nENDPROC",
    );
    const category = findCategory(result, "Variable scope modifiers");
    assertEquals(category?.expressions, [
      {
        name: "PRIVATE",
        level: 3,
        count: 1,
        lines: "4",
      },
    ]);
  });

  it("doesn't report a 'Subroutine calls' category when only one subroutine exists", () => {
    // getAllSubroutines(program).slice(1) drops the first (and here, only)
    // subroutine from the pool of candidates entirely, so even though
    // PROCfoo is both defined and called, no "Subroutine calls" category
    // is produced at all.
    const result = compileAndAnalyse(
      "BASIC",
      "PROCfoo\nEND\nDEF PROCfoo\nBACK(1)\nENDPROC",
    );
    assertEquals(findCategory(result, "Subroutine calls"), undefined);
  });

  it("reports 'Subroutine calls' for the second-and-later subroutines, counting definition and call sites together", () => {
    // Two subroutines are defined (PROCfoo, then PROCbar); only the second
    // one in that flattened order is eligible to appear as a "subroutine
    // call". Its count includes every lexeme matching its name, including
    // its own "DEF PROCbar" definition line, not just call sites - the
    // matching is purely lexeme-content-based, not semantic.
    const result = compileAndAnalyse(
      "BASIC",
      "PROCbar\nEND\nDEF PROCfoo\nBACK(1)\nENDPROC\nDEF PROCbar\nPROCfoo\nENDPROC",
    );
    const category = findCategory(result, "Subroutine calls");
    assertEquals(category, {
      category: "Subroutine calls",
      total: 2,
      expressions: [{ name: "PROCbar", level: 0, count: 2, lines: "1 6" }],
    });
    // PROCfoo itself never appears as a "Subroutine calls" expression,
    // even though it's both defined and called.
    assertFalse(category?.expressions.some((e) => e.name === "PROCfoo"));
  });
});
