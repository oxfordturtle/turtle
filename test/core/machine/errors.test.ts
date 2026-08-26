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
      assertEquals(output.runtimeErrors[0]?.message, expectedMessage);
    } else {
      assertMatch(output.runtimeErrors[0]?.message!, expectedMessage);
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

    // Every operator that consumes operands now does so through
    // `memory.popValue` - or `peekValue`/`popString`, which are built on it -
    // so the empty-stack guard is one branch in one place. This used to be a
    // table of ~130 opcode names sweeping the ~166 hand-written copies of that
    // guard one at a time; with the copies gone, so is the reason to enumerate
    // them.
    //
    // What is still worth checking is that each structurally *different* way of
    // reaching the shared guard reaches it: a plain pop, a multi-operand pop, a
    // pointer resolved through the heap, a peek that leaves the stack alone,
    // the memory stack's own pop, and the operators that read an inline operand
    // or suspend on a port - either of which could otherwise happen before the
    // stack is ever touched.
    // The third element is the instruction's inline operands, which have to be
    // there: reading a word past the end of a line is itself an error now, and
    // would be reported instead of the one under test.
    const stackEmptyOpcodes = [
      ["drop", "pops one value and discards it", []],
      ["subt", "pops two, failing on the first", []],
      ["lerp", "pops four, failing on the first", []],
      ["trim", "pops a pointer and resolves it through the heap", []],
      ["scat", "pops both pointers before resolving either", []],
      ["ctst", "peeks rather than pops", []],
      ["ernf", "peeks rather than pops", []],
      [
        "memc",
        "pops the *memory* stack, which reports the same message",
        [0, 0],
      ],
      [
        "lapp",
        "a list operator, which steps past its inline lp operand first",
        [0],
      ],
      ["liad", "a list operator that reads an inline size operand first", [0]],
      ["chdr", "a file operator: pops and validates before suspending", []],
      ["fmov", "a file operator with three operands", []],
      ["wait", "suspends, but only after popping its delay", []],
    ] as const;

    for (const [op, shape, operands] of stackEmptyOpcodes) {
      it(`${op.toUpperCase()} throws when the stack is empty (${shape})`, () => {
        expectError(
          [[PCode[op], ...operands], [PCode.halt]],
          "Stack operation called on empty stack.",
        );
      });
    }

    // [known bug] TODO.md 1.1: MIXC, TEST and CONS are the only three arms in
    // the switch that guard their operands with an `if` and no `else`. Every
    // other operator throws on an empty stack; these three fall through and
    // carry on as if nothing happened. It reads as an
    // omission rather than a decision, and it is invisible to the coverage
    // gate: Deno derives branch coverage from V8's block ranges, and V8 emits
    // a range only where the inner count *differs* from the enclosing one.
    // Because the guarded body runs on every execution of either arm today,
    // no range is emitted, no BRDA pair is generated, and the untaken false
    // path is never counted as a miss - the 100% gate simply cannot see it.
    // (The tests below give all three arms a false execution, so from now on
    // the pairs do exist and both sides are covered.) The assertions are
    // what the code does, not what it should do: making any one of them throw
    // - the consistent behaviour - trips these tests rather than passing
    // silently.
    //
    // CONS was missed by Phase 1, which recorded only MIXC and TEST; it was
    // found in Phase 2 while sweeping the guards, and is pinned here for the
    // same reason as the other two.
    describe("[known bug] MIXC, TEST and CONS are silent no-ops instead", () => {
      it("MIXC on an empty stack does nothing at all and the program runs on", () => {
        const { output } = runPcode([
          [PCode.mixc],
          [PCode.ldin, 7],
          [PCode.itos],
          [PCode.writ],
          [PCode.halt],
        ]);
        assertEquals(output.runtimeErrors, []);
        assertEquals(output.outputText, "7");
      });

      it("MIXC given only two of its four operands is equally silent", () => {
        const { output } = runPcode([
          [PCode.ldin, 1],
          [PCode.ldin, 2],
          [PCode.mixc],
          [PCode.halt],
        ]);
        assertEquals(output.runtimeErrors, []);
      });

      it("TEST on an empty stack does nothing at all", () => {
        const { output } = runPcode([[PCode.test], [PCode.halt]]);
        assertEquals(output.runtimeErrors, []);
      });

      it("CONS on an empty stack does nothing at all and the program runs on", () => {
        const { output } = runPcode([
          [PCode.cons],
          [PCode.ldin, 7],
          [PCode.itos],
          [PCode.writ],
          [PCode.halt],
        ]);
        assertEquals(output.runtimeErrors, []);
        assertEquals(output.outputText, "7");
      });

      it("CONS given only one of its two operands is equally silent", () => {
        const { output } = runPcode([
          [PCode.ldin, 1],
          [PCode.cons],
          [PCode.halt],
        ]);
        assertEquals(output.runtimeErrors, []);
      });
    });
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
    // [known bug] TODO.md 1.3: both messages are placeholders, each carrying
    // its own `TODO: better error message` in runtime.ts. They are what a
    // student sees, and neither says what was wrong or where. The exact
    // strings are asserted so that improving them is a deliberate change that
    // trips these tests, rather than a silent edit.
    it("[known bug] CTST throws a placeholder message when the string isn't exactly one character", () => {
      expectError(
        [[PCode.lstr, 2, 104, 105], [PCode.ctst], [PCode.halt]],
        "String is not a character.",
      );
    });

    it("[known bug] ERNF throws a placeholder message when its argument is negative", () => {
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

    // [known bug] TODO.md 1.2: the arm carries a `TODO: make range check a
    // runtime option` comment, but `MachineOptions.rangeCheckArrays` already
    // exists, defaults to true, and is threaded all the way from the Run menu
    // through `program.ts` into the machine - TEST just never consults it.
    // Same shape as TODO.md 3.9's seven dead `EncoderOptions`: a control the
    // student can turn off that changes nothing. Wiring it up trips this test.
    it("[known bug] range-checks anyway when rangeCheckArrays is turned off", () => {
      expectError(
        [
          [PCode.ldin, 5],
          [PCode.stvg, 500],
          [PCode.ldin, 6],
          [PCode.ldin, 500],
          [PCode.test],
          [PCode.halt],
        ],
        "Array index out of range (6, 5).",
        { rangeCheckArrays: false },
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

  // [known bug] TODO.md 1.5: the message reads "invalid input state.code",
  // which is not a thing a student has. A `code` -> `state.code` rename swept
  // through this string literal as well as the identifiers; it should read
  // "invalid input code". The mangled text is asserted exactly, so fixing it
  // trips this test rather than passing silently.
  it("[known bug] TDET throws a rename-mangled message when given an out-of-range input code", () => {
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

  // [known bug] TODO.md 1.11: `MachineOptions.preventStackCollision` exists,
  // defaults to true, and is threaded from the Run menu through `program.ts`
  // into the machine - and nothing in `src/core/machine/` ever reads it. MEMC
  // bounds-checks the new frame against `options.stackSize` whatever the flag
  // says. Exactly 1.2's shape (`TEST` and `rangeCheckArrays`): a control the
  // student can turn off that changes nothing. Honouring it trips this test.
  it("[known bug] MEMC checks anyway when preventStackCollision is turned off", () => {
    expectError(
      [[PCode.ldin, 100], [PCode.stmt], [PCode.memc, 990, 5], [PCode.halt]],
      "Memory stack has overflowed into memory heap. Probable cause is unterminated recursion.",
      { stackSize: 100, preventStackCollision: false },
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

  it("throws when an instruction is short of the operands it declares", () => {
    // LDIN reads one operand, and there is no word after it to read - the
    // sibling of the jump above, and the reason `cycle.operand()` checks
    expectError([[PCode.ldin]], /run past the end of a line/);
  });

  it("throws when a pointer points outside main memory", () => {
    // LPTR dereferences the address on top of the stack; -1 is not one.
    // Before this was checked, main[-1] read `undefined` and turned every
    // sum downstream into NaN.
    expectError(
      [[PCode.ldin, -1], [PCode.lptr], [PCode.halt]],
      "Memory address out of range (-1).",
    );
  });

  it("throws when ROLL is given a depth the stack cannot reach", () => {
    // ROLL pops its own argument first, so this leaves nothing to rotate
    expectError(
      [[PCode.ldin, 1], [PCode.roll], [PCode.halt]],
      "Stack operation called on empty stack.",
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

  // [known bug] TODO.md 1.6 and 1.7, which meet in one test. `memory.copy`
  // dispatches to `copyForward`/`copyBackward`, which recurse once per word -
  // so a large CPTR blows the JavaScript call stack. Its own neighbour
  // `memory.zero` was made iterative for exactly this reason, and says so in
  // a comment ("recursion cannot survive" thousands of words); `copy` has the
  // identical exposure and contradicts it. The threshold is wherever V8's
  // stack happens to run out - around 12k-20k words on a typical machine, so
  // the length below is well past it in either direction.
  //
  // What the student then sees is the second bug: `execute()`'s catch does
  // `ports.output.notifyRuntimeError(error as Error)`, blind-casting an
  // `unknown`. An internal V8 `RangeError` is reported verbatim, exactly as
  // if it were an error in the student's own program. `MachineError` exists
  // and would let the two be told apart, but is never used to discriminate
  // and isn't exported from the barrel.
  //
  // Both assertions are what the code does, not what it should do. Making
  // `copy` iterative trips the first; discriminating on `MachineError` in the
  // catch trips the second.
  describe("[known bug] CPTR recurses per word, and the internal error leaks to the student", () => {
    const hugeCopy = (source: number, target: number): number[][] => [
      [PCode.ldin, source],
      [PCode.ldin, target],
      [PCode.ldin, 100000], // words - far past any plausible stack depth
      [PCode.cptr],
      [PCode.halt],
    ];

    it("overflows the call stack copying forward (target below source)", () => {
      const output = expectError(
        hugeCopy(700000, 600000),
        "Maximum call stack size exceeded",
      );
      // not a MachineError: an internal V8 error, surfaced unchanged
      assertEquals(output.runtimeErrors[0]?.constructor.name, "RangeError");
    });

    it("overflows the call stack copying backward (target above source)", () => {
      const output = expectError(
        hugeCopy(600000, 700000),
        "Maximum call stack size exceeded",
      );
      assertEquals(output.runtimeErrors[0]?.constructor.name, "RangeError");
    });

    it("copies without complaint at a length the recursion can survive", () => {
      // the contrast case: same operation, 1,000 words instead of 100,000
      const { output } = runPcode([
        [PCode.ldin, 42],
        [PCode.stvg, 600000],
        [PCode.ldin, 600000],
        [PCode.ldin, 700000],
        [PCode.ldin, 1000],
        [PCode.cptr],
        [PCode.halt],
      ]);
      assertEquals(output.runtimeErrors, []);
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
        output.runtimeErrors[0]?.message,
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
        output.runtimeErrors[0]?.message,
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
        output.runtimeErrors[0]?.message,
        "Stack operation called on empty stack.",
      );
      assertEquals(output.outputText, "");
    });
  });
});
