import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertExists, assertFalse } from "@std/assert";
import {
  defaultCompilerOptions,
  encode,
  lexify,
  parse,
  tokenize,
} from "@/core/compiler.ts";
import { type Language, PCode } from "@/core/constants.ts";
import { compileAndEncode, countOf } from "./encoder/lib/helpers.ts";
import { LANGUAGES } from "./lib/languages.ts";

const examplesRoot = new URL("../../../assets/examples/", import.meta.url);

const compilePython = (code: string) =>
  encode(parse(lexify(tokenize(code, "Python"), "Python"), "Python"));

/**
 * Covers `encode()`'s overall program assembly - the fixed setup preamble,
 * statement placement, subroutine hoisting, and the `EncoderOptions`
 * parameter - through tiny canonical programs whose exact pcode is pinned
 * (expected arrays are copies of real compiler output). Individual statement
 * and expression encodings live in `test/core/compiler/encoder/`.
 */
describe("encode", () => {
  it("an empty program is exactly the two-line memory/turtle setup preamble plus a final HALT", () => {
    const pcode = compileAndEncode("Python", "");
    assertEquals(pcode, [
      // line 1: global memory setup (turtle pointer, zeroing, stack top)
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 6, 172, 160, 18,
        186,
      ],
      // line 2: turtle home/thickness/angle, keybuffer, resolution and canvas
      [
        15, 1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [178],
    ]);
    assertEquals(pcode.at(-1), [PCode.halt]);
  });

  it("encodes a global integer assignment as one LDIN value / STVG address line between the preamble and HALT", () => {
    const pcode = compileAndEncode("Python", "x = 42");
    assertEquals(pcode, [
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 7, 172, 160, 19,
        186,
      ],
      [
        15, 1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [160, 42, 167, 19],
      [178],
    ]);
    // the assignment line, by name: load the literal, store to "x" (the
    // first global slot after the 19-cell turtle block)
    assertEquals(pcode[2], [PCode.ldin, 42, PCode.stvg, 19]);
  });

  it("encodes a for-range loop as init, a forward ifno out to the exit, the body, then increment-and-jump-back", () => {
    const pcode = compileAndEncode("Python", "for i in range(3):\n    x = i");
    assertEquals(pcode, [
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 8, 172, 160, 20,
        186,
      ],
      [
        15, 1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [160, 0, 167, 19], // i = 0
      [161, 19, 160, 3, 50, 177, 7], // i < 3, ifno -> exit
      [161, 19, 167, 20], // x = i
      [161, 19, 7, 167, 19, 176, 4], // i += 1, jump back to the condition
      [178],
    ]);
    // the condition's ifno exits to the (1-based) HALT line, and the
    // increment line's unconditional jump goes back to the condition
    const conditionLine = pcode[3];
    const incrementLine = pcode[5];
    assertEquals(conditionLine?.at(-1), pcode.length);
    assertEquals(incrementLine?.at(-2), PCode.jump);
    assertEquals(incrementLine?.at(-1), 4);
  });

  it("hoists a function definition behind a jump, and the call's PCode.subr is back-patched to the function's start line", () => {
    const pcode = compileAndEncode("Python", "def f():\n    pass\nf()");
    assertEquals(pcode, [
      [
        160, 13, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 6, 172, 160, 19,
        186,
      ],
      [
        15, 1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [176, 6], // jump past the hoisted definition to the main program
      [181, 1], // f's start line: pssr (push subroutine register)
      [182, 180], // plsr, retn
      [179, 4], // the main program: subr, back-patched to f's start line
      [178],
    ]);
    assertEquals(pcode[2], [PCode.jump, 6]);
    assertEquals(pcode[5], [PCode.subr, 4]);
  });

  describe("a minimal assignment program in every language", () => {
    const programs: Record<Language, string> = {
      BASIC: "x% = 1\nEND",
      C: "void main () {\nint x;\nx = 1;\n}",
      Java: "class Test {\nvoid main () {\nint x;\nx = 1;\n}\n}",
      Pascal: "program Test;\nvar x: integer;\nbegin\nx := 1;\nend.",
      Python: "x = 1",
      TypeScript: "var x: number;\nx = 1;",
    };

    for (const language of LANGUAGES) {
      it(`${language}: loads the literal with LDIN, stores it with STVG (global) or STVV (local), and ends with the one HALT`, () => {
        const pcode = compileAndEncode(language, programs[language]);
        // C and Java require the assignment to live inside "main", so
        // their store is subroutine-local (stvv); everywhere else "x" is
        // a global (stvg)
        assert(
          pcode.some(
            (line) =>
              line[0] === PCode.ldin &&
              line[1] === 1 &&
              (line.includes(PCode.stvg) || line.includes(PCode.stvv)),
          ),
        );
        assertEquals(pcode.at(-1), [PCode.halt]);
        assertEquals(countOf(pcode, PCode.halt), 1);
      });
    }
  });

  describe("encoder options", () => {
    // EncoderOptions (see @/core/compiler.ts) declares eight fields:
    // canvasStartSize, setupDefaultKeyBuffer, turtleAttributesAsGlobals,
    // initialiseLocals, allowCSTR, separateReturnStack,
    // separateMemoryControlStack and separateSubroutineRegisterStack.
    // Only initialiseLocals changes what encode() emits (tested first);
    // the other seven are pinned as no-ops below.

    it("initialiseLocals: true (the default) zeroes a subroutine's locals with an extra LDAV/LDIN/ZPTR line; false omits exactly that line", () => {
      const code = "def f():\n    y = 1\n\nf()";
      const withZeroing = compileAndEncode("Python", code);
      const withoutZeroing = compileAndEncode("Python", code, {
        ...defaultCompilerOptions,
        initialiseLocals: false,
      });
      // the zeroing line itself: load the address of f's local space, and
      // zero its one cell
      assertEquals(withZeroing[5], [
        PCode.ldav,
        12,
        1,
        PCode.ldin,
        1,
        PCode.zptr,
      ]);
      // without it, f's body goes straight from claiming memory to the
      // "y = 1" store
      assertEquals(withoutZeroing[5], [PCode.ldin, 1, PCode.stvv, 12, 1]);
      // and that line is the WHOLE difference: dropping it (and pointing
      // the hoist jump one line earlier to compensate) reproduces the
      // option-off pcode exactly
      const expected = withZeroing
        .map((line, i) => (i === 2 ? [PCode.jump, 8] : line))
        .filter((_, i) => i !== 5);
      assertEquals(withoutZeroing, expected);
    });

    it("the other seven options are accepted but change nothing in the pcode [known limitation]", () => {
      // What the right behaviour would be: canvasStartSize should replace
      // the hardcoded 1000 in the setup preamble's resolution/canvas line,
      // setupDefaultKeyBuffer should make the "bufr 32" keybuffer setup
      // optional, and so on - but programStart ignores its options argument
      // entirely, and initialiseLocals (above) is the only field the
      // encoder reads anywhere. The seven others are threaded through the
      // UI's compile menu to here and then dropped. Pinned so that
      // implementing any of them trips this test and gets a real test of
      // its own.
      const code = 'forward(100)\nprint(turtx)\ndef f():\n    y = "s"\n\nf()';
      const flipped = compileAndEncode("Python", code, {
        ...defaultCompilerOptions,
        canvasStartSize: 350,
        setupDefaultKeyBuffer: false,
        turtleAttributesAsGlobals: false,
        allowCSTR: false,
        separateReturnStack: false,
        separateMemoryControlStack: false,
        separateSubroutineRegisterStack: false,
      });
      assertEquals(flipped, compileAndEncode("Python", code));
    });
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
      assert(flat.includes(PCode.lmul));
      assertFalse(flat.includes(PCode.mult));
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
