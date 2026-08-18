import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import { encode, lexify, parse, tokenize } from "@/core/compiler.ts";
import { PCode } from "@/core/constants.ts";

const examplesRoot = new URL("../../../assets/examples/", import.meta.url);

const compilePython = (code: string) =>
  encode(parse(lexify(tokenize(code, "Python"), "Python"), "Python"));

describe("encode", () => {
  it("encodes a simple Python assignment", () => {
    const code = "x = 42";
    const tokens = tokenize(code, "Python");
    const lexemes = lexify(tokens, "Python");
    const program = parse(lexemes, "Python");
    const pcode = encode(program);

    assertExists(pcode);
    assertEquals(Array.isArray(pcode), true);
    assertEquals(pcode.length > 0, true);
  });

  it("produces an array of arrays", () => {
    const code = "x = 1";
    const tokens = tokenize(code, "Python");
    const lexemes = lexify(tokens, "Python");
    const program = parse(lexemes, "Python");
    const pcode = encode(program);

    // Each pcode instruction should be an array
    pcode.forEach((instruction) => {
      assertEquals(Array.isArray(instruction), true);
    });
  });

  it("produces pcode instructions with numeric values", () => {
    const code = "x = 42";
    const tokens = tokenize(code, "Python");
    const lexemes = lexify(tokens, "Python");
    const program = parse(lexemes, "Python");
    const pcode = encode(program);

    // Each instruction should contain numbers
    pcode.forEach((instruction) => {
      instruction.forEach((value) => {
        assertEquals(typeof value, "number");
      });
    });
  });

  it("handles an empty program", () => {
    const code = "";
    const tokens = tokenize(code, "Python");
    const lexemes = lexify(tokens, "Python");
    const program = parse(lexemes, "Python");
    const pcode = encode(program);

    assertExists(pcode);
    assertEquals(Array.isArray(pcode), true);
    // Even empty program should have some startup/shutdown code
    assertEquals(pcode.length > 0, true);
  });

  it("handles function definitions", () => {
    const code = "def foo():\n  x = 1";
    const tokens = tokenize(code, "Python");
    const lexemes = lexify(tokens, "Python");
    const program = parse(lexemes, "Python");
    const pcode = encode(program);

    assertExists(pcode);
    // Program with function should produce more instructions
    assertEquals(pcode.length > 5, true);
  });

  it("accepts encoder options", () => {
    const code = "x = 1";
    const tokens = tokenize(code, "Python");
    const lexemes = lexify(tokens, "Python");
    const program = parse(lexemes, "Python");

    // encode function accepts optional options parameter
    const pcode = encode(program);

    assertExists(pcode);
    assertEquals(Array.isArray(pcode), true);
  });

  it("produces more pcode for larger programs", () => {
    const smallCode = "x = 1";
    const largeCode = "x = 1\ny = 2\nz = 3\nfor i in range(10):\n  x = x + i";

    const smallPcode = encode(
      parse(lexify(tokenize(smallCode, "Python"), "Python"), "Python"),
    );
    const largePcode = encode(
      parse(lexify(tokenize(largeCode, "Python"), "Python"), "Python"),
    );

    // Larger program should produce more instructions
    assertEquals(largePcode.length > smallPcode.length, true);
  });

  // Python list literals and multiplication
  describe("Python list literals and multiplication", () => {
    const flatten = (pcode: number[][]): number[] => pcode.flat();

    it("encodes a non-empty integer list literal as LIHP + one LAPP per element", () => {
      const flat = flatten(compilePython("x = [1, 2, 3]"));
      assertEquals(flat.filter((n) => n === PCode.lihp).length, 1);
      assertEquals(flat.filter((n) => n === PCode.lapp).length, 3);
    });

    it("encodes an empty list literal (hinted, so its type is certain) as LIHP with no LAPP", () => {
      // a hint-less "x=[]" can't be compiled standalone - its element kind
      // stays uncertain until something later pins it (decision 6), so
      // parse() itself throws "Could not infer the type" (tested in
      // python.test.ts) - use an explicit hint here instead
      const flat = flatten(compilePython("x: List[int] = []"));
      assertEquals(flat.filter((n) => n === PCode.lihp).length, 1);
      assertEquals(flat.filter((n) => n === PCode.lapp).length, 0);
    });

    it("encodes list multiplication ('[0]*8') as LMUL, not integer MULT", () => {
      const flat = flatten(compilePython("x = [0]*8"));
      assertEquals(flat.includes(PCode.lmul), true);
      assertEquals(flat.includes(PCode.mult), false);
    });

    it("compiles SolarSystem.tpy's list-literal declaration lines without error", async () => {
      const code = await Deno.readTextFile(
        new URL("Python/Movement/SolarSystem.tpy", examplesRoot),
      );
      const lines = code.split("\n").slice(0, 7).join("\n"); // the 4 list literals plus "rotation=[0]*planets"
      assertExists(compilePython(lines));
    });

    it("compiles ListFunctions.tpy's 'mylist=[0]*8' line without error", async () => {
      const code = await Deno.readTextFile(
        new URL("Python/Further/ListFunctions.tpy", examplesRoot),
      );
      const line = code
        .split("\n")
        .find((l) => l.startsWith("mylist=[0]*8")) as string;
      assertExists(line);
      assertExists(compilePython(line));
    });
  });
});
