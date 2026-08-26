import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertFalse, assertMatch } from "@std/assert";
import { isRunning, type MachineOptions } from "@/core/machine.ts";
import { type FakeFiles, fakeFiles } from "./lib/fakes.ts";
import { PCode, runFilePcode, runPcode, runToInt, str } from "./lib/helpers.ts";

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
      // The three arms of TODO.md 1.1, fixed: they used to guard their
      // operands with an `if` and no `else`, so where every other operator
      // threw, these fell through and carried on. They are enumerated here
      // even though they are now structurally ordinary pops and peeks,
      // because a re-introduction of that omission would otherwise be
      // invisible: V8 emits no branch range for an `if` whose body runs on
      // every execution of its arm, so no BRDA pair is generated and the
      // untaken false path is never counted as a miss - the 100% gate simply
      // cannot see it.
      ["mixc", "pops four, and used to fall through instead", []],
      ["test", "peeks two, and used to fall through instead", []],
      ["cons", "pops two, and used to fall through instead", []],
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

    // The partly-filled half of TODO.md 1.1. MIXC and CONS pop several
    // operands and TEST peeks two, so a stack holding *some* of what they
    // want reaches the guard on a later read rather than the first one - the
    // case the table above cannot express. All three used to carry on
    // regardless; CONS was missed when the bug was first recorded, and found
    // in Phase 2 while sweeping the guards.
    describe("MIXC, TEST and CONS on a partly filled stack", () => {
      it("MIXC given only two of its four operands throws", () => {
        expectError(
          [[PCode.ldin, 1], [PCode.ldin, 2], [PCode.mixc], [PCode.halt]],
          "Stack operation called on empty stack.",
        );
      });

      it("TEST given only one of its two operands throws", () => {
        expectError(
          [[PCode.ldin, 500], [PCode.test], [PCode.halt]],
          "Stack operation called on empty stack.",
        );
      });

      it("CONS given only one of its two operands throws", () => {
        expectError(
          [[PCode.ldin, 1], [PCode.cons], [PCode.halt]],
          "Stack operation called on empty stack.",
        );
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
    // Both messages were placeholders ("String is not a character." and "Not
    // found."), each carrying its own `TODO: better error message` - TODO.md
    // 1.3, fixed. The replacements follow the house style: a full sentence,
    // with the offending detail in parentheses where there is one. ERNF has
    // none to give: it peeks the *index* LIDX pushed, not the value that was
    // looked for, so it cannot name it. The exact strings are asserted, since
    // they are what a student reads.
    it("CTST reports the length when the string isn't exactly one character", () => {
      expectError(
        [[PCode.lstr, 2, 104, 105], [PCode.ctst], [PCode.halt]],
        "String is not a single character (length 2).",
      );
    });

    it("ERNF reports a value that was looked for and not found", () => {
      expectError(
        [[PCode.ldin, -1], [PCode.ernf], [PCode.halt]],
        "Value not found in the list.",
      );
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

    // TODO.md 1.2, fixed: the arm carried a `TODO: make range check a runtime
    // option` comment while `MachineOptions.rangeCheckArrays` already existed,
    // defaulted to true, and was threaded from the Run menu through
    // `program.ts` into the machine - TEST simply never consulted it. Off now
    // means no check at all: the index is used as given and whatever happens,
    // happens, which is the point of offering it (see TODO.md 1.2, and 1.11
    // for the same decision on the memory stack).
    it("skips the check when rangeCheckArrays is turned off", () => {
      // the same out-of-range index as the test above, which throws with the
      // option left on
      const { output } = runPcode(
        [
          [PCode.ldin, 5],
          [PCode.stvg, 500],
          [PCode.ldin, 6],
          [PCode.ldin, 500],
          [PCode.test],
          [PCode.ldin, 7],
          [PCode.itos],
          [PCode.writ],
          [PCode.halt],
        ],
        { rangeCheckArrays: false },
      );
      assertEquals(output.runtimeErrors, []);
      assertEquals(output.outputText, "7");
    });

    it("still reports a short stack when rangeCheckArrays is turned off", () => {
      // the operand guard is not the range check: TEST reads both values
      // either way, so a program that never pushed them is still wrong
      expectError(
        [[PCode.test], [PCode.halt]],
        "Stack operation called on empty stack.",
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

  // The message used to read "invalid input state.code", which is not a thing
  // a student has: a `code` -> `state.code` rename swept through this string
  // literal as well as the identifiers (TODO.md 1.5, fixed). Asserted exactly,
  // since it is what a student reads.
  it("TDET throws when given an out-of-range input code", () => {
    expectError(
      [[PCode.ldin, 999], [PCode.ldin, 0], [PCode.tdet], [PCode.halt]],
      "Detect called with invalid input code: 999.",
    );
  });

  it("MEMC throws when the new frame would overflow the stack size", () => {
    expectError(
      [[PCode.ldin, 100], [PCode.stmt], [PCode.memc, 990, 5], [PCode.halt]],
      "Memory stack has overflowed into memory heap. Probable cause is unterminated recursion.",
      { stackSize: 100 },
    );
  });

  // TODO.md 1.11, fixed: MEMC bounds-checked the new frame against
  // `options.stackSize` whatever `options.preventStackCollision` said - a
  // control the student could turn off that changed nothing. Off now means the
  // frame is allocated anyway, and the memory stack grows into the heap:
  // deliberate rope for an advanced student trying to hack the machine, and
  // the same decision as 1.2's, whose consequences are worse (every heap
  // pointer already handed out sits above `heapBase`).
  it("allocates the frame anyway when preventStackCollision is turned off", () => {
    const { output } = runPcode(
      [
        [PCode.ldin, 100],
        [PCode.stmt],
        [PCode.memc, 990, 5],
        [PCode.ldin, 7],
        [PCode.itos],
        [PCode.writ],
        [PCode.halt],
      ],
      { stackSize: 100, preventStackCollision: false },
    );
    assertEquals(output.runtimeErrors, []);
    assertEquals(output.outputText, "7");
  });

  it("still reports an empty memory stack when preventStackCollision is turned off", () => {
    // as with TEST above, the operand guard is not the check being turned off
    expectError(
      [[PCode.memc, 990, 5], [PCode.halt]],
      "Stack operation called on empty stack.",
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

  // TODO.md 1.6, fixed. `memory.copy` dispatches to `copyForward`/
  // `copyBackward`, which used to recurse once per word: a large CPTR blew the
  // JavaScript call stack, at wherever V8 ran out - around 12k-20k words on a
  // typical machine. Both are loops now, like their neighbour `memory.zero`,
  // whose own comment says recursion "cannot survive" thousands of words. The
  // 100,000 words below are far past any plausible stack depth in either
  // direction, so a recursion coming back trips these.
  describe("CPTR copies a range far larger than any recursion could", () => {
    const hugeCopy = (source: number, target: number): number[][] => [
      [PCode.ldin, 42],
      [PCode.stvg, source],
      [PCode.ldin, source],
      [PCode.ldin, target],
      [PCode.ldin, 100000], // words
      [PCode.cptr],
      [PCode.ldvg, target],
      [PCode.itos],
      [PCode.writ],
      [PCode.halt],
    ];

    it("copying forward (target below source)", () => {
      const { output } = runPcode(hugeCopy(700000, 600000));
      assertEquals(output.runtimeErrors, []);
      assertEquals(output.outputText, "42");
    });

    it("copying backward (target above source)", () => {
      const { output } = runPcode(hugeCopy(600000, 700000));
      assertEquals(output.runtimeErrors, []);
      assertEquals(output.outputText, "42");
    });
  });

  // TODO.md 1.7, fixed. `execute()`'s catch used to hand whatever it caught
  // straight to `notifyRuntimeError`, blind-casting an `unknown` to `Error`:
  // an internal fault - a V8 error, or a rejection from one of the port
  // adapters - reached the student verbatim, exactly as if it were an error in
  // their own program. Every error the machine itself raises is a
  // `MachineError`, so that is now the discriminator: a `MachineError` is
  // reported unchanged, and anything else is wrapped in one that says whose
  // fault it isn't.
  //
  // This used to be pinned through TODO.md 1.6's stack overflow, which was the
  // live example of an internal error; fixing that removed it, so the tests
  // below reach the same path through a port adapter instead - the only way in
  // that remains, now that nothing in the machine throws a non-MachineError.
  describe("internal errors are told apart from the student's own", () => {
    const openARejectingFile = (rejectWith: unknown) => {
      const rejectingFiles: FakeFiles = {
        ...fakeFiles(),
        openFile: () => Promise.reject(rejectWith),
      };
      return runFilePcode(
        [str("a.txt"), [PCode.ldin, 3], [PCode.open], [PCode.halt]],
        {},
        rejectingFiles,
      );
    };

    it("reports an error in the student's own program unchanged", () => {
      const output = expectError(
        [[PCode.plus], [PCode.halt]],
        "Stack operation called on empty stack.",
      );
      assertEquals(output.runtimeErrors[0]?.constructor.name, "MachineError");
    });

    it("wraps an adapter's Error, saying it is not the program's fault", async () => {
      const { output } = await openARejectingFile(new Error("disk exploded"));
      assertEquals(output.runtimeErrors.length, 1);
      assertEquals(
        output.runtimeErrors[0]?.message,
        "Something has gone wrong inside the Turtle machine (disk exploded). This is not an error in your program.",
      );
      // wrapped in a MachineError, so an adapter can still tell what it has
      assertEquals(output.runtimeErrors[0]?.constructor.name, "MachineError");
      assertFalse(isRunning());
    });

    it("wraps a rejection that isn't an Error at all", async () => {
      const { output } = await openARejectingFile("just a string");
      assertEquals(
        output.runtimeErrors[0]?.message,
        "Something has gone wrong inside the Turtle machine (just a string). This is not an error in your program.",
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
