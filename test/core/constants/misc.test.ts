import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import { cursors, fonts, inputs } from "@/core/constants.ts";

describe("cursors", () => {
  it("has 16 cursors, indexed 0-15 with no gaps or duplicates, each with a non-empty CSS value and name", () => {
    const indexes = cursors.map((c) => c.index).toSorted((a, b) => a - b);
    assertEquals(
      indexes,
      Array.from({ length: 16 }, (_, i) => i),
    );
    for (const cursor of cursors) {
      assert(cursor.name.length > 0);
      assert(cursor.css.length > 0);
    }
  });
});

describe("fonts", () => {
  it("has 16 fonts, indexed 0-15 with no gaps or duplicates, each with a non-empty CSS value and name", () => {
    const indexes = fonts.map((f) => f.index).toSorted((a, b) => a - b);
    assertEquals(
      indexes,
      Array.from({ length: 16 }, (_, i) => i),
    );
    for (const font of fonts) {
      assert(font.name.length > 0);
      assert(font.css.length > 0);
    }
  });
});

describe("inputs", () => {
  it("has no duplicate input names", () => {
    const names = inputs.map((i) => i.name);
    assertEquals(new Set(names).size, names.length);
  });

  it("has no duplicate input values, other than the deliberate enter/return alias", () => {
    const byValue = new Map<number, string[]>();
    for (const input of inputs) {
      byValue.set(input.value, [
        ...(byValue.get(input.value) ?? []),
        input.name,
      ]);
    }
    const duplicated = [...byValue.entries()].filter(
      ([, names]) => names.length > 1,
    );
    assertEquals(duplicated, [[13, ["enter", "return"]]]);
  });

  it("includes the special negative pseudo-input codes used for mouse/key state", () => {
    const byName = Object.fromEntries(inputs.map((i) => [i.name, i.value]));
    assertEquals(byName["key"], -9);
    assertEquals(byName["mousex"], -7);
    assertEquals(byName["mousey"], -8);
    assertEquals(byName["lmouse"], -1);
  });

  it("includes real keyboard codes matching known DOM key codes", () => {
    const byName = Object.fromEntries(inputs.map((i) => [i.name, i.value]));
    assertEquals(byName["enter"], 13);
    assertEquals(byName["escape"], 27);
    assertEquals(byName["space"], 32);
    assertEquals(byName["a"], 65);
    assertEquals(byName["z"], 90);
  });
});
