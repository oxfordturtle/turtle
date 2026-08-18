import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { keywords, languages } from "@/core/constants.ts";

describe("keywords", () => {
  it("defines a keyword list for every language", () => {
    for (const language of languages) {
      assertEquals(Array.isArray(keywords[language]), true);
      assertEquals(keywords[language].length > 0, true);
    }
  });

  it("has no duplicate keyword name within a single language", () => {
    for (const language of languages) {
      const names = keywords[language].map((k) => k.name);
      assertEquals(
        new Set(names).size,
        names.length,
        `${language} has duplicate keywords`,
      );
    }
  });

  it("every keyword's category is one of the three known keyword categories", () => {
    // 20: command structures, 21: variable scope modifiers, 22: other
    // (not shown in usage tables) -- see categories.ts's keywordCategories,
    // which only surfaces 20/21.
    for (const language of languages) {
      for (const keyword of keywords[language]) {
        assertEquals(
          [20, 21, 22].includes(keyword.category),
          true,
          `${language} ${keyword.name}: ${keyword.category}`,
        );
      }
    }
  });

  it("every C-family language (C, Java, Pascal, TypeScript) has if/else/for/while", () => {
    for (const language of ["C", "Java", "Pascal", "TypeScript"] as const) {
      const names = keywords[language].map((k) => k.name.toLowerCase());
      for (const expected of ["if", "else", "for", "while"]) {
        assertEquals(
          names.includes(expected),
          true,
          `${language} missing "${expected}"`,
        );
      }
    }
  });
});
