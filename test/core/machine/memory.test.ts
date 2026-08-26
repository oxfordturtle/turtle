import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import { encode, lexify, parse, tokenize } from "@/core/compiler.ts";
import { defaultMachineOptions, dump, run } from "@/core/machine.ts";
import { fakeCanvas, fakeFiles, fakeOutput, fakeTimers } from "./lib/fakes.ts";
import { PCode, runPcode, str } from "./lib/helpers.ts";

/**
 * Coverage for `src/core/machine/memory.ts`'s `dump()`, driven entirely by
 * running real compiled programs through `@/core/machine.ts`'s `run()`:
 * `memory.ts` is never imported directly, per the barrel-only rule.
 *
 * `dump()` returns `{ stack, heap, heapBase }`:
 * - `stack` is `main[0 .. stackTop]` - the "variable stack" region a real
 *   program's startup code and STMT/MEMC calls grow as it allocates globals
 *   and call frames.
 * - `heap` is `main[heapBase+1 .. heapMax]` - where heap-allocated strings
 *   (and, once implemented, lists) live.
 * - `heapBase` is `options.stackSize` (the boundary between the two regions).
 *
 * `heapClear()` is reached from `runtime.ts`'s HCLR case, gated on
 * `options.activateHCLR` - which defaults to `true`, so the gate is open in
 * every ordinary run. (An older version of this comment described that case
 * as a commented-out no-op; it no longer is.) `heapClear()` defers to
 * `heapClearPending` whenever the evaluation stack is non-empty, and
 * `delayedHeapClear()` at the top of `execute()` consumes it. That flag is
 * the one piece of module state `init()` does not reset - see the pinned
 * `[known bug]` at the bottom of this file.
 */
describe("machine/memory: dump()", () => {
  const compileAndRun = (
    code: string,
    optionsOverrides: Partial<typeof defaultMachineOptions> = {},
  ) => {
    const tokens = tokenize(code, "Python");
    const lexemes = lexify(tokens, "Python");
    const program = parse(lexemes, "Python");
    const pcode = encode(program);
    const timers = fakeTimers();
    const output = fakeOutput();
    const canvas = fakeCanvas();
    const files = fakeFiles();
    const options = { ...defaultMachineOptions, ...optionsOverrides };
    run(pcode, options, timers, output, canvas, files);
    timers.flush();
    return { output, canvas };
  };

  it("heapBase is exactly options.stackSize", () => {
    compileAndRun("x = 1", { stackSize: 12345 });
    assertEquals(dump().heapBase, 12345);
  });

  it("the stack region grows to hold global variables a real program assigns", () => {
    compileAndRun("x = 42\ny = 7");
    const { stack } = dump();
    assert(stack.length > 1);
    assert(stack.includes(42));
    assert(stack.includes(7));
  });

  it("the heap region holds string data a real program creates", () => {
    compileAndRun('print("hi")');
    const { heap } = dump();
    // heap strings are laid out as [length, ...charCodes] - see memory.ts's makeHeapString
    const start = heap.indexOf(2);
    assert(start >= 0);
    assertEquals(heap.slice(start, start + 3), [2, 104, 105]);
  });

  it("a program that creates a string ends up with a bigger heap than one that doesn't", () => {
    // NB: the heap is never literally empty for a real compiled program -
    // every program's startup code allocates a keyboard input buffer there
    // (see programStart.ts's BUFR call) regardless of what the source does
    compileAndRun("x = 42");
    const heapWithoutString = dump().heap.length;

    compileAndRun('x = 42\nprint("hi")');
    const heapWithString = dump().heap.length;

    assert(heapWithString > heapWithoutString);
  });

  it("the DUMP command (dump()) surfaces exactly the memory dump() itself returns", () => {
    const { output } = compileAndRun("x = 42\ndump()");
    assertEquals(output.memoryDumps.length, 1);
    assertEquals(output.memoryDumps[0], dump());
  });

  it("selects the memory tab on DUMP when showMemoryOnDump is set (the default)", () => {
    const { output } = compileAndRun("dump()", { showMemoryOnDump: true });
    assert(output.tabs.includes("memory"));
  });
});

/**
 * `getHeapString`'s temp-space reclaim - the rule that reading a temporary
 * heap string frees it, and everything allocated after it. That is what
 * keeps a loop building intermediate strings from exhausting the heap, so
 * it can't simply be dropped; but it used to fire one string too early,
 * catching the last *permanent* heap string (whose final character sits
 * exactly at `heapPerm`) as well.
 *
 * Consequence: any expression that read the most recently promoted heap
 * string twice, with an allocation in between, had the second read's result
 * written over the first's. Found via
 * `Logic&CS/TuringMachines.tpy`, which hits it for real - two of its five
 * machines
 * mis-analysed their transition tables.
 *
 * Tested through printed output rather than `dump()`: what matters is the
 * value the program computes, and pinning heap addresses would freeze the
 * allocator's layout rather than the rule.
 */
describe("machine/memory: heap temp-space reclaim", () => {
  const outputOf = (code: string): string => {
    const pcode = encode(
      parse(lexify(tokenize(code, "Python"), "Python"), "Python"),
    );
    const timers = fakeTimers();
    const output = fakeOutput();
    run(
      pcode,
      defaultMachineOptions,
      timers,
      output,
      fakeCanvas(),
      fakeFiles(),
    );
    timers.flush();
    return output.outputText.replace(/\s+$/, "");
  };

  it("keeps both halves when one heap string is sliced twice in one expression", () => {
    // t[0] is the last thing promoted onto the permanent heap here, which
    // is exactly the case that used to break - this printed "efef"
    assertEquals(outputOf("t=['bcef']\nprint(t[0][: 1]+t[0][2:])"), "bef");
  });

  it("gives the same answer when the string is NOT the last permanent one", () => {
    // the control: a later permanent allocation moved heapPerm past t[0],
    // so this spelling always worked, and must still
    assertEquals(
      outputOf("t=['bcef','zzzzzzzzzz']\nprint(t[0][: 1]+t[0][2:])"),
      "bef",
    );
  });

  it("rebuilds a list element from two slices of itself (TuringMachines' own shape)", () => {
    assertEquals(
      outputOf("t=['bcef']\nt[0]=t[0][: 1]+'A'+t[0][2:]\nprint(t[0])"),
      "bAef",
    );
  });

  it("doesn't grow the heap across iterations of a string-building loop", () => {
    // This is the property the reclaim rules exist to give, so it's worth
    // pinning - but note it's HCLR, emitted at the end of every pcode line
    // that made a heap string (encoder/encode.ts), that actually delivers
    // it, not getHeapString above. Measured, not assumed: with
    // getHeapString's reclaim disabled entirely these two numbers barely
    // move, which is why there's no test here claiming otherwise.
    const heapAfter = (iterations: number): number => {
      outputOf(
        `x=''\nfor i in range(${iterations}):\n    x='abc'+str(i)+'def'\nprint(x)`,
      );
      return dump().heap.length;
    };
    const shortRun = heapAfter(100);
    const longRun = heapAfter(1000);
    assert(longRun < shortRun * 2, `${shortRun} -> ${longRun}`);
  });

  it("leaves a plain string variable's own slicing unaffected", () => {
    assertEquals(outputOf("s='bcef'\nprint(s[: 1]+'A'+s[2:])"), "bAef");
  });
});

/**
 * `memory.init()` resets six of the module's seven private `let`s. The
 * seventh, `heapClearPending`, is not in the list - and the list is
 * hand-maintained against the declarations directly above it, so nothing
 * would catch the omission.
 *
 * That flag is reachable: HCLR with a non-empty evaluation stack sets it (see
 * runtime.test.ts's deferred-clear test), and `options.activateHCLR` defaults
 * to `true`. A program that halts before the next `execute()` therefore ends
 * with the flag still raised, and it survives into the following `run()`.
 *
 * It happens to be harmless today, and that is exactly what is pinned below:
 * `delayedHeapClear()` consumes the stale flag on the new run's very first
 * `execute()`, at which point `init()` has just set `heapTemp === heapPerm`,
 * so the clear it performs is a no-op. The margin is one instruction - any
 * change that allocates on the heap before the first `delayedHeapClear()`,
 * or that defers the flag past it, turns a latent bug into a live one, and
 * trips this test.
 */
describe("machine/memory: [known bug] init() does not reset heapClearPending", () => {
  // leaves the flag raised: HCLR runs with 1 still on the stack, so the
  // clear is deferred, and the program halts before any second execute()
  const leaveClearPending = (): void => {
    runPcode([[PCode.ldin, 1], [PCode.hclr], [PCode.halt]]);
  };

  // allocates a permanent heap string and then a temporary one, so its dump
  // would visibly lose the temporary half to an unwanted heap clear
  const allocator = (): number[][] => [
    str("hi"),
    [PCode.hfix],
    str("there"),
    [PCode.halt],
  ];

  it("the flag survives the run, but the next run is unaffected by it", () => {
    runPcode(allocator());
    const fromClean = dump();

    leaveClearPending();
    runPcode(allocator());
    const afterStaleFlag = dump();

    assertEquals(afterStaleFlag, fromClean);
    // and the heap really does hold both strings, so the comparison above
    // isn't two identically-empty dumps agreeing with each other
    assertEquals(
      afterStaleFlag.heap,
      [2, 104, 105, 5, 116, 104, 101, 114, 101],
    );
  });
});
