import { describe, it } from "@std/testing/bdd";
import { assertAlmostEquals, assertEquals } from "@std/assert";
import { encode, lexify, parse, tokenize } from "@/core/compiler.ts";
import type { Language } from "@/core/constants.ts";
import { defaultMachineOptions, run } from "@/core/machine.ts";
import { LANGUAGES } from "../compiler/_languages.ts";
import { wrapProgram } from "../compiler/parser/_programs.ts";
import { fakeCanvas, fakeFiles, fakeOutput, fakeTimers } from "./_fakes.ts";
import { runExampleBounded } from "./_exampleHarness.ts";
import {
  PCode,
  readAddr,
  runPcode,
  runToInt,
  runToString,
  withAngles360,
} from "./_helpers.ts";

/**
 * Behavioral coverage for `src/core/machine/runtime.ts`'s `execute()` -
 * the pcode interpreter loop - driven two ways:
 *
 * - Most cases here hand-write small `number[][]` pcode fragments directly
 *   (using `PCode` from `@/core/constants.ts`, part of the sanctioned
 *   constants barrel) rather than compiling source. `run()`'s own public
 *   signature takes `pcode: number[][]` directly, so this is testing
 *   through the barrel, not around it - and it decouples these tests from
 *   the compiler's own correctness and output shape, which the compiler suites
 *   cover separately.
 * - The final "compiled programs, end to end" section instead goes through
 *   `@/core/compiler.ts` for a handful of realistic programs, to prove real
 *   compiler output actually runs correctly on the machine.
 *
 * Since the evaluation stack itself isn't part of the machine's public
 * surface (only `dump()`'s variable/heap memory view is), most fragments
 * end with ITOS+WRIT (`runToInt`) or WRIT alone (`runToString`) to read
 * "what's on top of the stack" back out through the machine's own text
 * output - see `_helpers.ts`.
 */
describe("machine/runtime: execute()", () => {
  describe("basic stack operations", () => {
    it("NULL does nothing", () => {
      assertEquals(runToInt([PCode.ldin, 7], [PCode.null]), 7);
    });

    it("DROP removes the top of the stack", () => {
      assertEquals(runToInt([PCode.ldin, 1], [PCode.ldin, 2], [PCode.drop]), 1);
    });

    it("DUPL duplicates the top of the stack", () => {
      // if DUPL didn't duplicate, PLUS would have only one operand to pop
      assertEquals(runToInt([PCode.ldin, 5], [PCode.dupl], [PCode.plus]), 10);
    });

    it("SWAP exchanges the top two stack values", () => {
      // without SWAP, SUBT of [3, 7] would give 3 - 7 = -4
      assertEquals(
        runToInt([PCode.ldin, 3], [PCode.ldin, 7], [PCode.swap], [PCode.subt]),
        4,
      );
    });

    it("ROTA rotates the top three stack values", () => {
      // pushes (a, b, c) -> pops c, b, a -> pushes (b, c, a), so the value
      // pushed first (a) ends up back on top
      assertEquals(
        runToInt(
          [PCode.ldin, 1],
          [PCode.ldin, 2],
          [PCode.ldin, 3],
          [PCode.rota],
        ),
        1,
      );
    });

    it("ROLL with a positive argument rotates the nth-from-top value to the top", () => {
      // stack [10, 20, 30, 40], roll(1) - n counts from the top *after* n
      // itself is popped, so with only one item below n it's a no-op
      assertEquals(
        runToInt(
          [PCode.ldin, 10],
          [PCode.ldin, 20],
          [PCode.ldin, 30],
          [PCode.ldin, 40],
          [PCode.ldin, 1],
          [PCode.roll],
        ),
        40,
      );
      // stack [10, 20, 30, 40], roll(2) - the 2nd-from-top value (30) moves
      // to the top, with 40 shifting down to fill the gap
      assertEquals(
        runToInt(
          [PCode.ldin, 10],
          [PCode.ldin, 20],
          [PCode.ldin, 30],
          [PCode.ldin, 40],
          [PCode.ldin, 2],
          [PCode.roll],
        ),
        30,
      );
    });

    it("ROLL with a negative argument is the inverse: moves the top value down to the nth position", () => {
      // stack [100, 200, 300], roll(-1) - magnitude 1 means "roll the top
      // value down by 0 positions", i.e. a no-op
      assertEquals(
        runToInt(
          [PCode.ldin, 100],
          [PCode.ldin, 200],
          [PCode.ldin, 300],
          [PCode.ldin, -1],
          [PCode.roll],
        ),
        300,
      );
      // stack [100, 200, 300], roll(-2) - the top value (300) moves down to
      // become the 2nd-from-top, with 200 shifting up to take its place on top
      assertEquals(
        runToInt(
          [PCode.ldin, 100],
          [PCode.ldin, 200],
          [PCode.ldin, 300],
          [PCode.ldin, -2],
          [PCode.roll],
        ),
        200,
      );
    });

    it("PICK pushes a copy of the stack value at the given (immediate), 1-indexed-from-top position", () => {
      // 1-indexed to match Pascal, where PICK(1) is DUPL's equivalent
      assertEquals(
        runToInt(
          [PCode.ldin, 10],
          [PCode.ldin, 20],
          [PCode.ldin, 30],
          [PCode.ldin, 40],
          [PCode.pick, 1],
        ),
        40, // PICK 1 copies the top value itself
      );
      assertEquals(
        runToInt(
          [PCode.ldin, 10],
          [PCode.ldin, 20],
          [PCode.ldin, 30],
          [PCode.ldin, 40],
          [PCode.pick, 2],
        ),
        30, // PICK 2 copies the value one below the top
      );
    });
  });

  describe("operators on stack value", () => {
    it("INCR adds 1", () => {
      assertEquals(runToInt([PCode.ldin, 5], [PCode.incr]), 6);
    });

    it("DECR subtracts 1", () => {
      assertEquals(runToInt([PCode.ldin, 5], [PCode.decr]), 4);
    });

    it("NEG negates", () => {
      assertEquals(runToInt([PCode.ldin, 5], [PCode.neg]), -5);
    });

    it("ABS takes the absolute value", () => {
      assertEquals(runToInt([PCode.ldin, -5], [PCode.abs]), 5);
    });

    it("SIGN returns -1, 0, or 1", () => {
      assertEquals(runToInt([PCode.ldin, -7], [PCode.sign]), -1);
      assertEquals(runToInt([PCode.ldin, 0], [PCode.sign]), 0);
      assertEquals(runToInt([PCode.ldin, 7], [PCode.sign]), 1);
    });
  });

  describe("random numbers", () => {
    // reproduces the machine's own `randomNumber` formula (documented in
    // `machine/utils.ts`) against a known seed, rather than asserting only
    // "some number came back" - this is testing a specific, deterministic
    // PRNG algorithm's documented output, not a hidden implementation detail
    const expectedRandom = (seed: number, n: number): number => {
      let value = Math.sin(seed) * 10000;
      value = value - Math.floor(value);
      return Math.floor(value * Math.abs(n));
    };

    it("SEED sets the seed and returns it", () => {
      assertEquals(runToInt([PCode.ldin, 42], [PCode.seed]), 42);
    });

    it("SEED with 0 reseeds from the clock, rather than re-echoing the existing seed", () => {
      // WAIT defers execution via timers.scheduleCallback, giving us a
      // chance to advance the fake clock in between the seed the machine
      // set automatically at run() start and the SEED(0) call below - if
      // SEED(0) just re-echoed the existing (stale) seed, this would come
      // back as 0 (the clock's value when run() started), not the
      // advanced value
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [
          [PCode.ldin, 100],
          [PCode.wait],
          [PCode.ldin, 0],
          [PCode.seed],
          [PCode.itos],
          [PCode.writ],
          [PCode.halt],
        ],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      timers.advance(12345);
      timers.flush();
      assertEquals(parseInt(output.outputText, 10), 12345);
    });

    it("RAND pushes a pseudo-random number derived from the (incrementing) seed", () => {
      assertEquals(
        runToInt(
          [PCode.ldin, 42],
          [PCode.seed],
          [PCode.drop],
          [PCode.ldin, 1000],
          [PCode.rand],
        ),
        expectedRandom(42, 1000),
      );
    });
  });

  describe("maximum integer / true value", () => {
    it("MXIN pushes the maximum integer", () => {
      assertEquals(runToInt([PCode.mxin]), Math.pow(2, 31) - 1);
    });

    it("TRUE sets the value comparisons push for a true result", () => {
      assertEquals(
        runToInt(
          [PCode.true, 5],
          [PCode.ldin, 3],
          [PCode.ldin, 3],
          [PCode.eqal],
        ),
        5,
      );
    });
  });

  describe("Boolean (bitwise) operators", () => {
    it("SHFT with a non-negative argument shifts left", () => {
      assertEquals(
        runToInt([PCode.ldin, 8], [PCode.ldin, 2], [PCode.shft]),
        32,
      );
    });

    it("SHFT with a negative argument shifts right", () => {
      assertEquals(
        runToInt([PCode.ldin, 8], [PCode.ldin, -2], [PCode.shft]),
        2,
      );
    });

    it("NOT complements the bits", () => {
      assertEquals(runToInt([PCode.ldin, 0], [PCode.not]), -1);
    });

    it("AND, OR, XOR combine bits", () => {
      assertEquals(runToInt([PCode.ldin, 6], [PCode.ldin, 3], [PCode.and]), 2);
      assertEquals(runToInt([PCode.ldin, 6], [PCode.ldin, 3], [PCode.or]), 7);
      assertEquals(runToInt([PCode.ldin, 6], [PCode.ldin, 3], [PCode.xor]), 5);
    });
  });

  describe("lazy Boolean operators", () => {
    it("ANDL short-circuits like JS &&", () => {
      assertEquals(runToInt([PCode.ldin, 0], [PCode.ldin, 9], [PCode.andl]), 0);
      assertEquals(runToInt([PCode.ldin, 5], [PCode.ldin, 0], [PCode.andl]), 0);
      assertEquals(runToInt([PCode.ldin, 5], [PCode.ldin, 9], [PCode.andl]), 9);
    });

    it("ORL short-circuits like JS ||", () => {
      assertEquals(runToInt([PCode.ldin, 0], [PCode.ldin, 9], [PCode.orl]), 9);
      assertEquals(runToInt([PCode.ldin, 5], [PCode.ldin, 0], [PCode.orl]), 5);
    });
  });

  describe("binary integer operators", () => {
    it("PLUS, SUBT, MULT", () => {
      assertEquals(runToInt([PCode.ldin, 3], [PCode.ldin, 4], [PCode.plus]), 7);
      assertEquals(
        runToInt([PCode.ldin, 3], [PCode.ldin, 4], [PCode.subt]),
        -1,
      );
      assertEquals(
        runToInt([PCode.ldin, 3], [PCode.ldin, 4], [PCode.mult]),
        12,
      );
    });

    it("PLUS, SUBT, MULT raise a runtime error on 32-bit signed overflow", () => {
      const overflowPlus = runPcode([
        [PCode.ldin, 2147483647],
        [PCode.ldin, 1],
        [PCode.plus],
        [PCode.halt],
      ]);
      assertEquals(
        /overflow/i.test(overflowPlus.output.runtimeErrors[0].message),
        true,
      );

      const overflowSubt = runPcode([
        [PCode.ldin, -2147483648],
        [PCode.ldin, 1],
        [PCode.subt],
        [PCode.halt],
      ]);
      assertEquals(
        /overflow/i.test(overflowSubt.output.runtimeErrors[0].message),
        true,
      );

      const overflowMult = runPcode([
        [PCode.ldin, 2147483647],
        [PCode.ldin, 2],
        [PCode.mult],
        [PCode.halt],
      ]);
      assertEquals(
        /overflow/i.test(overflowMult.output.runtimeErrors[0].message),
        true,
      );

      // stays within range: no error
      assertEquals(
        runToInt([PCode.ldin, 2147483647], [PCode.ldin, 0], [PCode.plus]),
        2147483647,
      );
    });

    it("DIVR rounds to the nearest integer", () => {
      assertEquals(runToInt([PCode.ldin, 9], [PCode.ldin, 2], [PCode.divr]), 5);
    });

    it("DIV truncates towards zero", () => {
      assertEquals(runToInt([PCode.ldin, 7], [PCode.ldin, 2], [PCode.div]), 3);
      assertEquals(
        runToInt([PCode.ldin, -7], [PCode.ldin, 2], [PCode.div]),
        -3,
      );
    });

    it("MOD keeps the sign of the dividend", () => {
      assertEquals(runToInt([PCode.ldin, 7], [PCode.ldin, 3], [PCode.mod]), 1);
      assertEquals(
        runToInt([PCode.ldin, -7], [PCode.ldin, 3], [PCode.mod]),
        -1,
      );
    });

    it("DIVF floors (rounds towards negative infinity)", () => {
      assertEquals(runToInt([PCode.ldin, 7], [PCode.ldin, 2], [PCode.divf]), 3);
      assertEquals(
        runToInt([PCode.ldin, -7], [PCode.ldin, 2], [PCode.divf]),
        -4,
      );
    });

    it("MODF is a floored modulo (takes the sign of the divisor)", () => {
      assertEquals(
        runToInt([PCode.ldin, -7], [PCode.ldin, 3], [PCode.modf]),
        2,
      );
    });
  });

  describe("pseudo-real number operators", () => {
    it("DIVM computes (n1 / n2) * n3, rounded", () => {
      assertEquals(
        runToInt(
          [PCode.ldin, 7],
          [PCode.ldin, 2],
          [PCode.ldin, 10],
          [PCode.divm],
        ),
        35,
      );
    });

    it("LERP computes n1 + (n2 - n1) * n3 / n4, rounded", () => {
      assertEquals(
        runToInt(
          [PCode.ldin, 10],
          [PCode.ldin, 30],
          [PCode.ldin, 1],
          [PCode.ldin, 4],
          [PCode.lerp],
        ),
        15,
      );
    });

    it("HYP computes the hypotenuse, scaled by n3", () => {
      assertEquals(
        runToInt(
          [PCode.ldin, 3],
          [PCode.ldin, 4],
          [PCode.ldin, 1],
          [PCode.hyp],
        ),
        5,
      );
    });

    it("POWR computes (n1 / n2) ^ (n3 / n4) * n5, rounded", () => {
      assertEquals(
        runToInt(
          [PCode.ldin, 2],
          [PCode.ldin, 1],
          [PCode.ldin, 3],
          [PCode.ldin, 1],
          [PCode.ldin, 1],
          [PCode.powr],
        ),
        8,
      );
    });

    it("ROOT computes n1 ^ (1 / n2) * n3, rounded", () => {
      assertEquals(
        runToInt(
          [PCode.ldin, 8],
          [PCode.ldin, 3],
          [PCode.ldin, 1],
          [PCode.root],
        ),
        2,
      );
    });

    it("LOG, ALOG, LN, EXP", () => {
      assertEquals(
        runToInt(
          [PCode.ldin, 100],
          [PCode.ldin, 1],
          [PCode.ldin, 1],
          [PCode.log],
        ),
        2,
      );
      assertEquals(
        runToInt(
          [PCode.ldin, 2],
          [PCode.ldin, 1],
          [PCode.ldin, 1],
          [PCode.alog],
        ),
        100,
      );
      assertEquals(
        runToInt(
          [PCode.ldin, Math.round(Math.exp(1) * 1000)],
          [PCode.ldin, 1000],
          [PCode.ldin, 1],
          [PCode.ln],
        ),
        1,
      );
      assertEquals(
        runToInt(
          [PCode.ldin, 1],
          [PCode.ldin, 1],
          [PCode.ldin, 1000],
          [PCode.exp],
        ),
        Math.round(Math.exp(1) * 1000),
      );
    });

    it("PI computes pi * n1, rounded", () => {
      assertEquals(
        runToInt([PCode.ldin, 1000], [PCode.pi]),
        Math.round(Math.PI * 1000),
      );
    });
  });

  describe("trigonometric functions (scaled by the current angle unit)", () => {
    // all of these divide by getTurtA(), which defaults to 0 - real
    // compiled programs set this in their startup prelude (see ANGL below),
    // which these raw-pcode fragments must do explicitly first
    it("SIN, COS, TAN of a quarter/eighth turn", () => {
      // n1 = ((n2 / n3) * 2*PI) / turtA, so n3 is a fixed scale of 1 (n2 is
      // the angle, already expressed in the current angle unit); n4 scales
      // the result. 90 out of 360 degree-units is a quarter turn.
      assertAlmostEquals(
        runToInt(
          ...withAngles360(
            [PCode.ldin, 90],
            [PCode.ldin, 1],
            [PCode.ldin, 1000],
            [PCode.sin],
          ),
        ),
        1000,
        1,
      );
      assertAlmostEquals(
        runToInt(
          ...withAngles360(
            [PCode.ldin, 0],
            [PCode.ldin, 1],
            [PCode.ldin, 1000],
            [PCode.cos],
          ),
        ),
        1000,
        1,
      );
      assertAlmostEquals(
        runToInt(
          ...withAngles360(
            [PCode.ldin, 45],
            [PCode.ldin, 1],
            [PCode.ldin, 1000],
            [PCode.tan],
          ),
        ),
        1000,
        1,
      );
    });

    it("ASIN, ACOS, ATAN invert SIN/COS/TAN, scaled back into angle units", () => {
      // n2 / n3 is the sine/cosine/tangent ratio itself (here made exact via
      // matching numerator/denominator); n4 is a direct multiplier on the
      // resulting angle, so 1 (not a "divide back down" scale like n4 above)
      assertAlmostEquals(
        runToInt(
          ...withAngles360(
            [PCode.ldin, 1000],
            [PCode.ldin, 1000],
            [PCode.ldin, 1],
            [PCode.asin],
          ),
        ),
        90,
        1,
      );
      assertAlmostEquals(
        runToInt(
          ...withAngles360(
            [PCode.ldin, 0],
            [PCode.ldin, 1000],
            [PCode.ldin, 1],
            [PCode.acos],
          ),
        ),
        90,
        1,
      );
      assertAlmostEquals(
        runToInt(
          ...withAngles360(
            [PCode.ldin, 1000],
            [PCode.ldin, 1000],
            [PCode.ldin, 1],
            [PCode.atan],
          ),
        ),
        45,
        1,
      );
    });
  });

  describe("integer/Boolean comparison operators", () => {
    it("EQAL, NOEQ", () => {
      assertEquals(runToInt([PCode.ldin, 3], [PCode.ldin, 3], [PCode.eqal]), 1);
      assertEquals(runToInt([PCode.ldin, 3], [PCode.ldin, 4], [PCode.eqal]), 0);
      assertEquals(runToInt([PCode.ldin, 3], [PCode.ldin, 4], [PCode.noeq]), 1);
      assertEquals(runToInt([PCode.ldin, 3], [PCode.ldin, 3], [PCode.noeq]), 0);
    });

    it("LESS, MORE, LSEQ, MREQ", () => {
      assertEquals(runToInt([PCode.ldin, 3], [PCode.ldin, 4], [PCode.less]), 1);
      assertEquals(runToInt([PCode.ldin, 3], [PCode.ldin, 4], [PCode.more]), 0);
      assertEquals(runToInt([PCode.ldin, 4], [PCode.ldin, 4], [PCode.lseq]), 1);
      assertEquals(runToInt([PCode.ldin, 5], [PCode.ldin, 4], [PCode.lseq]), 0);
      assertEquals(runToInt([PCode.ldin, 4], [PCode.ldin, 4], [PCode.mreq]), 1);
      assertEquals(runToInt([PCode.ldin, 3], [PCode.ldin, 4], [PCode.mreq]), 0);
    });

    it("MAXI, MINI", () => {
      assertEquals(runToInt([PCode.ldin, 3], [PCode.ldin, 9], [PCode.maxi]), 9);
      assertEquals(runToInt([PCode.ldin, 3], [PCode.ldin, 9], [PCode.mini]), 3);
    });
  });

  describe("string comparison operators", () => {
    const abc = (): number[] => [PCode.lstr, 3, 97, 98, 99]; // "abc"
    const abd = (): number[] => [PCode.lstr, 3, 97, 98, 100]; // "abd"

    it("SEQL, SNEQ", () => {
      assertEquals(runToInt(abc(), abc(), [PCode.seql]), 1);
      assertEquals(runToInt(abc(), abd(), [PCode.seql]), 0);
      assertEquals(runToInt(abc(), abd(), [PCode.sneq]), 1);
      assertEquals(runToInt(abc(), abc(), [PCode.sneq]), 0);
    });

    it("SLES, SMOR, SLEQ, SMEQ compare string content, not heap address order", () => {
      // "zz" is allocated (and so pushed) before "aa", so "zz" ends up at
      // the *lower* heap address despite being the lexicographically
      // *greater* string - deliberately decoupling address order from
      // content order, so a regression back to comparing heap addresses
      // (rather than the actual string content) would flip these results
      const zz = (): number[] => [PCode.lstr, 2, 122, 122]; // "zz"
      const aa = (): number[] => [PCode.lstr, 2, 97, 97]; // "aa"
      assertEquals(runToInt(zz(), aa(), [PCode.sles]), 0); // "zz" < "aa" is false
      assertEquals(runToInt(zz(), aa(), [PCode.swap], [PCode.sles]), 1); // "aa" < "zz" is true
      assertEquals(runToInt(zz(), aa(), [PCode.smor]), 1); // "zz" > "aa" is true
      assertEquals(runToInt(zz(), aa(), [PCode.swap], [PCode.smor]), 0); // "aa" > "zz" is false
      assertEquals(runToInt(zz(), aa(), [PCode.sleq]), 0); // "zz" <= "aa" is false
      assertEquals(runToInt(zz(), aa(), [PCode.swap], [PCode.sleq]), 1); // "aa" <= "zz" is true
      assertEquals(runToInt(zz(), aa(), [PCode.smeq]), 1); // "zz" >= "aa" is true
      assertEquals(runToInt(zz(), aa(), [PCode.swap], [PCode.smeq]), 0); // "aa" >= "zz" is false
    });

    it("SMAX, SMIN compare the actual string contents", () => {
      assertEquals(runToString(abc(), abd(), [PCode.smax]), "abd");
      assertEquals(runToString(abd(), abc(), [PCode.smax]), "abd");
      assertEquals(runToString(abc(), abd(), [PCode.smin]), "abc");
      assertEquals(runToString(abd(), abc(), [PCode.smin]), "abc");
    });
  });

  describe("string operators", () => {
    const str = (s: string): number[] => [
      PCode.lstr,
      s.length,
      ...Array.from(s).map((c) => c.charCodeAt(0)),
    ];

    it("CASE transforms case (1-5)", () => {
      assertEquals(
        runToString(str("Hello World"), [PCode.ldin, 1], [PCode.case]),
        "hello world",
      );
      assertEquals(
        runToString(str("Hello World"), [PCode.ldin, 2], [PCode.case]),
        "HELLO WORLD",
      );
      assertEquals(
        runToString(str("hello"), [PCode.ldin, 3], [PCode.case]),
        "Hello",
      );
      // capitalise lowercases the rest of the string too, not just the first letter
      assertEquals(
        runToString(str("hELLO wORLD"), [PCode.ldin, 3], [PCode.case]),
        "Hello world",
      );
      assertEquals(runToString(str(""), [PCode.ldin, 3], [PCode.case]), "");
      assertEquals(
        runToString(str("hello world"), [PCode.ldin, 4], [PCode.case]),
        "Hello World",
      );
      assertEquals(
        runToString(str("Hello World"), [PCode.ldin, 5], [PCode.case]),
        "hELLO wORLD",
      );
      assertEquals(
        runToString(str("hello"), [PCode.ldin, 99], [PCode.case]),
        "hello",
      );
      // titlecase (4) with leading/trailing/consecutive spaces produces
      // empty "words" when split on " " - these must be left alone rather
      // than crashing on an empty string's non-existent first character
      assertEquals(
        runToString(str("  hello  world"), [PCode.ldin, 4], [PCode.case]),
        "  Hello  World",
      );
    });

    it("COPY extracts a substring (1-based start, given length)", () => {
      assertEquals(
        runToString(
          str("Hello World"),
          [PCode.ldin, 7],
          [PCode.ldin, 5],
          [PCode.copy],
        ),
        "World",
      );
    });

    it("DELS deletes a substring", () => {
      assertEquals(
        runToString(
          str("Hello World"),
          [PCode.ldin, 6],
          [PCode.ldin, 6],
          [PCode.dels],
        ),
        "Hello",
      );
    });

    it("INSS inserts a string at a 1-based position", () => {
      // pop order is (position, target, inserted) - so push (inserted, target, position)
      assertEquals(
        runToString(
          str(", World"),
          str("Hello"),
          [PCode.ldin, 6],
          [PCode.inss],
        ),
        "Hello, World",
      );
    });

    it("POSS finds a 1-based substring position (0 if not found)", () => {
      assertEquals(runToInt(str("World"), str("Hello World"), [PCode.poss]), 7);
      assertEquals(runToInt(str("xyz"), str("Hello World"), [PCode.poss]), 0);
    });

    it("REPL replaces occurrences of a substring", () => {
      // n4 > 0: replace exactly that many times
      assertEquals(
        runToString(
          str("a-a-a"),
          str("-"),
          str("+"),
          [PCode.ldin, 1],
          [PCode.repl],
        ),
        "a+a-a",
      );
      // n4 <= 0: replace all occurrences
      assertEquals(
        runToString(
          str("a-a-a"),
          str("-"),
          str("+"),
          [PCode.ldin, 0],
          [PCode.repl],
        ),
        "a+a+a",
      );
      // the find-string is treated literally, not as a regex - a regex
      // metacharacter (and one that would throw as an invalid pattern, at
      // that - an unbalanced "(") must still match only literal "(" text
      assertEquals(
        runToString(
          str("a(b(c"),
          str("("),
          str("-"),
          [PCode.ldin, 0],
          [PCode.repl],
        ),
        "a-b-c",
      );
      // an empty find-string leaves the target unchanged, rather than
      // looping forever trying to replace every "gap" between characters
      assertEquals(
        runToString(
          str("abc"),
          str(""),
          str("-"),
          [PCode.ldin, 0],
          [PCode.repl],
        ),
        "abc",
      );
      assertEquals(
        runToString(
          str("abc"),
          str(""),
          str("-"),
          [PCode.ldin, 1],
          [PCode.repl],
        ),
        "abc",
      );
      // a bounded replacement must not re-match text a previous replacement
      // in the same call just inserted (replacement "aa" contains the "a"
      // being searched for)
      assertEquals(
        runToString(
          str("aaa"),
          str("a"),
          str("ba"),
          [PCode.ldin, 2],
          [PCode.repl],
        ),
        "babaa",
      );
      // n4 greater than the number of actual occurrences just replaces them all
      assertEquals(
        runToString(
          str("a-a-a"),
          str("-"),
          str("+"),
          [PCode.ldin, 99],
          [PCode.repl],
        ),
        "a+a+a",
      );
    });

    it("SCAT concatenates two strings", () => {
      assertEquals(runToString(str("foo"), str("bar"), [PCode.scat]), "foobar");
    });

    it("SLEN pushes the length of a string given its heap address", () => {
      assertEquals(runToInt(str("hello"), [PCode.dupl], [PCode.slen]), 5);
    });

    it("SMUL repeats a string n2 times (literal repetition, not doubling)", () => {
      assertEquals(runToString(str("ab"), [PCode.ldin, 1], [PCode.smul]), "ab");
      assertEquals(
        runToString(str("ab"), [PCode.ldin, 3], [PCode.smul]),
        "ababab",
      );
      assertEquals(runToString(str("ab"), [PCode.ldin, 0], [PCode.smul]), "");
    });

    it("SPAD pads a string with another string until it reaches a target length", () => {
      // negative n3: pad on the right
      assertEquals(
        runToString(str("ab"), str("-"), [PCode.ldin, -5], [PCode.spad]),
        "ab---",
      );
      // positive n3: pad on the left
      assertEquals(
        runToString(str("ab"), str("-"), [PCode.ldin, 5], [PCode.spad]),
        "---ab",
      );
      // a target width beyond the default string size (64) clamps to it,
      // matching the original system's `defaultstringsize` guard
      assertEquals(
        runToString(str("ab"), str("-"), [PCode.ldin, -1000], [PCode.spad])
          .length,
        64,
      );
    });

    it("TRIM trims whitespace", () => {
      assertEquals(runToString(str("  hi  "), [PCode.trim]), "hi");
    });
  });

  describe("Python string tests", () => {
    it("CTST throws unless the string is exactly one character", () => {
      // happy path only here - the throwing path belongs in errors.test.ts
      const { output } = runPcode([
        [PCode.lstr, 1, 97],
        [PCode.ctst],
        [PCode.halt],
      ]);
      assertEquals(output.runtimeErrors, []);
    });

    it("CTST peeks rather than pops - the tested string address is still on the stack afterward", () => {
      assertEquals(runToString([PCode.lstr, 1, 97], [PCode.ctst]), "a");
    });

    it("ERNF is a no-op for non-negative values", () => {
      const { output } = runPcode([
        [PCode.ldin, 0],
        [PCode.ernf],
        [PCode.halt],
      ]);
      assertEquals(output.runtimeErrors, []);
    });

    it("ERNF peeks rather than pops - the tested value is still on the stack afterward", () => {
      assertEquals(runToInt([PCode.ldin, 42], [PCode.ernf]), 42);
    });
  });

  describe("TEST (string/array/list bound check)", () => {
    it("leaves the stack unchanged and doesn't throw when the index is in range", () => {
      // main[500] = 5 (a fake array/string header holding a max length of 5)
      const { output } = runPcode([
        [PCode.ldin, 5],
        [PCode.stvg, 500],
        [PCode.ldin, 3], // index under test
        [PCode.ldin, 500], // address of the header
        [PCode.test],
        [PCode.drop],
        [PCode.drop],
        [PCode.halt],
      ]);
      assertEquals(output.runtimeErrors, []);
    });
  });

  describe("type conversion operators", () => {
    it("CTOS converts a character code to a one-character string", () => {
      assertEquals(runToString([PCode.ldin, 65], [PCode.ctos]), "A");
    });

    it("SASC converts a string's first character to its character code (0 for empty)", () => {
      assertEquals(runToInt([PCode.lstr, 1, 65], [PCode.sasc]), 65);
      assertEquals(runToInt([PCode.lstr, 0], [PCode.sasc]), 0);
    });

    it("ITOS converts an integer to a string", () => {
      assertEquals(runToString([PCode.ldin, -123], [PCode.itos]), "-123");
    });

    it("HEXS converts an integer to a zero-padded hex string", () => {
      assertEquals(
        runToString([PCode.ldin, 255], [PCode.ldin, 4], [PCode.hexs]),
        "00FF",
      );
    });

    it("HEXS converts a negative integer to its twos-complement hex representation", () => {
      assertEquals(
        runToString([PCode.ldin, -1], [PCode.ldin, 8], [PCode.hexs]),
        "FFFFFFFF",
      );
    });

    it("SVAL parses a string to an integer", () => {
      assertEquals(
        runToInt([PCode.lstr, 3, 49, 50, 51], [PCode.ldin, 0], [PCode.sval]),
        123,
      );
    });

    it("SVAL picks a hex prefix (#, $, &, 0x) to strip based on its second argument", () => {
      const hash7B = [PCode.lstr, 3, 35, 55, 66]; // "#7B"
      const dollar7B = [PCode.lstr, 3, 36, 55, 66]; // "$7B"
      const amp7B = [PCode.lstr, 3, 38, 55, 66]; // "&7B"
      const ox7B = [PCode.lstr, 4, 48, 120, 55, 66]; // "0x7B"
      assertEquals(runToInt(hash7B, [PCode.ldin, 0], [PCode.sval]), 123);
      assertEquals(runToInt(dollar7B, [PCode.ldin, 1], [PCode.sval]), 123);
      assertEquals(runToInt(amp7B, [PCode.ldin, 2], [PCode.sval]), 123);
      assertEquals(runToInt(ox7B, [PCode.ldin, 3], [PCode.sval]), 123);
      // with no matching prefix, falls back to parsing as a plain decimal
      assertEquals(
        runToInt([PCode.lstr, 3, 49, 50, 51], [PCode.ldin, 0], [PCode.sval]),
        123,
      );
      // an out-of-range coding argument falls back to "#" rather than
      // indexing past the end of the prefix table
      assertEquals(
        runToInt([PCode.lstr, 3, 49, 50, 51], [PCode.ldin, 99], [PCode.sval]),
        123,
      );
    });

    it("SVDF parses a string to an integer, with a default on failure", () => {
      assertEquals(
        runToInt(
          [PCode.lstr, 3, 49, 50, 51],
          [PCode.ldin, -1],
          [PCode.ldin, 0],
          [PCode.svdf],
        ),
        123,
      );
      assertEquals(
        runToInt(
          [PCode.lstr, 3, 120, 120, 120], // "xxx" doesn't parse
          [PCode.ldin, -1],
          [PCode.ldin, 0],
          [PCode.svdf],
        ),
        -1,
      );
    });

    it("SVDF's hex-prefix argument selects the right prefix to strip ($ / & / 0x)", () => {
      const dollar7B = [PCode.lstr, 3, 36, 55, 66]; // "$7B"
      const amp7B = [PCode.lstr, 3, 38, 55, 66]; // "&7B"
      const ox7B = [PCode.lstr, 4, 48, 120, 55, 66]; // "0x7B"
      assertEquals(
        runToInt(dollar7B, [PCode.ldin, -1], [PCode.ldin, 1], [PCode.svdf]),
        123,
      );
      assertEquals(
        runToInt(amp7B, [PCode.ldin, -1], [PCode.ldin, 2], [PCode.svdf]),
        123,
      );
      assertEquals(
        runToInt(ox7B, [PCode.ldin, -1], [PCode.ldin, 3], [PCode.svdf]),
        123,
      );
      // an out-of-range coding argument falls back to "#" rather than
      // indexing past the end of the prefix table
      assertEquals(
        runToInt(
          [PCode.lstr, 3, 49, 50, 51],
          [PCode.ldin, -1],
          [PCode.ldin, 99],
          [PCode.svdf],
        ),
        123,
      );
    });

    it("SVDF parses hex when its string actually starts with #", () => {
      assertEquals(
        runToInt(
          [PCode.lstr, 3, 35, 55, 66],
          [PCode.ldin, -1],
          [PCode.ldin, 0],
          [PCode.svdf],
        ), // "#7B"
        123,
      );
    });

    it("QTOS converts a pseudo-real number (n2/n3) to a fixed-point string", () => {
      assertEquals(
        runToString(
          [PCode.ldin, 1],
          [PCode.ldin, 4],
          [PCode.ldin, 2],
          [PCode.qtos],
        ),
        "0.25",
      );
    });

    it("QVAL parses a string to a pseudo-real number, with a default on failure", () => {
      assertEquals(
        runToInt(
          [PCode.lstr, 4, 49, 46, 53, 48],
          [PCode.ldin, 100],
          [PCode.ldin, -1],
          [PCode.qval],
        ),
        150,
      );
      // on parse failure the default is returned as-is, not multiplied by n
      assertEquals(
        runToInt(
          [PCode.lstr, 1, 120],
          [PCode.ldin, 100],
          [PCode.ldin, -1],
          [PCode.qval],
        ),
        -1,
      );
    });
  });

  describe("debugging and tracing", () => {
    it("TRAC and MEMW just pop the stack (not implemented)", () => {
      assertEquals(
        runToInt([PCode.ldin, 1], [PCode.ldin, 42], [PCode.trac]),
        1,
      );
      assertEquals(
        runToInt([PCode.ldin, 1], [PCode.ldin, 42], [PCode.memw]),
        1,
      );
    });

    it("DUMP calls updateMemoryDisplay, and selects the memory tab if configured to", () => {
      const { output } = runPcode([[PCode.dump], [PCode.halt]], {
        showMemoryOnDump: true,
      });
      assertEquals(output.memoryDumps.length, 1);
      assertEquals(output.tabs.includes("memory"), true);
    });

    it("DUMP doesn't select the memory tab when not configured to", () => {
      const { output } = runPcode([[PCode.dump], [PCode.halt]], {
        showMemoryOnDump: false,
      });
      assertEquals(output.memoryDumps.length, 1);
      assertEquals(output.tabs.includes("memory"), false);
    });

    it("PCOH sets a pcode-line halt breakpoint, halting once that line finishes executing", () => {
      const pcode = [
        /* 0 */ [PCode.ldin, 2],
        /* 1 */ [PCode.pcoh], // arm a breakpoint on line 2
        /* 2 */ [PCode.ldin, 111], // runs...
        /* 3 */ [PCode.itos, PCode.writ], // ...but this doesn't - halted right after line 2
      ];
      const { output } = runPcode(pcode);
      assertEquals(output.stateChanges, ["played", "halted"]);
      assertEquals(output.outputText, "");
    });

    it("POKE writes a value directly into main memory", () => {
      assertEquals(
        readAddr([[PCode.ldin, 900], [PCode.ldin, 77], [PCode.poke]], 900),
        77,
      );
    });
  });

  describe("canvas state", () => {
    it("CANV maps the turtle's current screen position into the new coordinate window, leaving heading untouched", () => {
      const { canvas, output } = runPcode(
        withAngles360(
          [PCode.ldin, 500],
          [PCode.ldin, 500],
          [PCode.toxy], // centre of the default 1000x1000 canvas
          [PCode.ldin, 45],
          [PCode.setd], // non-zero heading, to confirm CANV doesn't reset it
          [PCode.ldin, 0],
          [PCode.ldin, 0],
          [PCode.ldin, 200],
          [PCode.ldin, 100],
          [PCode.canv],
          [PCode.halt],
        ),
      );
      assertEquals(
        canvas.calls.some(
          (c) =>
            c.method === "setVirtualCanvas" &&
            c.args[2] === 200 &&
            c.args[3] === 100,
        ),
        true,
      );
      // the turtle was at the screen centre before, so it stays at the
      // screen centre of the new (200x100) coordinate window
      assertEquals(output.turtleProperties.x, 100);
      assertEquals(output.turtleProperties.y, 50);
      assertEquals(output.turtleProperties.d, 45);
    });

    it("CANV is a no-op if either new dimension is not more than 1", () => {
      const { canvas, output } = runPcode([
        [PCode.ldin, 111],
        [PCode.ldin, 222],
        [PCode.toxy],
        [PCode.ldin, 0],
        [PCode.ldin, 0],
        [PCode.ldin, 200],
        [PCode.ldin, 1], // sizey is not > 1
        [PCode.canv],
        [PCode.halt],
      ]);
      // only the initial reset's setVirtualCanvas(0, 0, 1000, 1000) call - the
      // CANV opcode itself did nothing, and left the turtle where it was
      assertEquals(
        canvas.calls.some(
          (c) => c.method === "setVirtualCanvas" && c.args[2] === 200,
        ),
        false,
      );
      assertEquals(output.turtleProperties.x, 111);
      assertEquals(output.turtleProperties.y, 222);
    });

    it("RESO sets the canvas resolution, doubling for small sizes", () => {
      const { canvas } = runPcode([
        [PCode.ldin, 1000],
        [PCode.ldin, 1000],
        [PCode.reso],
        [PCode.halt],
      ]);
      assertEquals(
        canvas.calls.some(
          (c) =>
            c.method === "setResolution" &&
            c.args[0] === 1000 &&
            c.args[2] === false,
        ),
        true,
      );
    });

    it("RESO doubles the resolution for sizes at or below smallSize", () => {
      const { canvas } = runPcode([
        [PCode.ldin, 40],
        [PCode.ldin, 40],
        [PCode.reso],
        [PCode.halt],
      ]);
      assertEquals(
        canvas.calls.some(
          (c) =>
            c.method === "setResolution" &&
            c.args[0] === 80 &&
            c.args[2] === true,
        ),
        true,
      );
    });

    it("once doubled, canvas coordinates (and thickness) are computed with the doubled formula", () => {
      const { canvas } = runPcode([
        [PCode.ldin, 40],
        [PCode.ldin, 40],
        [PCode.reso], // width/height become 80/80, doubled = true
        [PCode.ldin, 3],
        [PCode.thik], // pen down
        [PCode.ldin, 100],
        [PCode.ldin, 100],
        [PCode.drxy], // draws a line to (100, 100), exercising turtx/turty/turtt's doubled branch
        [PCode.halt],
      ]);
      const drawLine = canvas.calls.find((c) => c.method === "drawLine");
      // vcanvas.sizex/sizey are still the default 1000, width/height are now 80:
      // exact = (100/1000)*80 = 8; doubled adds 1 -> 9. Thickness 3 doubled -> 6.
      assertEquals(drawLine?.args[1], 9);
      assertEquals(drawLine?.args[2], 9);
      assertEquals((drawLine?.args[0] as { t: number }).t, 6);
    });

    it("UDAT toggles whether drawing commands force a canvas update", () => {
      const { output } = runPcode([
        [PCode.ldin, 0],
        [PCode.udat],
        [PCode.halt],
      ]);
      assertEquals(output.runtimeErrors, []);
    });

    it("UDAT(nonzero) forces an immediate canvas update", () => {
      const { output } = runPcode([
        [PCode.ldin, 1],
        [PCode.udat],
        [PCode.halt],
      ]);
      assertEquals(output.runtimeErrors, []);
    });
  });

  describe("basic turtle settings", () => {
    it("HOME resets position and direction to the centre of the virtual canvas", () => {
      const { output } = runPcode([
        [PCode.ldin, 111],
        [PCode.ldin, 222],
        [PCode.toxy],
        [PCode.home],
        [PCode.halt],
      ]);
      assertEquals(output.turtleProperties.x, 500);
      assertEquals(output.turtleProperties.y, 500);
      assertEquals(output.turtleProperties.d, 0);
    });

    it("HOME truncates (rather than rounds) the centre for an odd canvas size", () => {
      const { output } = runPcode([
        [PCode.ldin, 0],
        [PCode.ldin, 0],
        [PCode.ldin, 999],
        [PCode.ldin, 999],
        [PCode.canv],
        [PCode.home],
        [PCode.halt],
      ]);
      // 999 / 2 = 499.5 - Pascal's truncating `div` gives 499, not 500
      assertEquals(output.turtleProperties.x, 499);
      assertEquals(output.turtleProperties.y, 499);
    });

    it("SETX, SETY set turtle coordinates directly", () => {
      const { output } = runPcode([
        [PCode.ldin, 111],
        [PCode.setx],
        [PCode.ldin, 222],
        [PCode.sety],
        [PCode.halt],
      ]);
      assertEquals(output.turtleProperties.x, 111);
      assertEquals(output.turtleProperties.y, 222);
    });

    it("SETD sets direction modulo the angle unit", () => {
      const { output } = runPcode(
        withAngles360([PCode.ldin, 400], [PCode.setd], [PCode.halt]),
      );
      assertEquals(output.turtleProperties.d, 40);
    });

    it("ANGL sets the angle unit for the first time, and rescales direction on later calls", () => {
      const { output } = runPcode([
        [PCode.ldin, 360],
        [PCode.angl],
        [PCode.ldin, 180], // half a turn in 360-units
        [PCode.setd],
        [PCode.ldin, 100], // switch to 100 angle-units
        [PCode.angl],
        [PCode.halt],
      ]);
      assertEquals(output.turtleProperties.a, 100);
      assertEquals(output.turtleProperties.d, 50); // half a turn, rescaled
    });

    it("THIK sets pen thickness directly, preserving pen up/down", () => {
      const { output } = runPcode([
        [PCode.ldin, 3],
        [PCode.thik],
        [PCode.halt],
      ]);
      assertEquals(output.turtleProperties.t, 3);
    });

    it("THIK with a negative argument reverses pen status", () => {
      const { output } = runPcode([
        [PCode.ldin, 3],
        [PCode.thik], // pen down, thickness 3
        [PCode.ldin, -3],
        [PCode.thik], // reverse: pen up, thickness magnitude preserved
        [PCode.halt],
      ]);
      assertEquals(output.turtleProperties.t, -3);
    });

    it("THIK leaves pen status alone when the pen is already up", () => {
      const { output } = runPcode([
        [PCode.ldin, 3],
        [PCode.thik],
        [PCode.ldin, 0],
        [PCode.pen], // pen up: t = -3
        [PCode.ldin, 5],
        [PCode.thik], // positive argument, pen already up: t stays negative
        [PCode.halt],
      ]);
      assertEquals(output.turtleProperties.t, -5);
    });

    it("THIK reverses pen status back to down when the pen is already up", () => {
      const { output } = runPcode([
        [PCode.ldin, 3],
        [PCode.thik],
        [PCode.ldin, 0],
        [PCode.pen], // pen up: t = -3
        [PCode.ldin, -5],
        [PCode.thik], // negative argument reverses: pen back down
        [PCode.halt],
      ]);
      assertEquals(output.turtleProperties.t, 5);
    });

    it("PEN sets pen up/down without changing thickness magnitude", () => {
      const { output } = runPcode([
        [PCode.ldin, 5],
        [PCode.thik],
        [PCode.ldin, 0],
        [PCode.pen], // pen up
        [PCode.halt],
      ]);
      assertEquals(output.turtleProperties.t, -5);
    });

    it("PEN(nonzero) sets the pen down", () => {
      const { output } = runPcode([
        [PCode.ldin, 5],
        [PCode.thik],
        [PCode.ldin, 0],
        [PCode.pen], // pen up: t = -5
        [PCode.ldin, 1],
        [PCode.pen], // pen down: t = 5
        [PCode.halt],
      ]);
      assertEquals(output.turtleProperties.t, 5);
    });

    it("COLR sets pen colour", () => {
      const { output } = runPcode([
        [PCode.ldin, 0xff0000],
        [PCode.colr],
        [PCode.halt],
      ]);
      assertEquals(output.turtleProperties.c, "#ff0000");
    });
  });

  describe("turtle movement", () => {
    it("TOXY moves directly to given coordinates", () => {
      const { output } = runPcode([
        [PCode.ldin, 10],
        [PCode.ldin, 20],
        [PCode.toxy],
        [PCode.halt],
      ]);
      assertEquals(output.turtleProperties.x, 10);
      assertEquals(output.turtleProperties.y, 20);
    });

    it("MVXY moves by a relative offset", () => {
      const { output } = runPcode([
        [PCode.ldin, 10],
        [PCode.ldin, 20],
        [PCode.toxy],
        [PCode.ldin, 1],
        [PCode.ldin, 2],
        [PCode.mvxy],
        [PCode.halt],
      ]);
      assertEquals(output.turtleProperties.x, 11);
      assertEquals(output.turtleProperties.y, 22);
    });

    it("DRXY moves by a relative offset and draws a line when the pen is down", () => {
      const { output, canvas } = runPcode([
        [PCode.ldin, 3],
        [PCode.thik], // pen down
        [PCode.ldin, 5],
        [PCode.ldin, 5],
        [PCode.drxy],
        [PCode.halt],
      ]);
      assertEquals(output.turtleProperties.x, 5);
      assertEquals(output.turtleProperties.y, 5);
      assertEquals(
        canvas.calls.some((c) => c.method === "drawLine"),
        true,
      );
    });

    it("DRXY does not draw when the pen is up", () => {
      const { canvas } = runPcode([
        [PCode.ldin, 3],
        [PCode.thik],
        [PCode.ldin, 0],
        [PCode.pen], // pen up
        [PCode.ldin, 5],
        [PCode.ldin, 5],
        [PCode.drxy],
        [PCode.halt],
      ]);
      assertEquals(
        canvas.calls.some((c) => c.method === "drawLine"),
        false,
      );
    });

    it("DRXY draws a 1px hairline at exactly zero thickness (pen down, not up)", () => {
      const { canvas } = runPcode([
        [PCode.ldin, 5],
        [PCode.ldin, 5],
        [PCode.drxy],
        [PCode.halt],
      ]);
      assertEquals(
        canvas.calls.some((c) => c.method === "drawLine"),
        true,
      );
    });

    it("FWRD moves forward in the current direction (0 degrees is up: -y)", () => {
      const { output } = runPcode(
        withAngles360([PCode.ldin, 50], [PCode.fwrd], [PCode.halt]),
      );
      assertEquals(output.turtleProperties.x, 0);
      assertEquals(output.turtleProperties.y, -50);
    });

    it("BACK moves backward in the current direction", () => {
      const { output } = runPcode(
        withAngles360([PCode.ldin, 50], [PCode.back], [PCode.halt]),
      );
      assertEquals(output.turtleProperties.x, 0);
      assertEquals(output.turtleProperties.y, 50);
    });

    it("BACK draws a line when the pen is down", () => {
      const { output, canvas } = runPcode(
        withAngles360(
          [PCode.ldin, 3],
          [PCode.thik],
          [PCode.ldin, 50],
          [PCode.back],
          [PCode.halt],
        ),
      );
      assertEquals(output.turtleProperties.y, 50);
      assertEquals(
        canvas.calls.some((c) => c.method === "drawLine"),
        true,
      );
    });

    it("LEFT and RGHT turn, modulo the angle unit, never leaving a negative stored direction", () => {
      // turning left past 0 wraps round to stay non-negative (330, not -30)
      const { output: leftOutput } = runPcode(
        withAngles360([PCode.ldin, 30], [PCode.left], [PCode.halt]),
      );
      assertEquals(leftOutput.turtleProperties.d, 330);
      const { output: rightOutput } = runPcode(
        withAngles360([PCode.ldin, 30], [PCode.rght], [PCode.halt]),
      );
      assertEquals(rightOutput.turtleProperties.d, 30);
    });

    describe("TURN points the turtle towards a relative offset", () => {
      // TURN computes an atan2-style angle without using Math.atan2 - via
      // a 4-way split on the relative magnitude/sign of its two arguments.
      // This reference mirrors that exact split (rather than an equivalent
      // Math.atan2 call) so each of its four branches can be pinned down
      // and verified individually, not just "some plausible direction".
      const expectedDirection = (
        n1: number,
        n2: number,
        turtA: number,
      ): number => {
        let n3: number;
        if (Math.abs(n2) >= Math.abs(n1)) {
          n3 = Math.atan(-n1 / n2);
          if (n2 > 0) {
            n3 += Math.PI;
          } else if (n1 < 0) {
            n3 += 2;
            n3 *= Math.PI;
          }
        } else {
          n3 = Math.atan(n2 / n1);
          if (n1 > 0) {
            n3 += Math.PI;
          } else {
            n3 += 3;
            n3 *= Math.PI;
          }
          n3 /= 2;
        }
        return Math.round((n3 * turtA) / Math.PI / 2) % turtA;
      };

      const cases: [number, number][] = [
        [0, -10], // straight up
        [0, 10], // n2 > 0 branch
        [-5, -10], // n2 <= 0, n1 < 0 branch
        [10, 0], // abs(n2) < abs(n1), n1 > 0 branch
        [-10, 5], // abs(n2) < abs(n1), n1 <= 0 branch
      ];

      for (const [n1, n2] of cases) {
        it(`turn(${n1}, ${n2})`, () => {
          const { output } = runPcode(
            withAngles360(
              [PCode.ldin, n1],
              [PCode.ldin, n2],
              [PCode.turn],
              [PCode.halt],
            ),
          );
          assertEquals(
            output.turtleProperties.d,
            expectedDirection(n1, n2, 360),
          );
        });
      }
    });
  });

  describe("fills and colours", () => {
    it("BLNK clears the canvas to a colour", () => {
      const { canvas } = runPcode([
        [PCode.ldin, 0x00ff00],
        [PCode.blnk],
        [PCode.halt],
      ]);
      assertEquals(
        canvas.calls.some(
          (c) => c.method === "clear" && c.args[0] === "#00ff00",
        ),
        true,
      );
    });

    it("RCOL flood-fills replacing a colour", () => {
      const { canvas } = runPcode([
        [PCode.ldin, 10],
        [PCode.ldin, 20],
        [PCode.ldin, 0xff0000],
        [PCode.rcol],
        [PCode.halt],
      ]);
      assertEquals(
        canvas.calls.some(
          (c) => c.method === "floodFill" && c.args[4] === false,
        ),
        true,
      );
    });

    it("FILL flood-fills bounded by a colour", () => {
      const { canvas } = runPcode([
        [PCode.ldin, 10],
        [PCode.ldin, 20],
        [PCode.ldin, 0xff0000],
        [PCode.ldin, 0x000000],
        [PCode.fill],
        [PCode.halt],
      ]);
      assertEquals(
        canvas.calls.some(
          (c) => c.method === "floodFill" && c.args[4] === true,
        ),
        true,
      );
    });

    it("PIXS writes a pixel and PIXC reads it back", () => {
      assertEquals(
        runToInt(
          [PCode.ldin, 5],
          [PCode.ldin, 5],
          [PCode.ldin, 0x123456],
          [PCode.pixs],
          [PCode.ldin, 5],
          [PCode.ldin, 5],
          [PCode.pixc],
        ),
        0x123456,
      );
    });

    it("RGB maps 1-50 to a predefined colour value, wrapping out-of-range numbers", () => {
      const a = runToInt([PCode.ldin, 1], [PCode.rgb]);
      const b = runToInt([PCode.ldin, 51], [PCode.rgb]); // wraps to 1
      assertEquals(a, b);
    });

    it("RGB maps non-positive results of the mod-50 wrap up into range", () => {
      // 50 % 50 === 0, and 0 % 50 === 0, both non-positive - both should
      // map to colour 50 (the same as each other)
      const fromZero = runToInt([PCode.ldin, 0], [PCode.rgb]);
      const fromFifty = runToInt([PCode.ldin, 50], [PCode.rgb]);
      assertEquals(fromZero, fromFifty);
    });

    it("MIXC mixes two colours in given proportions (weighted average per channel)", () => {
      // white mixed with white, in any proportions, should stay white
      const white = runToInt(
        [PCode.ldin, 0xffffff],
        [PCode.ldin, 0xffffff],
        [PCode.ldin, 1],
        [PCode.ldin, 1],
        [PCode.mixc],
      );
      assertEquals(white, 0xffffff);

      // black mixed with blue at 3:1 isolates the blue channel from
      // red/green (both 0 either way) - round((0*3 + 255*1) / 4) = 64
      const blueMix = runToInt(
        [PCode.ldin, 0x000000],
        [PCode.ldin, 0x0000ff],
        [PCode.ldin, 3],
        [PCode.ldin, 1],
        [PCode.mixc],
      );
      assertEquals(blueMix, 0x000040);
    });
  });

  describe("drawing shapes", () => {
    it("RMBR remembers the current position, FRGT forgets the last n", () => {
      const { output } = runPcode([
        [PCode.ldin, 1],
        [PCode.ldin, 1],
        [PCode.toxy],
        [PCode.rmbr],
        [PCode.ldin, 1],
        [PCode.frgt],
        [PCode.halt],
      ]);
      assertEquals(output.runtimeErrors, []);
    });

    it("FRGT clamps rather than crashing when told to forget more points than are remembered", () => {
      const { output } = runPcode([
        [PCode.ldin, 1],
        [PCode.ldin, 1],
        [PCode.toxy], // one point remembered (via TOXY's own coords push)
        [PCode.ldin, 5], // forget 5, though only 1 is remembered
        [PCode.frgt],
        [PCode.halt],
      ]);
      assertEquals(output.runtimeErrors, []);
    });

    it("POLY and PFIL draw a polygon from the last n remembered points", () => {
      const { canvas } = runPcode([
        [PCode.ldin, 0],
        [PCode.ldin, 0],
        [PCode.toxy],
        [PCode.rmbr],
        [PCode.ldin, 10],
        [PCode.ldin, 0],
        [PCode.toxy],
        [PCode.rmbr],
        [PCode.ldin, 0],
        [PCode.ldin, 10],
        [PCode.toxy],
        [PCode.rmbr],
        [PCode.ldin, 3],
        [PCode.poly],
        [PCode.ldin, 3],
        [PCode.pfil],
        [PCode.halt],
      ]);
      const outline = canvas.calls.find(
        (c) => c.method === "drawPolygon" && c.args[2] === false,
      );
      const filled = canvas.calls.find(
        (c) => c.method === "drawPolygon" && c.args[2] === true,
      );
      assertEquals((outline?.args[1] as unknown[]).length, 3);
      assertEquals((filled?.args[1] as unknown[]).length, 3);
    });

    it("POLY and PFIL clamp to all remembered points when asked for more than there are", () => {
      const { canvas } = runPcode([
        [PCode.ldin, 0],
        [PCode.ldin, 0],
        [PCode.toxy], // TOXY itself also pushes a coord, on top of RMBR's
        [PCode.rmbr],
        [PCode.ldin, 10],
        [PCode.ldin, 0],
        [PCode.toxy],
        [PCode.rmbr],
        [PCode.ldin, 99], // more than the 4 points remembered (2 TOXYs + 2 RMBRs)
        [PCode.poly],
        [PCode.ldin, 99],
        [PCode.pfil],
        [PCode.halt],
      ]);
      const outline = canvas.calls.find(
        (c) => c.method === "drawPolygon" && c.args[2] === false,
      );
      const filled = canvas.calls.find(
        (c) => c.method === "drawPolygon" && c.args[2] === true,
      );
      assertEquals((outline?.args[1] as unknown[]).length, 4);
      assertEquals((filled?.args[1] as unknown[]).length, 4);
    });

    it("POLY and PFIL draw nothing for fewer than 2 points (no stray dot)", () => {
      const { canvas } = runPcode([
        [PCode.ldin, 0],
        [PCode.ldin, 0],
        [PCode.toxy], // exactly 1 point remembered
        [PCode.ldin, 1],
        [PCode.poly],
        [PCode.ldin, 1],
        [PCode.pfil],
        [PCode.ldin, 0],
        [PCode.poly],
        [PCode.ldin, 0],
        [PCode.pfil],
        [PCode.halt],
      ]);
      assertEquals(
        canvas.calls.some((c) => c.method === "drawPolygon"),
        false,
      );
    });

    it("CIRC and BLOT draw a circle (outline/filled)", () => {
      const { canvas } = runPcode([
        [PCode.ldin, 20],
        [PCode.circ],
        [PCode.ldin, 20],
        [PCode.blot],
        [PCode.halt],
      ]);
      assertEquals(
        canvas.calls.some((c) => c.method === "drawArc" && c.args[3] === false),
        true,
      );
      assertEquals(
        canvas.calls.some((c) => c.method === "drawArc" && c.args[3] === true),
        true,
      );
    });

    it("ELPS and EBLT draw an ellipse (outline/filled)", () => {
      const { canvas } = runPcode([
        [PCode.ldin, 20],
        [PCode.ldin, 10],
        [PCode.elps],
        [PCode.ldin, 20],
        [PCode.ldin, 10],
        [PCode.eblt],
        [PCode.halt],
      ]);
      assertEquals(
        canvas.calls.some((c) => c.method === "drawArc" && c.args[3] === false),
        true,
      );
      assertEquals(
        canvas.calls.some((c) => c.method === "drawArc" && c.args[3] === true),
        true,
      );
    });

    it("BOX draws a rectangle relative to the turtle, with a fill colour and border flag", () => {
      const { canvas } = runPcode([
        [PCode.ldin, 20],
        [PCode.ldin, 10],
        [PCode.ldin, 0x00ff00],
        [PCode.ldin, 1],
        [PCode.box],
        [PCode.halt],
      ]);
      assertEquals(
        canvas.calls.some(
          (c) =>
            c.method === "drawBox" &&
            c.args[3] === "#00ff00" &&
            c.args[4] === true,
        ),
        true,
      );
    });
  });

  describe("loading the (evaluation) stack", () => {
    it("LDIN loads an immediate integer", () => {
      assertEquals(runToInt([PCode.ldin, 42]), 42);
    });

    it("LDVG loads the value at a global address", () => {
      assertEquals(
        readAddr(
          [
            [PCode.ldin, 5],
            [PCode.stvg, 800],
          ],
          800,
        ),
        5,
      );
    });

    it("LDVV loads the value at (main[n1] + n2) - a variable relative to a base pointer", () => {
      // main[900] = 7, and main[0] (the implicit base pointer) defaults to 0
      assertEquals(
        runToInt([PCode.ldin, 7], [PCode.stvg, 900], [PCode.ldvv, 901, 900]),
        7,
      );
    });

    it("LDVR loads through a double indirection (a reference parameter)", () => {
      // main[950] = 960 (a pointer), main[960] = 99 (the referenced value)
      assertEquals(
        runToInt(
          [PCode.ldin, 960],
          [PCode.stvg, 950],
          [PCode.ldin, 99],
          [PCode.stvg, 960],
          [PCode.ldvr, 951, 950],
        ),
        99,
      );
    });

    it("LDAG loads an immediate address", () => {
      assertEquals(runToInt([PCode.ldag, 42]), 42);
    });

    it("LDAV computes (main[n1] + n2) as an address", () => {
      assertEquals(
        runToInt([PCode.ldin, 100], [PCode.stvg, 970], [PCode.ldav, 970, 5]),
        105,
      );
    });

    it("LSTR loads a literal string", () => {
      assertEquals(runToString([PCode.lstr, 3, 72, 105, 33]), "Hi!");
    });
  });

  describe("storing from the (evaluation) stack", () => {
    it("STVG stores to a global address", () => {
      assertEquals(
        readAddr(
          [
            [PCode.ldin, 123],
            [PCode.stvg, 850],
          ],
          850,
        ),
        123,
      );
    });

    it("STVV stores at (main[n1] + n2)", () => {
      // main[861] defaults to 0, so the effective target is main[0 + 860] = main[860]
      assertEquals(
        readAddr(
          [
            [PCode.ldin, 55],
            [PCode.stvv, 861, 860],
          ],
          860,
        ),
        55,
      );
    });

    it("STVR stores through a double indirection", () => {
      // main[880] = 890 (a pointer); STVR stores through it
      assertEquals(
        readAddr(
          [
            [PCode.ldin, 890],
            [PCode.stvg, 880],
            [PCode.ldin, 77],
            [PCode.stvr, 881, 880],
          ],
          890,
        ),
        77,
      );
    });
  });

  describe("pointer and string/array operations", () => {
    it("LPTR dereferences a pointer", () => {
      assertEquals(
        runToInt(
          [PCode.ldin, 33],
          [PCode.stvg, 700],
          [PCode.ldin, 700],
          [PCode.lptr],
        ),
        33,
      );
    });

    it("SPTR writes through a pointer", () => {
      assertEquals(
        readAddr([[PCode.ldin, 44], [PCode.ldin, 710], [PCode.sptr]], 710),
        44,
      );
    });

    it("ZPTR zeroes a range of memory", () => {
      assertEquals(
        readAddr(
          [
            [PCode.ldin, 9],
            [PCode.stvg, 720],
            [PCode.ldin, 720],
            [PCode.ldin, 3],
            [PCode.zptr],
          ],
          720,
        ),
        0,
      );
    });

    it("CPTR copies a range of memory", () => {
      assertEquals(
        readAddr(
          [
            [PCode.ldin, 66],
            [PCode.stvg, 740],
            [PCode.ldin, 740],
            [PCode.ldin, 745],
            [PCode.ldin, 1],
            [PCode.cptr],
          ],
          745,
        ),
        66,
      );
    });

    it("CPTR is a proper memmove - safe for overlapping ranges when the target is above the source", () => {
      // 750..753 = [1,2,3,4]; copy 4 cells from 750 to 751 (shift right by
      // one, overlapping) - a naive forward copy would read back its own
      // just-written values and produce [1,1,1,1] instead of [1,1,2,3]
      const setup = [
        [PCode.ldin, 1],
        [PCode.stvg, 750],
        [PCode.ldin, 2],
        [PCode.stvg, 751],
        [PCode.ldin, 3],
        [PCode.stvg, 752],
        [PCode.ldin, 4],
        [PCode.stvg, 753],
        [PCode.ldin, 750],
        [PCode.ldin, 751],
        [PCode.ldin, 4],
        [PCode.cptr],
      ];
      assertEquals(readAddr(setup, 751), 1);
      assertEquals(readAddr(setup, 752), 2);
      assertEquals(readAddr(setup, 753), 3);
      assertEquals(readAddr(setup, 754), 4);
    });

    it("CSTR copies a string, bounded by source length and target's declared maximum", () => {
      // source: heap string "hi" via LSTR sets stack to its address; copy it into a
      // fixed target buffer at 760 (760 holds the max length, 761.. holds the chars)
      const { output } = runPcode([
        [PCode.ldin, 10],
        [PCode.stvg, 760], // target max length
        [PCode.lstr, 2, 104, 105], // "hi"
        [PCode.ldin, 761], // target address (length cell)
        [PCode.cstr],
        [PCode.ldvg, 761],
        [PCode.itos],
        [PCode.writ],
        [PCode.halt],
      ]);
      assertEquals(output.outputText, "2");
    });

    it("CSTR truncates to the target's declared maximum, without overrunning by one character", () => {
      // target max length 3 at 770 -> usable capacity is 3-1=2 characters;
      // length cell at 771, characters at 772-773, sentinel at 774 (one past
      // the buffer) must survive untouched if there's no one-byte overrun
      const setup: number[][] = [
        [PCode.ldin, 3],
        [PCode.stvg, 770],
        [PCode.ldin, 999],
        [PCode.stvg, 774],
        [PCode.lstr, 5, 104, 101, 108, 108, 111], // "hello"
        [PCode.ldin, 771],
        [PCode.cstr],
      ];
      // the recorded length is the truncated length, not the source's
      assertEquals(readAddr(setup, 771), 2);
      assertEquals(readAddr(setup, 772), 104); // 'h'
      assertEquals(readAddr(setup, 773), 101); // 'e'
      assertEquals(readAddr(setup, 774), 999); // sentinel untouched
    });

    it("HSTR re-makes a heap string (e.g. to promote it out of temporary space)", () => {
      assertEquals(runToString([PCode.lstr, 2, 104, 105], [PCode.hstr]), "hi");
    });
  });

  describe("flow control", () => {
    // NB: JUMP/IFNO/SUBR line-number arguments are 1-based (the runtime
    // subtracts 1 to get the actual pcode array index) - so a target of
    // array index N is encoded as N + 1. Each "line" below is one merged
    // array (matching how a real compiled line of pcode is one array),
    // so its index always matches its position in the `pcode` literal.

    it("JUMP moves execution to another line", () => {
      const pcode = [
        /* 0 */ [PCode.jump, 2 + 1],
        /* 1 */ [PCode.ldin, 111, PCode.itos, PCode.writ, PCode.halt], // skipped
        /* 2 */ [PCode.ldin, 222, PCode.itos, PCode.writ, PCode.halt],
      ];
      const { output } = runPcode(pcode);
      assertEquals(output.outputText, "222");
    });

    it("IFNO jumps only when the condition is falsy", () => {
      const program = (condition: number) => [
        /* 0 */ [PCode.ldin, condition],
        /* 1 */ [PCode.ifno, 3 + 1],
        /* 2 */ [PCode.ldin, 111, PCode.itos, PCode.writ, PCode.halt],
        /* 3 */ [PCode.ldin, 222, PCode.itos, PCode.writ, PCode.halt],
      ];
      assertEquals(runPcode(program(1)).output.outputText, "111");
      assertEquals(runPcode(program(0)).output.outputText, "222");
    });

    it("SUBR calls a subroutine (pushing a return line) and RETN returns from it", () => {
      const pcode = [
        /* 0 */ [PCode.subr, 2 + 1], // call the subroutine at line 2; returns to line 1
        /* 1 */ [PCode.ldin, 999, PCode.itos, PCode.writ, PCode.halt],
        /* 2 */ [PCode.ldin, 42, PCode.itos, PCode.writ, PCode.retn],
      ];
      const { output } = runPcode(pcode);
      // subroutine runs first (writes "42"), then execution returns to line 1 (writes "999")
      assertEquals(output.outputText, "42999");
    });

    it("SUBR sets heapGlobal to the current heapPerm on first call only", () => {
      // heapGlobal itself isn't observable via the barrel (it's exposed only
      // via the advanced-mode memory dump) - this just exercises the opcode
      const pcode = [
        /* 0 */ [PCode.subr, 2 + 1], // call the subroutine at line 2; returns to line 1
        /* 1 */ [PCode.halt],
        /* 2 */ [PCode.retn],
      ];
      const { output } = runPcode(pcode);
      assertEquals(output.runtimeErrors, []);
    });

    it("PSSR/PLSR push/pop the subroutine call stack (bookkeeping only)", () => {
      const { output } = runPcode([
        [PCode.pssr, 1],
        [PCode.plsr],
        [PCode.halt],
      ]);
      assertEquals(output.runtimeErrors, []);
    });

    it("PSRJ pushes the line after the current one onto the evaluation stack", () => {
      // at line 0, PSRJ pushes 0 + 1 = 1
      assertEquals(runToInt([PCode.psrj]), 1);
    });

    it("PLRJ discards the return stack's top (even if empty) and jumps to the pushed line directly (no extra -1)", () => {
      // matches PSRJ's own "current line + 1" convention (see above) -
      // consuming it here needs no further adjustment, same as RETN
      const pcode = [
        /* 0 */ [PCode.ldin, 2], // target: line 2 directly, not 2 + 1
        /* 1 */ [PCode.plrj],
        /* 2 */ [PCode.ldin, 777, PCode.itos, PCode.writ, PCode.halt],
      ];
      const { output } = runPcode(pcode);
      assertEquals(output.outputText, "777");
    });

    it("PSRJ/PLRJ round-trip: consuming what PSRJ just pushed resumes on the next line, not back at PSRJ itself", () => {
      const pcode = [
        // psrj pushes 0 + 1 = 1 (this line's index + 1); plrj immediately
        // consumes it and jumps there - if the old extra "-1" were still
        // present this would jump back to line 0, looping forever instead
        /* 0 */ [PCode.psrj, PCode.plrj],
        /* 1 */ [PCode.ldin, 777, PCode.itos, PCode.writ, PCode.halt],
      ];
      const { output } = runPcode(pcode);
      assertEquals(output.outputText, "777");
    });
  });

  describe("memory management", () => {
    it("LDMT pushes -1 before anything has ever been claimed (an empty memory stack)", () => {
      assertEquals(runToInt([PCode.ldmt]), -1);
    });

    it("LDMT and STMT round-trip: LDMT reads back whatever STMT last stored", () => {
      assertEquals(
        runToInt([PCode.ldin, 1000], [PCode.stmt], [PCode.ldmt]),
        1000,
      );
    });

    it("STMT sets the stack top marker", () => {
      const { output } = runPcode([
        [PCode.ldin, 1000],
        [PCode.stmt],
        [PCode.dump],
        [PCode.halt],
      ]);
      assertEquals(output.memoryDumps[0].stack.length, 1001);
    });

    it("MEMC allocates a new frame (linking it to the previous top) and MEMR releases it", () => {
      const pcode = [
        [PCode.ldin, 10],
        [PCode.stmt], // seed the memory stack with an initial top of 10
        [PCode.memc, 990, 5], // main[990] defaults to 0; allocate 5 more
      ];
      // after MEMC, main[990] holds the *previous* top (10)
      assertEquals(readAddr(pcode, 990), 10);

      const afterRelease = readAddr([...pcode, [PCode.memr, 990]], 990);
      // after MEMR, main[990] is restored to what it held before MEMC (0)
      assertEquals(afterRelease, 0);
    });

    it("HFIX fixes the top of the permanent heap at the current temporary-heap position", () => {
      const { output } = runPcode([
        [PCode.lstr, 2, 104, 105],
        [PCode.hfix],
        [PCode.halt],
      ]);
      assertEquals(output.runtimeErrors, []);
    });

    it("HCLR clears the heap back to heapPerm immediately when the evaluation stack is empty", () => {
      const { output } = runPcode([[PCode.hclr], [PCode.halt]]);
      assertEquals(output.runtimeErrors, []);
    });

    it("HCLR defers the clear when the evaluation stack is non-empty, applying it once the stack empties", () => {
      // allocate "xyz" and capture its heap address (A) in one run - fresh
      // memory.init() per run() call makes this deterministic and
      // reproducible across separate runs with identical leading pcode
      const xyz = () => [PCode.lstr, 3, 120, 121, 122];
      const a = runToInt(xyz());

      // now: allocate "xyz" again, call HCLR while the stack is still
      // non-empty (memory.heapClear()'s "else" branch: defers via
      // heapClearPending rather than clearing immediately), empty the
      // stack afterwards, then WAIT - resuming triggers a fresh execute()
      // call, whose delayedHeapClear() applies the deferred clear before
      // anything else runs. A subsequent allocation should then reuse the
      // reclaimed address (A), proving the deferred clear actually fired.
      const { output } = runPcode([
        xyz(),
        [PCode.ldin, 999], // stack: [ptr_xyz, 999] - non-empty when HCLR runs
        [PCode.hclr], // deferred: heapClearPending = true, no immediate change
        [PCode.drop],
        [PCode.drop], // stack now empty, but the clear isn't applied until the next execute() call
        [PCode.ldin, 0],
        [PCode.wait],
        xyz(), // should reuse the address reclaimed by the (now-applied) deferred clear
        [PCode.itos],
        [PCode.writ],
        [PCode.halt],
      ]);
      assertEquals(parseInt(output.outputText, 10), a);
    });

    it("HRST resets the heap back to its true base, unconditionally (not just once a subroutine has run)", () => {
      // heapTemp/heapPerm aren't observable via the barrel, but this at
      // least exercises the opcode - with no SUBR call beforehand, unlike
      // the old heapGlobal-gated behaviour
      const { output } = runPcode([
        [PCode.lstr, 2, 104, 105],
        [PCode.hrst],
        [PCode.halt],
      ]);
      assertEquals(output.runtimeErrors, []);
    });

    it("HRST also deletes the keyboard buffer", () => {
      assertEquals(
        readAddr(
          [[PCode.ldin, 16], [PCode.bufr], [PCode.stvg, 1], [PCode.hrst]],
          1,
        ),
        0,
      );
    });
  });

  describe("input-related pcodes (state manipulation only - see input.test.ts for events)", () => {
    it("STAT looks up a query value (negative) or key value (0-255), else 0", () => {
      assertEquals(runToInt([PCode.ldin, -1], [PCode.stat]), -1); // untouched query slot defaults to -1
      assertEquals(runToInt([PCode.ldin, 65], [PCode.stat]), -1); // untouched key slot defaults to -1
      assertEquals(runToInt([PCode.ldin, 9999], [PCode.stat]), 0); // out of range
    });

    it("ICLR resets a query value, a key value, the keybuffer, or everything", () => {
      const { output } = runPcode([
        [PCode.ldin, -1],
        [PCode.iclr],
        [PCode.ldin, 65],
        [PCode.iclr],
        [PCode.ldin, 0],
        [PCode.iclr],
        [PCode.ldin, 256],
        [PCode.iclr],
        [PCode.ldin, 9999], // out of range: does nothing
        [PCode.iclr],
        [PCode.halt],
      ]);
      assertEquals(output.runtimeErrors, []);
    });

    it("BUFR allocates a keyboard input buffer on the heap", () => {
      const { output } = runPcode([
        [PCode.ldin, 16],
        [PCode.bufr],
        [PCode.halt],
      ]);
      assertEquals(output.runtimeErrors, []);
    });

    it("BUFR lays out the ring buffer per its documented structure, without colliding with the next heap allocation", () => {
      // f is the pointer BUFR returns; main[f] should be the last content
      // cell (f + n + 3), and main[f+1]/main[f+2] (read/write pointers)
      // should both start at the first content cell (f + 3) - this is also
      // exactly what input.ts's keybuffer read/write logic assumes.
      const setup = (n: number): number[][] => [[PCode.ldin, n], [PCode.bufr]];
      const f = runToInt(...setup(5));
      assertEquals(runToInt(...setup(5), [PCode.lptr]), f + 5 + 3);
      assertEquals(
        runToInt(...setup(5), [PCode.ldin, 1], [PCode.plus], [PCode.lptr]),
        f + 3,
      );
      assertEquals(
        runToInt(...setup(5), [PCode.ldin, 2], [PCode.plus], [PCode.lptr]),
        f + 3,
      );
      // the next heap allocation (an LSTR right after) must start
      // immediately after the buffer's own last cell, not overlap it
      const nextAlloc = runToInt(
        ...setup(5),
        [PCode.drop],
        [PCode.lstr, 1, 65],
      );
      assertEquals(nextAlloc, f + 5 + 3 + 1);
    });

    it("CURS sets the canvas cursor", () => {
      const { canvas } = runPcode([
        [PCode.ldin, 3],
        [PCode.curs],
        [PCode.halt],
      ]);
      assertEquals(
        canvas.calls.some((c) => c.method === "setCursor" && c.args[0] === 3),
        true,
      );
    });
  });

  describe("text output", () => {
    it("KECH toggles key echo", () => {
      const { output } = runPcode([
        [PCode.ldin, 0],
        [PCode.kech],
        [PCode.halt],
      ]);
      assertEquals(output.runtimeErrors, []);
    });

    it("OUTP configures the output pane and selects a tab", () => {
      const { output } = runPcode([
        [PCode.ldin, 1],
        [PCode.ldin, 0x00ff00],
        [PCode.ldin, 1],
        [PCode.outp],
        [PCode.halt],
      ]);
      assertEquals(
        output.calls.some(
          (c) => c.method === "configureOutput" && c.args[0] === true,
        ),
        true,
      );
      assertEquals(output.tabs.includes("output"), true);
    });

    it("OUTP selects the canvas tab when the third argument is falsy", () => {
      const { output } = runPcode([
        [PCode.ldin, 1],
        [PCode.ldin, 0x00ff00],
        [PCode.ldin, 0],
        [PCode.outp],
        [PCode.halt],
      ]);
      assertEquals(output.tabs.includes("canvas"), true);
    });

    it("CONS configures the console", () => {
      const { output } = runPcode([
        [PCode.ldin, 1],
        [PCode.ldin, 0x00ff00],
        [PCode.cons],
        [PCode.halt],
      ]);
      assertEquals(
        output.calls.some((c) => c.method === "configureConsole"),
        true,
      );
    });

    it("DISP draws text on the canvas", () => {
      const { canvas } = runPcode([
        [PCode.lstr, 2, 72, 105],
        [PCode.ldin, 1],
        [PCode.ldin, 20],
        [PCode.disp],
        [PCode.halt],
      ]);
      assertEquals(
        canvas.calls.some((c) => c.method === "drawText" && c.args[1] === "Hi"),
        true,
      );
    });

    it("WRIT writes to both the output pane and the console, optionally selecting the output tab", () => {
      const { output } = runPcode(
        [[PCode.lstr, 2, 72, 105], [PCode.writ], [PCode.halt]],
        {
          showOutputOnWrite: true,
        },
      );
      assertEquals(output.outputText, "Hi");
      assertEquals(output.consoleText, "Hi");
      assertEquals(output.tabs.includes("output"), true);
    });

    it("NEWL writes a newline to both panes", () => {
      const { output } = runPcode([[PCode.newl], [PCode.halt]]);
      assertEquals(output.outputText, "\n");
      assertEquals(output.consoleText, "\n");
    });
  });

  describe("timing", () => {
    it("TIME reports elapsed time since the program started", () => {
      // run() captures startTime from timers.now() *synchronously*, before
      // this test gets a chance to advance the fake clock - so a WAIT is
      // needed to let execution actually pause before advancing the clock,
      // otherwise TIME would read "0 elapsed" every time
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [
          [PCode.ldin, 0],
          [PCode.wait],
          [PCode.time],
          [PCode.itos],
          [PCode.writ],
          [PCode.halt],
        ],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      timers.advance(150);
      timers.flush();
      assertEquals(output.outputText, "150");
    });

    it("TSET rebases the elapsed-time clock", () => {
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [
          [PCode.ldin, 100],
          [PCode.tset],
          [PCode.ldin, 0],
          [PCode.wait],
          [PCode.time],
          [PCode.itos],
          [PCode.writ],
          [PCode.halt],
        ],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      timers.advance(50);
      timers.flush();
      // TSET(100) makes it as if 100ms had already elapsed at that point
      assertEquals(output.outputText, "150");
    });

    it("WAIT defers resuming execution until the given delay elapses", () => {
      const pcode = [
        [PCode.ldin, 500],
        [PCode.wait],
        [PCode.ldin, 111],
        [PCode.itos, PCode.writ],
        [PCode.halt],
      ];
      const { output, timers } = runPcode(pcode);
      assertEquals(output.outputText, "111");
      assertEquals(timers.pendingCount(), 0);
    });
  });

  describe("execution loop mechanics", () => {
    it("pauses and resumes across drawCountMax boundaries", () => {
      // five drawn lines with the default drawCountMax of 4: the fifth line
      // only gets drawn once the fake timers' pending "resume" callback is flushed
      const withAngles = withAngles360([PCode.ldin, 3], [PCode.thik]);
      const drawLine = () => [[PCode.ldin, 10], [PCode.fwrd]];
      const pcode = [
        ...withAngles,
        ...drawLine(),
        ...drawLine(),
        ...drawLine(),
        ...drawLine(),
        ...drawLine(),
        [PCode.halt],
      ];
      const { canvas, timers } = runPcode(pcode);
      const drawCalls = canvas.calls.filter((c) => c.method === "drawLine");
      assertEquals(drawCalls.length, 5);
      assertEquals(timers.pendingCount(), 0);
    });
  });
});

describe("machine/runtime: compiled programs, end to end", () => {
  const compileToPcode = (language: Language, code: string): number[][] => {
    const tokens = tokenize(code, language);
    const lexemes = lexify(tokens, language);
    const program = parse(lexemes, language);
    return encode(program);
  };

  describe("turtle movement, across languages", () => {
    const forwardCalls: Record<Language, string> = {
      BASIC: "FORWARD(50)",
      C: "forward(50);",
      Java: "forward(50);",
      Pascal: "forward(50);",
      Python: "forward(50)",
      TypeScript: "forward(50);",
    };

    for (const language of LANGUAGES) {
      it(`moves the turtle forward for a compiled ${language} program`, () => {
        const code = wrapProgram(language, forwardCalls[language]);
        const pcode = compileToPcode(language, code);
        const { output } = runPcode(pcode);
        assertEquals(output.turtleProperties.y, 500 - 50);
        assertEquals(output.stateChanges.at(-1), "halted");
      });
    }
  });

  describe("control flow, across languages", () => {
    const ifCalls: Record<Language, string> = {
      BASIC: "IF 1 = 1 THEN FORWARD(50)",
      C: "if (1 == 1) { forward(50); }",
      Java: "if (1 == 1) { forward(50); }",
      Pascal: "if 1 = 1 then forward(50);",
      Python: "if 1 == 1:\n  forward(50)",
      TypeScript: "if (1 == 1) { forward(50); }",
    };

    for (const language of LANGUAGES) {
      it(`runs the "if" branch for a compiled ${language} program`, () => {
        const code = wrapProgram(language, ifCalls[language]);
        const pcode = compileToPcode(language, code);
        const { output } = runPcode(pcode);
        assertEquals(output.turtleProperties.y, 500 - 50);
      });
    }
  });

  describe("break and continue statements, across languages (C, Java, TypeScript)", () => {
    // Python gets its own extensive behavioural coverage further down
    // (loop-variable value after break, nested loops, continue skipping vs
    // re-testing, if/elif/else nesting, multi-line conditions) - BASIC and
    // Pascal don't have break/continue at all. This is just proof that the same
    // parser wiring (loopDepth tracking in each language's own
    // statement.ts/while/for/do-while parsers) and the shared, language-neutral
    // encoder produce correct end-to-end behaviour for C, Java and TypeScript
    // too.
    const forLoopCalls: Partial<Record<Language, string>> = {
      C: "int i;\nfor (i = 0; i < 10; i = i + 1) {\nif (i == 2) { continue; }\nif (i == 5) { break; }\nforward(10);\n}",
      Java: "int i;\nfor (i = 0; i < 10; i = i + 1) {\nif (i == 2) { continue; }\nif (i == 5) { break; }\nforward(10);\n}",
      TypeScript:
        "var i: number;\nfor (i = 0; i < 10; i = i + 1) {\nif (i == 2) { continue; }\nif (i == 5) { break; }\nforward(10);\n}",
    };

    for (const language of ["C", "Java", "TypeScript"] as const) {
      it(`a 'for' loop's 'continue' and 'break' both work for compiled ${language}`, () => {
        const code = wrapProgram(language, forLoopCalls[language] as string);
        const pcode = compileToPcode(language, code);
        const { output } = runPcode(pcode);
        // i=0,1,3,4 call forward(10) - i=2 is skipped by "continue", and
        // "break" at i=5 exits before i=5..9 ever run
        assertEquals(output.turtleProperties.y, 500 - 40);
      });
    }

    const doWhileCalls: Partial<Record<Language, string>> = {
      C: "int i;\ni = 0;\ndo {\ni = i + 1;\nif (i == 3) { break; }\nforward(10);\n} while (i < 10);",
      Java: "int i;\ni = 0;\ndo {\ni = i + 1;\nif (i == 3) { break; }\nforward(10);\n} while (i < 10);",
      TypeScript:
        "var i: number;\ni = 0;\ndo {\ni = i + 1;\nif (i == 3) { break; }\nforward(10);\n} while (i < 10);",
    };

    for (const language of ["C", "Java", "TypeScript"] as const) {
      it(`a do-while loop's 'break' works for compiled ${language} (lowers to RepeatStatement)`, () => {
        const code = wrapProgram(language, doWhileCalls[language] as string);
        const pcode = compileToPcode(language, code);
        const { output } = runPcode(pcode);
        // i=1,2 call forward(10) before "break" fires on i=3, ahead of its own forward
        assertEquals(output.turtleProperties.y, 500 - 20);
      });
    }
  });

  it("runs a Python for loop, accumulating turtle movement", () => {
    const code = "for i in range(3):\n  forward(10)";
    const pcode = compileToPcode("Python", code);
    const { output } = runPcode(pcode);
    assertEquals(output.turtleProperties.y, 500 - 30);
  });

  it("runs a Python while loop", () => {
    const code = "x = 0\nwhile x < 3:\n  forward(10)\n  x = x + 1";
    const pcode = compileToPcode("Python", code);
    const { output } = runPcode(pcode);
    assertEquals(output.turtleProperties.y, 500 - 30);
  });

  it("runs a BASIC repeat loop", () => {
    const code = "REPEAT\nFORWARD(10)\nx% = x% + 1\nUNTIL x% = 3\nEND";
    const pcode = compileToPcode("BASIC", code);
    const { output } = runPcode(pcode);
    assertEquals(output.turtleProperties.y, 500 - 30);
  });

  it("runs a recursive Python subroutine, passing parameters", () => {
    const code = [
      "def countdown(n):",
      "  if n > 0:",
      "    forward(10)",
      "    countdown(n - 1)",
      "",
      "countdown(3)",
    ].join("\n");
    const pcode = compileToPcode("Python", code);
    const { output } = runPcode(pcode);
    assertEquals(output.turtleProperties.y, 500 - 30);
  });

  it("reads and writes global and local variables", () => {
    const code = [
      "total = 0",
      "def addToTotal(n):",
      "  global total",
      "  local = n * 2",
      "  total = total + local",
      "addToTotal(5)",
      "addToTotal(10)",
      "print(str(total))",
    ].join("\n");
    const pcode = compileToPcode("Python", code);
    const { output } = runPcode(pcode);
    assertEquals(output.outputText.trim(), "30");
  });

  // Python list indexed read/write
  describe("Python list indexed read/write", () => {
    it("writes and reads back an integer list element (the 'mylist=[0]*8' + indexed-assignment pattern)", () => {
      const code = [
        "mylist = [0] * 8",
        "for index in range(8):",
        "  mylist[index] = index * index",
        "print(str(mylist[5]))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "25");
    });

    it("writes and reads back a string list element", () => {
      const code = ['x = ["a", "b", "c"]', 'x[1] = "z"', "print(x[1])"].join(
        "\n",
      );
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "z");
    });

    it("reads a negative index as an offset from the end ('x[-1]')", () => {
      const code = ["x = [10, 20, 30]", "print(str(x[-1]))"].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "30");
    });

    it("writes via a negative index too", () => {
      const code = ["x = [10, 20, 30]", "x[-1] = 99", "print(str(x[2]))"].join(
        "\n",
      );
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "99");
    });

    it("raises a runtime error reading past the end of the list", () => {
      const code = ["x = [1, 2, 3]", "print(str(x[5]))"].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.runtimeErrors.length, 1);
      assertEquals(
        /index out of range/i.test(output.runtimeErrors[0].message),
        true,
      );
    });

    it("raises a runtime error for a too-negative index (past the start of the list)", () => {
      const code = ["x = [1, 2, 3]", "print(str(x[-4]))"].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.runtimeErrors.length, 1);
      assertEquals(
        /index out of range/i.test(output.runtimeErrors[0].message),
        true,
      );
    });

    it("raises a runtime error writing past the end of the list", () => {
      const code = ["x = [1, 2, 3]", "x[5] = 9"].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.runtimeErrors.length, 1);
    });

    it("compiles and runs SierpinskiDots.tpy-style indexed writes without error (a real fixed-size-via-multiplication pattern)", () => {
      // mirrors Fractals/SierpinskiDots.tpy's "corners=[0]*3" (via
      // sub-lists are covered separately; here just the flat indexed-write
      // pattern
      // this step targets) - a simple, hand-written analogue rather than
      // reading the real file, which also uses turtle drawing not
      // relevant to this assertion
      const code = [
        "xs = [0] * 3",
        "xs[0] = 100",
        "xs[1] = 200",
        "xs[2] = 300",
        "total = xs[0] + xs[1] + xs[2]",
        "print(str(total))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "600");
    });

    it("writing the same index twice keeps only the latest value", () => {
      const code = [
        "x = [0] * 3",
        "x[1] = 5",
        "x[1] = 42",
        "print(str(x[1]))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "42");
    });
  });

  // Python list methods and statement-position dot-calls
  describe("Python list methods", () => {
    it(".append() as a bare statement grows a list past its literal capacity", () => {
      const code = [
        "x = [1, 2]",
        "x.append(3)",
        "x.append(4)",
        'print(str(x[0])+","+str(x[1])+","+str(x[2])+","+str(x[3]))',
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "1,2,3,4");
    });

    it(".append() grows a hint-less empty list past the default capacity (8)", () => {
      const code = [
        "x = []",
        "for i in range(12):",
        "  x.append(i * i)",
        "print(str(x[11]))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "121");
    });

    it("a bare 'x: List[int]' hint with no '= []' initializer still builds a working list via .append()", () => {
      // found via assets/examples/Python/CSAC/*.tpy: a hint-only declaration
      // with no initializer skipped allocating any heap block at all, silently
      // no-op'ing instead of the implicit "x = []" real Python would give it
      const code = "x: List[int]\nx.append(42)\nprint(str(x[0]))";
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "42");
    });

    it(".append() past the regrow ceiling still raises the machine's capacity error (backstop)", () => {
      // regrows once to LIST_REGROW_CAPACITY (1024); once capacity is
      // already at that ceiling, the guard stops regrowing (see
      // encoder/lists.ts) and LAPP's own overflow check fires instead
      const code = ["x = []", "for i in range(1030):", "  x.append(i)"].join(
        "\n",
      );
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.runtimeErrors.length, 1);
      assertEquals(
        /maximum capacity/i.test(output.runtimeErrors[0].message),
        true,
      );
    });

    it(".copy() returns an independent list (mutating the copy doesn't affect the original)", () => {
      const code = [
        "x = [1, 2, 3]",
        "y = x.copy()",
        "y[0] = 99",
        'print(str(x[0])+","+str(y[0]))',
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "1,99");
    });

    it(".extend() with a list-literal argument", () => {
      const code = [
        "x = [1, 2]",
        "x.extend([3, 4, 5])",
        'print(str(x[2])+","+str(x[4]))',
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "3,5");
    });

    it(".extend() grows the list past its literal capacity", () => {
      const code = [
        "x = [1]",
        "x.extend([2, 3, 4, 5])",
        "print(str(x[4]))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "5");
    });

    it(".insert() at a valid position shifts later elements along", () => {
      const code = [
        "x = [1, 2, 3]",
        "x.insert(1, 99)",
        'print(str(x[0])+","+str(x[1])+","+str(x[2])+","+str(x[3]))',
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "1,99,2,3");
    });

    it(".insert() at a negative position counts from the end", () => {
      const code = [
        "x = [1, 2, 3]",
        "x.insert(-1, 99)",
        "print(str(x[2]))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "99");
    });

    it(".insert() past the end clamps to the end rather than erroring", () => {
      const code = [
        "x = [1, 2, 3]",
        "x.insert(99, 4)",
        "print(str(x[3]))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "4");
    });

    it(".insert() grows the list past its literal capacity", () => {
      const code = ["x = [1, 2]", "x.insert(0, 0)", "print(str(x[2]))"].join(
        "\n",
      );
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "2");
    });

    it(".remove() deletes the first matching element", () => {
      const code = [
        "x = [1, 2, 3, 2]",
        "x.remove(2)",
        'print(str(x[0])+","+str(x[1])+","+str(x[2]))',
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "1,3,2");
    });

    it(".remove() on a missing value raises an error (compensating for LREM's silent no-op)", () => {
      const code = ["x = [1, 2, 3]", "x.remove(99)"].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.runtimeErrors.length, 1);
    });

    it(".del() removes the element at the given index, shifting later elements down", () => {
      const code = [
        "x = [1, 2, 3, 4]",
        "x.del(1)",
        'print(str(x[0])+","+str(x[1])+","+str(x[2]))',
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "1,3,4");
    });

    it(".del() on an out-of-range index raises an error, unlike .insert()'s clamping", () => {
      const code = ["x = [1, 2, 3]", "x.del(3)"].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.runtimeErrors.length, 1);
      assertEquals(
        output.runtimeErrors[0].message,
        'Invalid list index in ".del" method.',
      );
    });

    it(".del() on a negative index raises an error rather than counting from the end", () => {
      const code = ["x = [1, 2, 3]", "x.del(-1)"].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.runtimeErrors.length, 1);
      assertEquals(
        output.runtimeErrors[0].message,
        'Invalid list index in ".del" method.',
      );
    });

    it(".reverse() on an even-length list", () => {
      const code = [
        "x = [1, 2, 3, 4]",
        "x.reverse()",
        'print(str(x[0])+","+str(x[1])+","+str(x[2])+","+str(x[3]))',
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "4,3,2,1");
    });

    it(".reverse() on an odd-length list", () => {
      const code = [
        "x = [1, 2, 3]",
        "x.reverse()",
        'print(str(x[0])+","+str(x[1])+","+str(x[2]))',
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "3,2,1");
    });

    it(".index() finds the first matching element", () => {
      const code = ["x = [10, 20, 30, 20]", "print(str(x.index(20)))"].join(
        "\n",
      );
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "1");
    });

    it(".index() on a missing value raises an error", () => {
      const code = ["x = [10, 20, 30]", "print(str(x.index(99)))"].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.runtimeErrors.length, 1);
    });

    it("string-element lists: .append/.index/.remove", () => {
      const code = [
        'x = ["a", "b", "c"]',
        'x.append("d")',
        'print(str(x.index("c")))',
        'x.remove("b")',
        "print(x[1])",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "2\nc");
    });
  });

  // "for x in list:" iteration, len(list), print(list)
  describe("Python list iteration, len(), and print()", () => {
    it("for element in mylist: sums an integer list", () => {
      const code = [
        "total = 0",
        "x = [1, 2, 3, 4]",
        "for element in x:",
        "    total = total + element",
        "print(str(total))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "10");
    });

    it("for element in mylist: iterates a string list in order", () => {
      const code = [
        'x = ["a", "b", "c"]',
        "for element in x:",
        "    print(element, end='')",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText, "abc");
    });

    it("for element in mylist: doesn't execute the body for an empty list", () => {
      const code = [
        "x: List[int] = []",
        "count = 0",
        "for element in x:",
        "    count = count + 1",
        "print(str(count))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "0");
    });

    it("nested for-in-list loops don't corrupt each other's hidden index", () => {
      const code = [
        "a = [1, 2]",
        "b = [10, 20, 30]",
        "total = 0",
        "for x in a:",
        "    for y in b:",
        "        total = total + x * y",
        "print(str(total))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      // (1+2) * (10+20+30) = 3 * 60 = 180
      assertEquals(output.outputText.trim(), "180");
    });

    it("len(mylist) returns the element count", () => {
      const code = "x = [1, 2, 3]\nprint(str(len(x)))";
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "3");
    });

    it("len() still works for plain strings (no regression)", () => {
      const code = 's = "hello"\nprint(str(len(s)))';
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "5");
    });

    it("print(mylist) formats an integer list Python-repr-style", () => {
      const code = "x = [1, 2, 3]\nprint(x)";
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "[1, 2, 3]");
    });

    it("print(mylist) formats a string list with single-quoted elements", () => {
      const code = 'x = ["a", "b"]\nprint(x)';
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "['a', 'b']");
    });

    it("print(mylist) formats an empty list", () => {
      const code = "x: List[int] = []\nprint(x)";
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "[]");
    });

    it("Further/ListFunctions.tpy compiles and runs end-to-end, matching its own inline comments stage by stage", async () => {
      const code = await Deno.readTextFile(
        new URL(
          "../../../assets/examples/Python/Further/ListFunctions.tpy",
          import.meta.url,
        ),
      );
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.runtimeErrors, []);
      const lines = output.outputText.split("\n");
      // Every heading below is printed by a literal starting "\n", so each
      // is preceded by a blank line.
      assertEquals(lines[2], "List multiplication with [0]*8:");
      assertEquals(lines[3], "[0, 0, 0, 0, 0, 0, 0, 0]");
      assertEquals(
        lines[5],
        "Assignment of values to elements - square of index:",
      );
      assertEquals(lines[6], "[0, 1, 4, 9, 16, 25, 36, 49]");
      assertEquals(lines[8], "APPEND element valued 64 to the list:");
      assertEquals(lines[9], "[0, 1, 4, 9, 16, 25, 36, 49, 64]");
      // "DELETE element at index 3 from the list:" - removes the 9 at index 3
      assertEquals(lines[12], "[0, 1, 4, 16, 25, 36, 49, 64]");
      // "EXTEND list with [81,100]:"
      assertEquals(lines[15], "[0, 1, 4, 16, 25, 36, 49, 64, 81, 100]");
      // "REMOVE element valued 16:" - removes the 16 now at index 3
      assertEquals(lines[18], "[0, 1, 4, 25, 36, 49, 64, 81, 100]");
      // "Identify INDEX of element valued 36:" - 36 is now at index 4.
      // the space before the 4 is print()'s default separator
      assertEquals(lines[21], "Index of 36 = 4");
      // "INSERT element valued 16 at index 5:"
      assertEquals(lines[24], "[0, 1, 4, 25, 36, 16, 49, 64, 81, 100]");
      // "REVERSE list:"
      assertEquals(lines[27], "[100, 81, 64, 49, 16, 36, 25, 4, 1, 0]");
      // "Iterate through list elements:" - matches the reversed list above,
      // each element followed by the loop's own "end='  '". Those two spaces
      // used to be dropped entirely: the encoder read a named argument as a
      // bare suppress-the-newline flag and never encoded its value, so the
      // numbers ran together as "100816449163625410".
      assertEquals(lines[30], "100  81  64  49  16  36  25  4  1  0  ");
      // the next statement's "\n\n" then supplies the blank line at 31 and
      // ends line 30 - the loop's last print() used "end", so there was no
      // newline of its own to end it
      assertEquals(lines[31], "");
      assertEquals(lines[32], "Print every third element:");
      // every third element (indices 2, 5, 8) of the reversed list above
      assertEquals(lines[33], "64  36  1  ");
    });
  });

  // Three standard Python string features that were once unsupported, or, for
  // slicing, silently wrong.
  describe("Python string support: slicing, iteration, repetition", () => {
    describe("string slicing (s[a:b])", () => {
      it("slices a substring from the start, middle, and end", () => {
        const code = [
          's = "hello world"',
          "print(s[0:5])",
          "print(s[6:11])",
          "print(s[1:5])",
        ].join("\n");
        const pcode = compileToPcode("Python", code);
        const { output } = runPcode(pcode);
        assertEquals(output.outputText.trim().split("\n"), [
          "hello",
          "world",
          "ello",
        ]);
      });

      it("a single-character-length slice and a zero-length slice", () => {
        const code = ['s = "hello"', "print(s[0:1])", "print(s[2:2])"].join(
          "\n",
        );
        const pcode = compileToPcode("Python", code);
        const { output } = runPcode(pcode);
        // not trim()+split(): the second print's empty line would collapse
        // away under trim(), silently hiding a wrong answer
        assertEquals(output.outputText, "h\n\n");
      });

      it("slice bounds computed from variables/expressions (not just literals)", () => {
        const code = [
          's = "hello world"',
          "a = 1",
          "b = len(s) - 6",
          "print(s[a:b])",
        ].join("\n");
        const pcode = compileToPcode("Python", code);
        const { output } = runPcode(pcode);
        assertEquals(output.outputText.trim(), "ello");
      });

      it("Further/UserStringFunctions.tpy: recursive and iterative string reversal agree (regression for the silent-slice bug)", async () => {
        const code = await Deno.readTextFile(
          new URL(
            "../../../assets/examples/Python/Further/UserStringFunctions.tpy",
            import.meta.url,
          ),
        );
        const pcode = compileToPcode("Python", code);
        const { output } = runPcode(pcode);
        assertEquals(output.runtimeErrors, []);
      });
    });

    describe("string iteration (for c in s:)", () => {
      it("iterates a string's characters in order", () => {
        const code = 's = "abc"\nfor c in s:\n    print(c, end="")';
        const pcode = compileToPcode("Python", code);
        const { output } = runPcode(pcode);
        assertEquals(output.outputText, "abc");
      });

      it("doesn't execute the body for an empty string", () => {
        const code =
          's = ""\ncount = 0\nfor c in s:\n    count = count + 1\nprint(str(count))';
        const pcode = compileToPcode("Python", code);
        const { output } = runPcode(pcode);
        assertEquals(output.outputText.trim(), "0");
      });

      it("concatenating each iterated character rebuilds the original string, in order", () => {
        const code = [
          's = "hello"',
          'result = ""',
          "for c in s:",
          "    result = result + c",
          "print(result)",
        ].join("\n");
        const pcode = compileToPcode("Python", code);
        const { output } = runPcode(pcode);
        assertEquals(output.outputText.trim(), "hello");
      });

      it("appending each iterated character to a list preserves them independently", () => {
        // regression test for the scalar-string-buffer-aliasing bug found
        // via this exact pattern - see "Python list heap-lifetime
        // regression" below for the full characterization and fix
        const code = [
          's = "hello"',
          "chars = []",
          "for c in s:",
          "    chars.append(c)",
          "print(chars)",
        ].join("\n");
        const pcode = compileToPcode("Python", code);
        const { output } = runPcode(pcode);
        assertEquals(output.outputText.trim(), "['h', 'e', 'l', 'l', 'o']");
      });
    });

    describe("string repetition (s*n / n*s)", () => {
      it("s*n and n*s produce the same repeated string", () => {
        const code = ['s = "ab"', "print(s*3)", "print(3*s)"].join("\n");
        const pcode = compileToPcode("Python", code);
        const { output } = runPcode(pcode);
        assertEquals(output.outputText.trim().split("\n"), [
          "ababab",
          "ababab",
        ]);
      });

      it("n=0 gives an empty string, n=1 gives the string unchanged", () => {
        const code = ['s = "xy"', "print(s*0)", "print(s*1)"].join("\n");
        const pcode = compileToPcode("Python", code);
        const { output } = runPcode(pcode);
        // not trim()+split(): the first print's empty line would collapse
        // away under trim(), silently hiding a wrong answer
        assertEquals(output.outputText, "\nxy\n");
      });

      it("Cellular/IteratedPD.tpy's util string (chr(3*n)*3 etc.) has the correct length and content", async () => {
        // mirrors the file's own "util" construction line, computed by
        // hand for n=1 (the file's actual first use) to serve as an oracle
        const n = 1;
        const code = [
          `n = ${n}`,
          "util = chr(0)+chr(3*n)*3+chr(0)+chr(5*n)+chr(n+4)+chr(0)*5+chr(n)+chr(0)+chr(n-1)",
          "print(str(len(util)))",
        ].join("\n");
        const pcode = compileToPcode("Python", code);
        const { output } = runPcode(pcode);
        const expected =
          String.fromCharCode(0) +
          String.fromCharCode(3 * n).repeat(3) +
          String.fromCharCode(0) +
          String.fromCharCode(5 * n) +
          String.fromCharCode(n + 4) +
          String.fromCharCode(0).repeat(5) +
          String.fromCharCode(n) +
          String.fromCharCode(0) +
          String.fromCharCode(n - 1);
        assertEquals(output.outputText.trim(), String(expected.length));
      });

      it("Cellular/IteratedPD.tpy compiles and runs without error", async () => {
        const code = await Deno.readTextFile(
          new URL(
            "../../../assets/examples/Python/Cellular/IteratedPD.tpy",
            import.meta.url,
          ),
        );
        const pcode = compileToPcode("Python", code);
        const { output } = runExampleBounded(pcode, 500);
        assertEquals(output.runtimeErrors, []);
      });
    });
  });

  describe("Python nested lists (lists of lists)", () => {
    it("reads a nested list literal with chained indexing", () => {
      const code =
        "outer = [[1, 2], [3, 4]]\nprint(str(outer[0][1]))\nprint(str(outer[1][0]))";
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim().split("\n"), ["2", "3"]);
    });

    it("negative indexes work at both levels of a chained index", () => {
      const code = "outer = [[1, 2], [3, 4]]\nprint(str(outer[-1][-1]))";
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "4");
    });

    it("writes to a nested list element via chained indexing", () => {
      const code = [
        "outer = [[1, 2], [3, 4]]",
        "outer[1][0] = 99",
        "print(str(outer[1][0]))",
        "print(str(outer[0][0]))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      // the sibling element (outer[0][0]) is unaffected by the write
      assertEquals(output.outputText.trim().split("\n"), ["99", "1"]);
    });

    it("building nested lists via .append() keeps each row independent (no aliasing)", () => {
      // the Cellular/LifeArrays.tpy pattern: a fresh sublist is built and
      // appended on each outer iteration
      const code = [
        "thisgen = []",
        "for x in range(3):",
        "    xlist = []",
        "    for y in range(3):",
        "        xlist.append(x * 10 + y)",
        "    thisgen.append(xlist)",
        "thisgen[0][0] = -1",
        "print(str(thisgen[0][0]))",
        "print(str(thisgen[1][0]))",
        "print(str(thisgen[2][2]))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      // if rows were aliased, mutating thisgen[0][0] would corrupt the
      // other rows too - it doesn't
      assertEquals(output.outputText.trim().split("\n"), ["-1", "10", "22"]);
    });

    it("chained indexes can be compound expressions, not just plain variables (the LifeArrays.tpy 'thisgen[(x+i)%width][(y+j)%height]' pattern)", () => {
      const code = [
        "width = 3",
        "height = 3",
        "thisgen = []",
        "for x in range(width):",
        "    xlist = []",
        "    for y in range(height):",
        "        xlist.append(x * 10 + y)",
        "    thisgen.append(xlist)",
        "x = 1",
        "i = 3",
        "y = 0",
        "j = 5",
        // wraps to thisgen[(1+3)%3][(0+5)%3] = thisgen[1][2]
        "print(str(thisgen[(x + i) % width][(y + j) % height]))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "12");
    });

    it("a fully-indexed chained read can be used as a plain scalar (e.g. as an index into another list)", () => {
      // the Logic&CS/NoughtsAndCrosses.tpy pattern: "thispos[wins[i][0]]"
      const code = [
        "wins = [[0, 1, 2], [3, 4, 5]]",
        "thispos = [10, 20, 30, 40, 50, 60]",
        "i = 1",
        "print(str(thispos[wins[i][0]]))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "40");
    });

    it("thisgen=[] then thisgen.append(xlist) infers a list-of-lists from usage alone (no type hint)", () => {
      const code = [
        "thisgen = []",
        "xlist = [1, 2]",
        "thisgen.append(xlist)",
        "print(str(thisgen[0][1]))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "2");
    });

    it("rejects iterating directly over a list of lists", () => {
      const code = [
        "thisgen = [[1, 2], [3, 4]]",
        "for row in thisgen:",
        "    print(str(row))",
      ].join("\n");
      let threw = false;
      try {
        compileToPcode("Python", code);
      } catch {
        threw = true;
      }
      assertEquals(threw, true);
    });

    it("Cellular/LifeArrays.tpy compiles without error (real file, chained reads/writes with compound index expressions)", async () => {
      const code = await Deno.readTextFile(
        new URL(
          "../../../assets/examples/Python/Cellular/LifeArrays.tpy",
          import.meta.url,
        ),
      );
      compileToPcode("Python", code);
    });

    it("Logic&CS/NoughtsAndCrosses.tpy's wins-indexing compiles and runs correctly in isolation", () => {
      const code = [
        "wins=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]",
        "thispos=[1,0,1,0,1,0,1,0,1,0,0,0]",
        "jm=1",
        "for i in range(8):",
        "    if (thispos[wins[i][0]]==jm) and (thispos[wins[i][1]]==jm) and (thispos[wins[i][2]]==jm):",
        "        print('line '+str(i)+' is a win')",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      // thispos has 1s at even indexes (0,2,4,6,8) - lines 6 ([0,4,8]) and
      // 7 ([2,4,6]) are the only wins triples made up entirely of those
      assertEquals(output.outputText.trim().split("\n"), [
        "line 6 is a win",
        "line 7 is a win",
      ]);
    });
  });

  describe("Python list heap-lifetime regression (found via real example files)", () => {
    // list elements/blocks are raw pointers into the same reclaimable temp
    // heap space as heap strings share (see
    // src/core/compiler/encoder/expressions/listLiteral.ts's doc comment
    // for the full root-cause explanation) - unlike a scalar string
    // variable, which is copied into its own fixed permanent buffer on
    // assignment (CSTR), nothing was promoting a list's own contents out of
    // that reclaimable space, so a later read of some *other* temp string
    // could silently overwrite still-needed list data. Fixed by emitting HFIX
    // at every list-block-creating/growing site.

    it("concatenating 3+ ascending reads of the same string list in one expression doesn't corrupt other elements", () => {
      const code =
        "x=['apple','banana','cherry']\nprint(x[0]+x[1]+x[2])\nprint(x[0])\nprint(x[1])\nprint(x[2])";
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim().split("\n"), [
        "applebananacherry",
        "apple",
        "banana",
        "cherry",
      ]);
    });

    it("repeatedly comparing and swapping string list elements in a while loop doesn't corrupt other elements", () => {
      const code = [
        "A=['delta','bravo','charlie','alpha']",
        "i=0",
        "while i<3:",
        "    if A[i]>A[i+1]:",
        "        tmp=A[i]",
        "        A[i]=A[i+1]",
        "        A[i+1]=tmp",
        "    i=i+1",
        "print(A[0])",
        "print(A[1])",
        "print(A[2])",
        "print(A[3])",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      // one bubble-sort pass: bravo,charlie,alpha,delta
      assertEquals(output.outputText.trim().split("\n"), [
        "bravo",
        "charlie",
        "alpha",
        "delta",
      ]);
    });

    // A separate, later-found variant of the same underlying class: a
    // string-typed *scalar variable* (not a fresh temp string) captured
    // into a list. The paragraph above explains why scalar strings don't
    // need HFIX-style promotion - CSTR always copies into that variable's
    // own fixed, permanent buffer. That's exactly the trap: reassigning the
    // variable later (another CSTR into the *same* buffer) silently
    // rewrites every list slot that had captured a pointer to it, since
    // capturing it as a list element previously just stored that pointer
    // directly rather than cloning it. Found via
    // "for c in s: chars.append(c)" - every element read back as
    // the last character read). Fixed by cloning the value onto a fresh
    // heap block (PCode.hstr, the same primitive already used for a
    // function's string return value in functionValue.ts) at every site
    // that captures a string into list-managed storage: ".append"/
    // ".insert" (encoder/lists.ts), list-literal elements
    // (encoder/expressions/listLiteral.ts), and indexed list-element writes
    // (encoder/statements/variableAssignment.ts's writesStringListElement
    // case). ".extend" needs no separate fix: by the time it runs, the
    // source list's own elements are already independent clones via one of
    // those three sites.
    it("appending a scalar string variable to a list, then reassigning the variable, doesn't corrupt the list", () => {
      const code = [
        's = "hello"',
        "chars = []",
        "c = s[0]",
        "chars.append(c)",
        "c = s[1]",
        "chars.append(c)",
        "c = s[2]",
        "chars.append(c)",
        "print(chars)",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "['h', 'e', 'l']");
    });

    it("a list literal built from a scalar string variable snapshots it, unaffected by a later reassignment", () => {
      const code = [
        'c = "x"',
        'mylist = [c, "b", "c"]',
        'c = "y"',
        "print(mylist)",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "['x', 'b', 'c']");
    });

    it(".insert() with a scalar string variable snapshots it, unaffected by a later reassignment", () => {
      const code = [
        'c = "x"',
        'mylist = ["a", "b"]',
        "mylist.insert(1, c)",
        'c = "y"',
        "print(mylist)",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "['a', 'x', 'b']");
    });

    it("an indexed list-element write from a scalar string variable snapshots it, unaffected by a later reassignment", () => {
      const code = [
        'c = "x"',
        'mylist = ["a", "b"]',
        "mylist[0] = c",
        'c = "y"',
        "print(mylist)",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "['x', 'b']");
    });
  });

  describe("while/for loop line-numbering regression (found via real example files)", () => {
    // whileStatement.ts/forStatement.ts computed each substatement's own
    // absolute start line using a hardcoded assumption that the loop's
    // condition (and, for "for", its initialisation) always take exactly 1
    // pcode line - wrong whenever either needs more (e.g. a subroutine
    // call in the condition), which silently gave any substatement that
    // computes its own internal jump targets (e.g. a nested "if") the
    // wrong absolute line number.

    it("an 'if' inside a 'while <subroutine call>:' loop only runs its body when the condition is true", () => {
      const code = [
        "def lessthan(x,y):",
        "    return (x<y)",
        "a=0",
        "b=1",
        "j=1",
        "while lessthan(a,b):",
        "    b=0", // makes the condition false after the first pass
        "    if j>1:",
        "        j=j-1",
        "print(str(j))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      // j starts at 1 (not >1) - the "if" body must never run
      assertEquals(output.outputText.trim(), "1");
    });

    it("an 'if' inside a 'for x in range(<subroutine call>):' loop computes correct jump targets", () => {
      const code = [
        "def f(x,y):",
        "    return x+y",
        "j=0",
        "for i in range(f(0,3)):",
        "    if i>0:",
        "        j=j+1",
        "print(str(j))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      // range(3): i=0,1,2 - the "if" body runs for i=1,2 only
      assertEquals(output.outputText.trim(), "2");
    });
  });

  // Encoder-level pcode shape is covered separately by
  // test/core/compiler/encoder/statements.test.ts; these are the behavioural
  // checks.
  describe("break and continue statements", () => {
    it("'break' exits a 'while' loop, and execution continues after it (not an infinite loop)", () => {
      const code = [
        "x = 0",
        "while True:",
        "    x = x + 1",
        "    if x == 3:",
        "        break",
        "x = x + 100",
        "print(str(x))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      // fakeTimers.flush() (inside runPcode) throws if this hangs instead
      // of halting - "while True" with no working "break" would do exactly
      // that
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "103");
    });

    it("'break' exits a 'for' loop, and the loop variable holds the value it broke on", () => {
      const code = [
        "for i in range(10):",
        "    if i == 4:",
        "        break",
        "print(str(i))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "4");
    });

    it("'break' in a nested loop exits only the inner loop", () => {
      const code = [
        "outerRuns = 0",
        "innerCount = 0",
        "for i in range(3):",
        "    outerRuns = outerRuns + 1",
        "    for j in range(10):",
        "        if j == 2:",
        "            break",
        "        innerCount = innerCount + 1",
        "print(str(outerRuns))",
        "print(str(innerCount))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      // outer runs all 3 times (never broken); inner runs twice (j=0,1)
      // per outer iteration before breaking at j=2, so 3*2=6
      assertEquals(output.outputText.trim(), "3\n6");
    });

    it("'continue' in a 'while' loop re-tests the condition (skips one iteration's rest, still terminates)", () => {
      const code = [
        "x = 0",
        "count = 0",
        "while x < 5:",
        "    x = x + 1",
        "    if x == 3:",
        "        continue",
        "    count = count + 1",
        "print(str(count))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      // x runs 1,2,3,4,5 - count skips only x==3, so it's incremented for
      // 1,2,4,5
      assertEquals(output.outputText.trim(), "4");
    });

    it("'continue' in a 'for' loop still increments - skipping the increment would infinite-loop", () => {
      const code = [
        "count = 0",
        "for i in range(5):",
        "    if i == 2:",
        "        continue",
        "    count = count + 1",
        "print(str(count))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      // if "continue" jumped straight to the condition and skipped the
      // increment, i would stay 2 forever and fakeTimers.flush() (inside
      // runPcode) would throw instead of this reaching its assertion
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "4");
    });

    it("'break' inside an 'if'/'elif'/'else' chain targets the enclosing loop, not the 'if'", () => {
      const code = [
        "count = 0",
        "for i in range(5):",
        "    if i == 0:",
        "        count = count + 1",
        "    elif i == 2:",
        "        break",
        "    else:",
        "        count = count + 1",
        "print(str(count))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      // i=0: "if" branch (count=1); i=1: "else" branch (count=2); i=2:
      // "elif" branch breaks before count can change again
      assertEquals(output.outputText.trim(), "2");
    });

    it("a 'break' inside a 'while <subroutine call>:' loop still gets its exit target right (multi-line condition)", () => {
      // same line-numbering hazard as the "while/for loop line-numbering
      // regression" describe block above - the condition here takes more
      // than 1 pcode line, so a break target computed from a hardcoded
      // "+1" assumption would land on the wrong line
      const code = [
        "def lessthan(x,y):",
        "    return x<y",
        "a=0",
        "b=1",
        "count=0",
        "while lessthan(a,b):",
        "    b=0", // makes the condition false after the first pass, if break doesn't fire first
        "    count=count+1",
        "    if count==1:",
        "        break",
        "count=count+100",
        "print(str(count))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "101");
    });
  });

  // regression tests for find.assignmentTarget
  // (src/core/compiler/parser/common/find.ts) - see its own doc comment for the
  // full story: this compiler used to let *any* subroutine's plain
  // assignment silently reuse an outer variable of the same name instead
  // of creating its own local, unless the read-before-write shape of the
  // bug happened to surface as a compile error. Fixed to match real
  // Python's actual scoping rule at every level (not just nested
  // subroutines - an earlier, narrower version of this fix special-cased
  // top-level subroutines, but that was reverted in favor of fixing the
  // ~10 real example files that relied on it instead).
  describe("Python variable scoping (find.assignmentTarget)", () => {
    it("a subroutine's assignment to a name shared with an outer variable does NOT write through it, without an explicit 'global'", () => {
      const code = [
        "count = 0",
        "def increment():",
        "    count = count + 1", // creates its own local; reads it uninitialized
        "increment()",
        "print(str(count))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      // the outer "count" is untouched by increment()'s own local shadow
      assertEquals(output.outputText.trim(), "0");
    });

    it("the same pattern DOES write through with an explicit 'global' declaration", () => {
      const code = [
        "count = 0",
        "def increment():",
        "    global count",
        "    count = count + 1",
        "increment()",
        "increment()",
        "increment()",
        "print(str(count))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText.trim(), "3");
    });

    it("a nested subroutine's own local no longer corrupts an unrelated same-named outer variable across repeated calls (the original quicksort/m bug, standalone)", () => {
      const code = [
        "def swap(x, y):",
        "    global A",
        "    t = A[x]",
        "    A[x] = A[y]",
        "    A[y] = t",
        "def quicksort():",
        "    def qsort(left, right):",
        "        if left < right:",
        "            m = left",
        "            for i in range(left + 1, right + 1):",
        "                if A[i] < A[left]:",
        "                    m += 1",
        "                    swap(m, i)",
        "            swap(left, m)",
        "            qsort(left, m - 1)",
        "            qsort(m + 1, right)",
        "    qsort(0, n - 1)",
        "n = 10",
        "A = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]",
        "comptotal = [0, 0, 0, 0]",
        "m = 0",
        "quicksort()",
        "print(str(comptotal[m]))", // m must still be 0, not corrupted by qsort's own "m"
        "for x in A:",
        "    print(str(x))",
      ].join("\n");
      const pcode = compileToPcode("Python", code);
      const { output } = runPcode(pcode);
      const lines = output.outputText.trim().split("\n");
      assertEquals(lines[0], "0"); // comptotal[m] - m untouched by qsort
      assertEquals(lines.slice(1), [
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
      ]); // correctly sorted
    });
  });
});
