import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertFalse, assertMatch } from "@std/assert";
import { isRunning, type MachineOptions } from "@/core/machine.ts";
import { PCode, runPcode, runToInt } from "./lib/helpers.ts";

/**
 * Coverage for `src/core/machine/runtime.ts`'s runtime error conditions:
 * every place `execute()` throws a `MachineError`, and what happens once it
 * does. List-operator-specific `MachineError` kinds (list capacity
 * exceeded) are cross-referenced here but have their primary happy-path
 * coverage in `lists.test.ts` - see that file's header comment.
 *
 * `execute()`'s own `catch` block has two branches:
 * - normally, it calls `halt()` (so `isRunning()` becomes `false` and
 *   `notifyStateChange("halted")` fires) and reports the error via
 *   `output.notifyRuntimeError`.
 * - if a TRY block is active (`memory.tryStack` non-empty), it instead jumps
 *   to the registered catch line and keeps running - see "TRY/XCPT" below.
 *
 * Each non-TRY test below asserts all three: the error message, that the
 * machine actually halted, and that exactly one error was reported.
 */
describe("machine/runtime: error handling", () => {
  const expectError = (
    pcode: number[][],
    expectedMessage: string | RegExp,
    optionsOverrides: Partial<MachineOptions> = {},
  ) => {
    const { output } = runPcode(pcode, optionsOverrides);
    assertEquals(output.runtimeErrors.length, 1);
    if (typeof expectedMessage === "string") {
      assertEquals(output.runtimeErrors[0].message, expectedMessage);
    } else {
      assertMatch(output.runtimeErrors[0].message, expectedMessage);
    }
    assertEquals(output.stateChanges.at(-1), "halted");
    assertFalse(isRunning());
    return output;
  };

  describe("stack-empty checks", () => {
    it("throws when a binary operator is called on an empty stack", () => {
      // representative of the very common "n1 !== undefined && n2 !== undefined" guard
      expectError(
        [[PCode.plus], [PCode.halt]],
        "Stack operation called on empty stack.",
      );
    });

    it("throws when a unary operator is called on an empty stack", () => {
      expectError(
        [[PCode.neg], [PCode.halt]],
        "Stack operation called on empty stack.",
      );
    });

    it("throws when RETN is called with an empty return stack", () => {
      expectError(
        [[PCode.retn], [PCode.halt]],
        "RETN called on empty return stack.",
      );
    });

    it("throws when MEMR is called with an empty memory stack", () => {
      expectError(
        [[PCode.memr, 0], [PCode.halt]],
        "MEMR called on empty memory stack.",
      );
    });

    // Every other pcode below pops the evaluation stack as its very first
    // action, regardless of how many operands it ultimately expects - so
    // an entirely empty stack always fails on the first pop, for all of
    // them, the same way. Table-driven rather than ~130 near-identical `it`
    // blocks. Confirmed by reading every "else { throw ... }"
    // branch in runtime.ts's switch that uses this exact message.
    const stackEmptyOpcodes = [
      "drop",
      "dupl",
      "swap",
      "rota",
      "roll",
      "incr",
      "decr",
      "abs",
      "sign",
      "rand",
      "seed",
      "shft",
      "not",
      "and",
      "or",
      "xor",
      "andl",
      "orl",
      "subt",
      "mult",
      "divr",
      "div",
      "mod",
      "divf",
      "modf",
      "divm",
      "lerp",
      "hyp",
      "root",
      "powr",
      "log",
      "alog",
      "ln",
      "exp",
      "sin",
      "cos",
      "tan",
      "asin",
      "acos",
      "atan",
      "pi",
      "eqal",
      "noeq",
      "less",
      "more",
      "lseq",
      "mreq",
      "maxi",
      "mini",
      "seql",
      "sneq",
      "sles",
      "smor",
      "sleq",
      "smeq",
      "smax",
      "smin",
      "case",
      "copy",
      "dels",
      "inss",
      "poss",
      "repl",
      "scat",
      "slen",
      "smul",
      "spad",
      "trim",
      "ctst",
      "ernf",
      "ctos",
      "sasc",
      "itos",
      "hexs",
      "sval",
      "svdf",
      "qtos",
      "qval",
      "pcoh",
      "poke",
      "canv",
      "reso",
      "udat",
      "setx",
      "sety",
      "setd",
      "angl",
      "thik",
      "pen",
      "colr",
      "toxy",
      "mvxy",
      "drxy",
      "fwrd",
      "back",
      "left",
      "rght",
      "turn",
      "blnk",
      "rcol",
      "fill",
      "pixc",
      "pixs",
      "rgb",
      "frgt",
      "poly",
      "pfil",
      "circ",
      "blot",
      "elps",
      "eblt",
      "box",
      "stvg",
      "stvv",
      "stvr",
      "lptr",
      "sptr",
      "zptr",
      "cptr",
      "cstr",
      "hstr",
      "ifno",
      "plrj",
      "stmt",
      "memc",
      "stat",
      "iclr",
      "bufr",
      "read",
      "tdet",
      "curs",
      "kech",
      "outp",
      "disp",
      "writ",
      "tset",
      "wait",
      // list operators (LIHP excluded - it never pops the stack, it only
      // pushes): each reads its inline lp/size operand (if it needs one at
      // all) before popping, but since none of them read that inline value
      // through a stack-dependent path, an absent trailing operand is
      // harmless here - they still fail on the first stack pop exactly
      // like every op above.
      "lapp",
      "lcpy",
      "ldel",
      "lext",
      "lidx",
      "lins",
      "lmul",
      "lprt",
      "lrem",
      "lrev",
      "liad",
      // core file-processing operators - each
      // pops its arguments and validates them *before* suspending on the
      // FileSystem port (see runtime.ts's suspendFor), so an empty stack is
      // still caught synchronously, exactly like every op above.
      "chdr",
      "file",
      "open",
      "clos",
      "fbeg",
      "eof",
      "eoln",
      "frds",
      "frln",
      "fwrs",
      "fwln",
      // directory/search/move file-processing operators - same "pop and
      // validate before suspending" shape as the operators above.
      "diry",
      "ffnd",
      "fdir",
      "fnxt",
      "fmov",
    ] as const;

    for (const op of stackEmptyOpcodes) {
      it(`${op.toUpperCase()} throws when the stack is empty`, () => {
        expectError(
          [[PCode[op]], [PCode.halt]],
          "Stack operation called on empty stack.",
        );
      });
    }
  });

  describe("ROLL", () => {
    it("throws when the argument is zero", () => {
      expectError(
        [[PCode.ldin, 1], [PCode.ldin, 0], [PCode.roll], [PCode.halt]],
        "Argument to ROLL cannot be zero.",
      );
    });

    it("throws when a negative roll pops an empty stack for its second value", () => {
      expectError(
        [[PCode.ldin, -1], [PCode.roll], [PCode.halt]],
        "Argument to ROLL cannot be zero.",
      );
    });
  });

  describe("division by zero", () => {
    it("DIVR throws", () => {
      expectError(
        [[PCode.ldin, 5], [PCode.ldin, 0], [PCode.divr], [PCode.halt]],
        "Cannot divide by zero.",
      );
    });

    it("DIV throws", () => {
      expectError(
        [[PCode.ldin, 5], [PCode.ldin, 0], [PCode.div], [PCode.halt]],
        "Cannot divide by zero.",
      );
    });

    it("DIVF throws", () => {
      expectError(
        [[PCode.ldin, 5], [PCode.ldin, 0], [PCode.divf], [PCode.halt]],
        "Cannot divide by zero.",
      );
    });

    it("QTOS throws", () => {
      expectError(
        [
          [PCode.ldin, 5],
          [PCode.ldin, 0],
          [PCode.ldin, 2],
          [PCode.qtos],
          [PCode.halt],
        ],
        "Cannot divide by zero.",
      );
    });
  });

  describe("Python string tests", () => {
    it("CTST throws when the string isn't exactly one character", () => {
      expectError(
        [[PCode.lstr, 2, 104, 105], [PCode.ctst], [PCode.halt]],
        "String is not a character.",
      );
    });

    it("ERNF throws when its argument is negative", () => {
      expectError([[PCode.ldin, -1], [PCode.ernf], [PCode.halt]], "Not found.");
    });
  });

  describe("TEST (array/string bound check)", () => {
    it("throws when the index is negative", () => {
      expectError(
        [
          [PCode.ldin, 5],
          [PCode.stvg, 500],
          [PCode.ldin, -1],
          [PCode.ldin, 500],
          [PCode.test],
          [PCode.halt],
        ],
        /^Array index out of range/,
      );
    });

    it("throws when the index exceeds the stored maximum", () => {
      expectError(
        [
          [PCode.ldin, 5],
          [PCode.stvg, 500],
          [PCode.ldin, 6],
          [PCode.ldin, 500],
          [PCode.test],
          [PCode.halt],
        ],
        /^Array index out of range/,
      );
    });

    it("throws when the index equals the stored maximum (one past the last valid index)", () => {
      expectError(
        [
          [PCode.ldin, 5],
          [PCode.stvg, 500],
          [PCode.ldin, 5],
          [PCode.ldin, 500],
          [PCode.test],
          [PCode.halt],
        ],
        /^Array index out of range/,
      );
    });
  });

  describe("SPAD", () => {
    it("throws instead of looping forever when the pad string is empty and the target is unreachable", () => {
      expectError(
        [
          [PCode.lstr, 2, 97, 98], // "ab"
          [PCode.lstr, 0], // "" - empty pad string
          [PCode.ldin, 5],
          [PCode.spad],
          [PCode.halt],
        ],
        "Cannot pad a string with an empty string.",
      );
    });
  });

  it("ANGL throws when set to zero", () => {
    expectError(
      [[PCode.ldin, 0], [PCode.angl], [PCode.halt]],
      "Angles cannot be set to zero.",
    );
  });

  it("SVAL throws when its string doesn't parse to an integer", () => {
    expectError(
      [
        [PCode.lstr, 3, 120, 120, 120],
        [PCode.ldin, 0],
        [PCode.sval],
        [PCode.halt],
      ],
      "Cannot parse xxx to integer.",
    );
  });

  it("SVAL throws on trailing garbage after an otherwise-valid integer", () => {
    // "123abc" - parseInt alone would silently accept the leading "123"
    expectError(
      [
        [PCode.lstr, 6, 49, 50, 51, 97, 98, 99],
        [PCode.ldin, 0],
        [PCode.sval],
        [PCode.halt],
      ],
      "Cannot parse 123abc to integer.",
    );
  });

  it("SVDF falls back to its default on trailing garbage after an otherwise-valid integer", () => {
    assertEquals(
      runToInt(
        [PCode.lstr, 6, 49, 50, 51, 97, 98, 99], // "123abc"
        [PCode.ldin, -1],
        [PCode.ldin, 0],
        [PCode.svdf],
      ),
      -1,
    );
  });

  it("string operators throw on a null/unassigned heap string pointer", () => {
    expectError(
      [[PCode.ldin, 0], [PCode.trim], [PCode.halt]],
      "String pointer unassigned.",
    );
  });

  it("TDET throws when given an out-of-range input code", () => {
    expectError(
      [[PCode.ldin, 999], [PCode.ldin, 0], [PCode.tdet], [PCode.halt]],
      "Detect called with invalid input state.code: 999.",
    );
  });

  it("MEMC throws when the new frame would overflow the stack size", () => {
    expectError(
      [[PCode.ldin, 100], [PCode.stmt], [PCode.memc, 990, 5], [PCode.halt]],
      "Memory stack has overflowed into memory heap. Probable cause is unterminated recursion.",
      { stackSize: 100 },
    );
  });

  describe("call-stack depth ceilings (capacity 1000, matching Pascal)", () => {
    it("SUBR throws once the return stack depth is exceeded - unterminated recursion", () => {
      // calls itself forever, growing the return stack by one each time
      const pcode = [/* 0 */ [PCode.subr, 0 + 1]];
      expectError(
        pcode,
        "Subroutine return stack overflow. Probable cause is unterminated recursion.",
      );
    });

    it("PSSR throws once the subroutine register stack depth is exceeded - unterminated recursion", () => {
      // loops forever, pushing to the subroutine register stack each pass
      const pcode = [/* 0 */ [PCode.pssr, 5, PCode.jump, 0 + 1]];
      expectError(
        pcode,
        "Subroutine register stack overflow. Probable cause is unterminated recursion.",
      );
    });

    it("MEMC throws once the memory pointer stack depth is exceeded - unterminated recursion", () => {
      const pcode = [
        /* 0 */ [PCode.ldin, 0, PCode.stmt], // prime the memory stack with one entry
        /* 1 */ [PCode.memc, 900, 1, PCode.jump, 1 + 1], // loop forever, claiming a tiny frame each pass
      ];
      expectError(
        pcode,
        "Memory pointer stack overflow. Probable cause is unterminated recursion.",
      );
    });
  });

  it("throws on an unrecognised pcode", () => {
    expectError([[0xff_ff], [PCode.halt]], /^Unknown PCode 0x/);
  });

  it("throws when execution jumps to a line that doesn't exist", () => {
    // JUMP argument 99 means "jump to array index 98", far past the end of this pcode
    expectError(
      [[PCode.jump, 99]],
      /tried to jump to a line that does not exist/,
    );
  });

  describe("list operators", () => {
    // primary coverage (every operator, every resolved design decision) is
    // in lists.test.ts - this is just the one distinct MachineError kind
    // list operators can raise, per this file's "at least one test per
    // distinct MachineError kind" bar.
    it("throws when a list has reached its maximum capacity", () => {
      expectError(
        [
          [PCode.ldin, 200, PCode.liad, 1], // 1-D integer list, capacity 1, at address 200
          [PCode.ldin, 200, PCode.ldin, 1, PCode.lapp, 4], // fills it
          [PCode.ldin, 200, PCode.ldin, 2, PCode.lapp, 4], // exceeds it
          [PCode.halt],
        ],
        "List has reached its maximum capacity of 1 items.",
      );
    });
  });

  describe("TRY/XCPT: errors caught inside a TRY block don't halt the machine", () => {
    // NB: unlike JUMP/IFNO/SUBR (whose line arguments are 1-based, the
    // runtime subtracting 1 to get the array index), TRY's argument (when
    // positive) is used directly as the catch line's array index - confirmed
    // by reading both the TRY case (pushes the raw operand onto `tryStack`,
    // alongside the current stack height) and `execute()`'s outer catch
    // block (assigns it straight to `state.line`, no "-1"). A zero argument
    // instead closes the innermost handler without registering a new one.
    // XCPT itself is a no-op: just an anchor line for TRY to jump to.

    it("jumps to the registered catch line instead of halting", () => {
      const pcode = [
        /* 0 */ [PCode.try, 2], // register line 2 as the catch handler
        /* 1 */ [PCode.plus, PCode.halt], // PLUS on an empty stack throws
        /* 2 */ [
          PCode.xcpt,
          PCode.ldin,
          777,
          PCode.itos,
          PCode.writ,
          PCode.halt,
        ], // catch handler
      ];
      const { output } = runPcode(pcode);
      assertEquals(output.runtimeErrors, []);
      assertEquals(output.outputText, "777");
      assertEquals(output.stateChanges.at(-1), "halted"); // from the catch handler's own HALT
    });

    it("only catches the first error - TRY is consumed once it fires", () => {
      const pcode = [
        /* 0 */ [PCode.try, 2], // register line 2 as the catch handler
        /* 1 */ [PCode.plus], // throws (empty stack) - caught, jumps to line 2
        /* 2 */ [PCode.plus, PCode.halt], // throws again, but the handler was already consumed
      ];
      const { output } = runPcode(pcode);
      assertEquals(output.runtimeErrors.length, 1);
      assertEquals(
        output.runtimeErrors[0].message,
        "Stack operation called on empty stack.",
      );
      assertEquals(output.stateChanges.at(-1), "halted");
    });

    it("TRY(0) closes the innermost handler, so a later error is no longer caught", () => {
      const pcode = [
        /* 0 */ [PCode.try, 3], // register line 3 as the catch handler
        /* 1 */ [PCode.try, 0], // immediately close it again
        /* 2 */ [PCode.plus, PCode.halt], // throws (empty stack) - must NOT be caught now
        /* 3 */ [PCode.ldin, 777, PCode.itos, PCode.writ, PCode.halt], // would-be handler; must not run
      ];
      const { output } = runPcode(pcode);
      assertEquals(output.runtimeErrors.length, 1);
      assertEquals(
        output.runtimeErrors[0].message,
        "Stack operation called on empty stack.",
      );
      assertEquals(output.outputText, "");
    });

    it("restores the evaluation stack to its registered height on catch, discarding partial expression results", () => {
      const pcode = [
        /* 0 */ [PCode.try, 2], // registers the *current* (empty) stack height
        // pushes 1, 2, 3 (kept, never consumed), then 5 and 0 (consumed by
        // DIVR, which throws before pushing a result) - so when the error
        // fires, 1/2/3 are still sitting on the stack unless restored
        /* 1 */ [
          PCode.ldin,
          1,
          PCode.ldin,
          2,
          PCode.ldin,
          3,
          PCode.ldin,
          5,
          PCode.ldin,
          0,
          PCode.divr,
          PCode.halt,
        ],
        // if the stack wasn't restored, ITOS here would convert the leftover
        // "3" and this whole program would succeed, printing "3" - if it
        // *was* restored, ITOS on the now-empty stack throws a second,
        // uncaught error instead (the handler was already consumed)
        /* 2 */ [PCode.xcpt, PCode.itos, PCode.writ, PCode.halt],
      ];
      const { output } = runPcode(pcode);
      assertEquals(output.runtimeErrors.length, 1);
      assertEquals(
        output.runtimeErrors[0].message,
        "Stack operation called on empty stack.",
      );
      assertEquals(output.outputText, "");
    });
  });
});
