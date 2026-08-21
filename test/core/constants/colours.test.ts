import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertMatch } from "@std/assert";
import { colours, languages } from "@/core/constants.ts";

describe("colours", () => {
  it("defines exactly 50 colours, indexed 1-50 with no gaps or duplicates", () => {
    const indexes = colours.map((c) => c.index).toSorted((a, b) => a - b);
    assertEquals(
      indexes,
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
  });

  it("gives every colour a 6-digit uppercase hex code matching its numeric value", () => {
    for (const colour of colours) {
      assertMatch(colour.hex, /^[0-9A-F]{6}$/);
      assertEquals(parseInt(colour.hex, 16), colour.value);
    }
  });

  it("has no duplicate hex codes", () => {
    const hexes = colours.map((c) => c.hex);
    assertEquals(new Set(hexes).size, hexes.length);
  });

  it("gives every colour a name for every language", () => {
    for (const colour of colours) {
      for (const language of languages) {
        const name = colour.names[language];
        assertEquals(typeof name, "string");
        assert(name.length > 0, `${colour.hex} has no ${language} name`);
      }
    }
  });

  it("uppercases the BASIC name and leaves the other languages as given", () => {
    for (const colour of colours) {
      assertEquals(colour.names.BASIC, colour.names.BASIC.toUpperCase());
      // every non-BASIC language uses the same source name, unmodified
      const nonBasic = [
        colour.names.C,
        colour.names.Java,
        colour.names.Pascal,
        colour.names.Python,
        colour.names.TypeScript,
      ];
      for (const name of nonBasic) {
        assertEquals(name, colour.names.C);
      }
      assertEquals(colour.names.BASIC.toLowerCase(), colour.names.C);
    }
  });
});
