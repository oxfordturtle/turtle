import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import {
  commandCategories,
  commands,
  keywordCategories,
  keywords,
  languages,
} from "@/core/constants.ts";

describe("commandCategories", () => {
  it("accounts for every command exactly once", () => {
    const total = commandCategories.reduce(
      (sum, category) => sum + category.expressions.length,
      0,
    );
    assertEquals(total, commands.length);
  });

  it("puts every command in the category matching its own .category field", () => {
    for (const category of commandCategories) {
      for (const command of category.expressions) {
        assertEquals(command.category, category.index, command.id);
      }
    }
  });

  it("gives every category a non-empty title", () => {
    for (const category of commandCategories) {
      assertEquals(
        category.title.length > 0,
        true,
        `category ${category.index}`,
      );
    }
  });
});

describe("keywordCategories", () => {
  it("accounts for exactly the category-20/21 keywords of each language (not the uncategorised ones)", () => {
    for (const language of languages) {
      const total = keywordCategories[language].reduce(
        (sum, category) => sum + category.expressions.length,
        0,
      );
      const expected = keywords[language].filter(
        (k) => k.category === 20 || k.category === 21,
      ).length;
      assertEquals(total, expected, language);
    }
  });

  it("puts every keyword in the category matching its own .category field", () => {
    for (const language of languages) {
      for (const category of keywordCategories[language]) {
        for (const keyword of category.expressions) {
          assertEquals(
            keyword.category,
            category.index,
            `${language} ${keyword.name}`,
          );
        }
      }
    }
  });
});
