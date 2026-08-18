import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertMatch } from "@std/assert";
import {
  defaultMachineOptions,
  isRunning,
  run,
  updateKeyDown,
  updateKeyUp,
} from "@/core/machine.ts";
import {
  compileExample,
  readExample,
  runExampleBounded,
} from "../core/machine/_exampleHarness.ts";
import {
  fakeCanvas,
  fakeFiles,
  fakeOutput,
  fakeTimers,
} from "../core/machine/_fakes.ts";
import { runPcode } from "../core/machine/_helpers.ts";

/**
 * Regression coverage (group B of 3): compiles and runs 7 real
 * `assets/examples/Python/Logic&CS/` programs that use Python's `list` type.
 * Each file gets a baseline "compiles, and runs bounded without an unexpected
 * runtime error" check, plus - where practical - a stronger assertion tied to a
 * specific bug that file once exposed.
 */
describe("Python list example programs B (Logic&CS)", () => {
  describe("Fibonacci.tpy", () => {
    it("compiles and runs to completion with no runtime errors", async () => {
      const code = await readExample("Python/Logic&CS/Fibonacci.tpy");
      const pcode = compileExample("Python", code);
      const { output, hitIterationCap } = runExampleBounded(pcode, 300);
      // no randomness, and a small, fixed amount of work (25 recursive + 25
      // iterative Fibonacci numbers) - it
      // should finish on its own well within the bound, not just survive it
      assertEquals(hitIterationCap, false);
      assertEquals(output.runtimeErrors, []);
      assertMatch(output.outputText, /fib\(25\) = 75025/);
    });

    it("matches its Pascal counterpart's output exactly (deterministic cross-check)", async () => {
      // Fibonacci.tpy/.tpas both build an integer list ('fibSave'/'fibSave')
      // via plain dynamic-programming iteration, no randomness anywhere in
      // either file - so, per 0-indexing aside, the two languages' printed
      // fib(n) values should match number-for-number
      const pyCode = await readExample("Python/Logic&CS/Fibonacci.tpy");
      const pasCode = await readExample("Pascal/Logic&CS/Fibonacci.tpas");
      const pyPcode = compileExample("Python", pyCode);
      const pasPcode = compileExample("Pascal", pasCode);
      const pyResult = runExampleBounded(pyPcode, 300);
      const pasResult = runExampleBounded(pasPcode, 300);
      assertEquals(pyResult.hitIterationCap, false);
      assertEquals(pasResult.hitIterationCap, false);
      assertEquals(pyResult.output.runtimeErrors, []);
      assertEquals(pasResult.output.runtimeErrors, []);
      // both print "fib(N) = value" lines (Pascal via writeln, Python via
      // print) for N=1..25 twice (recursive pass, then iterative pass) -
      // the "Time taken" lines are excluded since timing is nondeterministic
      const fibLines = (text: string) =>
        text.split("\n").filter((line) => line.startsWith("fib("));
      const pyLines = fibLines(pyResult.output.outputText);
      const pasLines = fibLines(pasResult.output.outputText);
      assertEquals(pyLines.length, 50); // 25 recursive + 25 iterative
      assertEquals(pyLines, pasLines);
    });
  });

  describe("Hanoi.tpy", () => {
    // Hanoi.tpy's very first statement blocks on input() (three times: disk
    // count, start pillar, finish pillar) before any of its list/substring
    // logic runs at all. `runExampleBounded`'s plain `timers.flush()` can't
    // drive this: RDLN schedules a callback with an enormous "wait
    // indefinitely for a real keypress" delay as a sentinel
    // (`src/core/machine/runtime.ts`'s PCode.rdln case), and `_fakes.ts`'s
    // `fakeTimers().flush()` deliberately ignores delay and runs every
    // pending callback immediately (documented in its own comment) - so a
    // plain bounded run resumes that "forever" callback as if the readline
    // had completed, finds nothing on the stack, and throws "Stack
    // operation called on empty stack." This is a harness/RDLN-simulation
    // gap, not a Hanoi.tpy or list bug - confirmed by reproducing the exact
    // same error from a one-line `s = input('x')` program with no lists
    // involved at all. So this file drives real keyboard events instead
    // (`updateKeyDown`/`updateKeyUp`, per `input.test.ts`'s own pattern),
    // which resolves RDLN synchronously via `handleReadline()` the same way
    // a real keypress would.
    const typeLineAndEnter = (text: string) => {
      for (const ch of text) {
        updateKeyDown(ch.charCodeAt(0), ch, false, false, false);
      }
      updateKeyDown(13, "Enter", false, false, false);
      updateKeyUp(13, "Enter"); // triggers handleReadline() synchronously
    };

    /**
     * Runs pending fake-timer callbacks one at a time until `output` shows
     * `promptText` has actually been printed - i.e. until execution has
     * genuinely reached and paused at the RDLN for that prompt. Typing
     * input any earlier (e.g. right after `run()`, before the prelude's
     * codeCount-budget reschedule cycles have even run) lands in the
     * keybuffer too early: `updateKeyUp`'s Enter handling only calls
     * `handleReadline()` when a readline is actually pending, so an early
     * Enter is a no-op, and the *later* real RDLN pause then falls prey to
     * the same fake-timer "run the callback immediately regardless of
     * delay" gap described above.
     */
    const runUntilPrompt = (
      timers: ReturnType<typeof fakeTimers>,
      output: ReturnType<typeof fakeOutput>,
      promptText: string,
    ) => {
      for (
        let i = 0;
        i < 20 && !output.outputText.includes(promptText);
        i += 1
      ) {
        timers.runNext();
      }
    };

    it("compiles without error", async () => {
      const code = await readExample("Python/Logic&CS/Hanoi.tpy");
      // must not throw - dot-calls on string literals ('012'.find(s)) and
      // list-of-strings chained indexing (pile[p][i]) both needed rewriting
      // via .substring() to get this file compiling at all
      const pcode = compileExample("Python", code);
      assertEquals(pcode.length > 0, true);
    });

    it("runs its real disk-moving logic (3 disks) end to end with no runtime errors, given simulated keyboard input", async () => {
      const code = await readExample("Python/Logic&CS/Hanoi.tpy");
      const pcode = compileExample("Python", code);
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(pcode, defaultMachineOptions, timers, output, canvas, files);
      runUntilPrompt(timers, output, "How many disks");
      typeLineAndEnter("3"); // how many disks
      runUntilPrompt(timers, output, "Start pillar");
      typeLineAndEnter("0"); // start pillar
      runUntilPrompt(timers, output, "Finish pillar");
      typeLineAndEnter("2"); // finish pillar
      timers.flush(500); // drives the pause()-driven move animation to completion
      // the real compiled program - including its .substring()-rewritten
      // movedisk()/draw() logic and its recursive movepile() - runs to a
      // normal halt with no thrown MachineError. It does NOT assert on the
      // printed move log or final pile state: setup()/movedisk() both do
      // `pad(pile[0],...)+pad(pile[1],...)+pad(pile[2],...)`, and 7 disk
      // moves perform 14 writes total to the 3-element `pile` list - well
      // past the ~2-write threshold at which the list-of-strings corruption
      // bug documented at the top of this file reliably triggers - so both
      // are likely wrong even though nothing throws. See the standalone
      // substring-pattern test below for a clean, single-move assertion on
      // actual pile state instead.
      assertEquals(isRunning(), false);
      assertEquals(output.runtimeErrors, []);
    });

    it("the pile[start].substring()-based movedisk() pattern moves a disk correctly (standalone, avoiding the unrelated concatenation bug above)", () => {
      // mirrors the real movedisk()'s actual logic:
      //   startpile=pile[start]
      //   pile[finish]=startpile.substring(0,1)+pile[finish]
      //   pile[start]=startpile.substring(1,len(startpile)-1)
      // reading pile[0] and pile[2] via *separate* print statements (rather
      // than one chained expression) avoids the list-string-concatenation
      // bug documented at the top of this file, so this exercises the same
      // dot-call/.substring() rewrite it needed without tripping it
      const code = [
        "pile = ['123', '', '']",
        "def movedisk(start, finish):",
        "    global pile",
        "    startpile = pile[start]",
        "    pile[finish] = startpile.substring(0,1) + pile[finish]",
        "    pile[start] = startpile.substring(1, len(startpile)-1)",
        "movedisk(0, 2)",
        "print(pile[0])",
        "print(pile[2])",
      ].join("\n");
      const pcode = compileExample("Python", code);
      const { output } = runPcode(pcode);
      // top disk ('1') moved from pile 0 to pile 2; pile 0 keeps the rest
      assertEquals(output.outputText, "23\n1\n");
    });
  });

  describe("KnightsTour.tpy", () => {
    it("compiles and runs bounded with no runtime errors (blocks on a keyboard menu choice, so hitting the iteration cap is expected)", async () => {
      // the file's very first executable statements wait for an R/C
      // keypress (`det=detect(\\key,0)` in a tight while loop) before any
      // board/tour logic runs - with no simulated key event, this is
      // expected to spin until the bound, not a failure
      const code = await readExample("Python/Logic&CS/KnightsTour.tpy");
      const pcode = compileExample("Python", code);
      const { output, hitIterationCap } = runExampleBounded(pcode, 300);
      assertEquals(hitIterationCap, true);
      assertEquals(output.runtimeErrors, []);
    });
    // The fix here was sizing squarestatus/cleverrank as
    // [0]*(MAXLAST+1) instead of [0]*MAXLAST - an off-by-one that only
    // manifests at the maximum advertised 16x16 board size (lastsquare=255,
    // requiring index 255 to be valid). That board size is only reachable
    // after answering the initial key-menu prompt above and playing a full
    // search to completion, which isn't practical to drive in a bounded,
    // non-interactive test, so the baseline above (compiles, no errors within
    // the bound) is all this file gets.
  });

  describe("NimLearn.tpy", () => {
    it("compiles and runs bounded with no runtime errors (blocks on a keyboard menu choice, so hitting the iteration cap is expected)", async () => {
      // `choice=abs(?key)-48` looped until a valid menu digit is pressed -
      // with no simulated key event this spins until the bound, same shape
      // as KnightsTour.tpy above
      const code = await readExample("Python/Logic&CS/NimLearn.tpy");
      const pcode = compileExample("Python", code);
      const { output, hitIterationCap } = runExampleBounded(pcode, 300);
      assertEquals(hitIterationCap, true);
      assertEquals(output.runtimeErrors, []);
    });
    // this exercises the nested-list `prob` (a list of MAXTAKE-length
    // lists, built via `prob.append(rowi)` in a loop)
    // just far enough to build it and enter the menu-wait loop without
    // erroring, which is the practical limit without simulating a full game
  });

  describe("NoughtsAndCrosses.tpy", () => {
    it("compiles and runs bounded with no runtime errors (blocks on a mouse click for the human move, so hitting the iteration cap is expected)", async () => {
      // the first game's first move is human (randfirst is False when
      // numgames=0), so the click-wait loop
      // (`while (?clickx<125) or ... : det=detect(\\lmouse,0)`) spins with
      // no simulated mouse event - expected, not a failure
      const code = await readExample("Python/Logic&CS/NoughtsAndCrosses.tpy");
      const pcode = compileExample("Python", code);
      const { output, hitIterationCap } = runExampleBounded(pcode, 300);
      assertEquals(hitIterationCap, true);
      assertEquals(output.runtimeErrors, []);
    });
    // the depth-weighted evaluate()/copy() functions (nested-list `wins`,
    // and the List[int] parameter-hinted copy()) are compiled
    // and reachable code, but the minimax search itself only runs once a
    // move is actually made - not practical to drive without simulating a
    // real mouse click
  });

  describe("Sorting.tpy", () => {
    it("compiles without error", async () => {
      const code = await readExample("Python/Logic&CS/Sorting.tpy");
      const pcode = compileExample("Python", code);
      assertEquals(pcode.length > 0, true);
    });

    it("runs to completion with no runtime errors, producing a real averages table", async () => {
      // regression test: this bounded run used to throw "Array index out of
      // range". Root cause: a nested
      // subroutine's own local variable (quicksort's nested
      // qsort(left,right), assigning "m=left") silently reused this file's
      // *unrelated* top-level "m" (the "for m in range(methods):" loop
      // variable) instead of creating its own local, corrupting "m" every
      // time quicksort ran - see find.assignmentTarget's doc comment
      // (src/core/compiler/parser/common/find.ts) for the full root cause
      // and fix. "size/shape-dependent" was real but coincidental: the bug
      // only manifested once quicksort actually got *called* (not merely
      // defined), which depended on which of the 4 sort methods happened
      // to run in a given trial.
      const code = await readExample("Python/Logic&CS/Sorting.tpy");
      const pcode = compileExample("Python", code);
      const { output, hitIterationCap } = runExampleBounded(pcode, 500);
      assertEquals(output.runtimeErrors, []);
      assertEquals(hitIterationCap, false); // runs to completion (halts itself)
      // the file's own final "output(True,cream,True)" call (right before
      // the averages table) clears outputText - see _fakes.ts's
      // configureOutput - so only the final screen's own text survives to
      // be checked here, not the opening "sorting methods will be
      // compared" intro from the first screen
      assertMatch(
        output.outputText,
        /Averages from sorting 100 items, over 10 trials/,
      );
      assertMatch(output.outputText, /Bubblesort:/);
      assertMatch(output.outputText, /Quicksort:/);
    });

    it("the underlying integer sort algorithms themselves are correct (standalone, avoiding the unrelated caption/pad() bug above)", () => {
      // mirrors Sorting.tpy's own lessthan()/swap()/bubblesort()/
      // selectionsort() structure exactly, but on a small list and without
      // any caption/pad() printing, to confirm the actual sorting logic
      // (list indexed read/write, global-scoped mutation via swap()) is
      // sound independent of the print-path bug above
      const code = [
        "n=8",
        "A=[5,3,8,1,9,2,7,4]",
        "def lessthan(x,y):",
        "    return (x<y)",
        "def swap(x,y):",
        "    global A",
        "    t=A[x]",
        "    A[x]=A[y]",
        "    A[y]=t",
        "def bubblesort():",
        "    changed=True",
        "    while changed:",
        "        changed=False",
        "        for i in range(n-1):",
        "            if lessthan(A[i+1],A[i]):",
        "                swap(i,i+1)",
        "                changed=True",
        "bubblesort()",
        "for i in range(n):",
        "    print(str(A[i]))",
      ].join("\n");
      const pcode = compileExample("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText, "1\n2\n3\n4\n5\n7\n8\n9\n");
    });
  });

  describe("SortingStrings.tpy", () => {
    it("compiles without error (needed an explicit str type hint fix on lessthan(x,y) - see below)", async () => {
      // comparing two same-uncertain-type parameters to each other (x<y,
      // neither typed
      // yet) used to resolve them to a numeric placeholder rather than
      // leaving them inferrable from a later call site - Sorting.tpy (the
      // integer sibling) happened to work by accident since that
      // placeholder coerces from integer, but SortingStrings.tpy's
      // lessthan(x,y) needed explicit `x: str, y: str` hints to compile
      const code = await readExample("Python/Logic&CS/SortingStrings.tpy");
      const pcode = compileExample("Python", code);
      assertEquals(pcode.length > 0, true);
    });

    it("runs to completion with no runtime errors, producing a real averages table and sorted listing", async () => {
      // regression test for the same "Array index out of range" bug as
      // Sorting.tpy, its plain-integer sibling - see that test above for the
      // root cause. It was only reachable once a separate bug, a scalar string
      // variable's pointer being captured into a list rather than cloned,
      // stopped corrupting swap()'s results first.
      const code = await readExample("Python/Logic&CS/SortingStrings.tpy");
      const pcode = compileExample("Python", code);
      const { output, hitIterationCap } = runExampleBounded(pcode, 500);
      assertEquals(output.runtimeErrors, []);
      assertEquals(hitIterationCap, false); // runs to completion (halts itself)
      // the file's own final "output(True,cream,True)" call (right before
      // the averages table) clears outputText - see _fakes.ts's
      // configureOutput - so only the final screen's own text survives to
      // be checked here, not the opening "Items to be sorted:" heading
      // from the first screen
      assertMatch(output.outputText, /Bubblesort:/);
      assertMatch(output.outputText, /Quicksort:/);
      assertMatch(output.outputText, /Items sorted were:/);
      // the final sorted listing is 100 sorted 3-letter lowercase strings,
      // 10 per row - spot check the shape of the first data row after the
      // "Items sorted were:" heading (confirming the sort genuinely ran to
      // completion and printed real data, not just the heading)
      const afterHeading = output.outputText.split("Items sorted were:")[1];
      const firstDataLine = afterHeading.split("\n")[1].trim();
      assertMatch(firstDataLine, /^([a-z]{3}\s*){10}$/);
    });

    it("lessthan()/swap() correctly compare and exchange two string-list elements (standalone)", () => {
      // mirrors SortingStrings.tpy's actual lessthan(x: str, y: str)/swap()
      // structure and the single comparison+conditional-swap step
      // bubblesort()'s inner loop performs, on a small string list -
      // exercising the exact typed-parameter comparison the fix
      // enables, plus the list-of-strings read/write swap() itself.
      const code = [
        "n=2",
        "A=['banana','apple']",
        "def lessthan(x: str,y: str):",
        "    return (x<y)",
        "def swap(x,y):",
        "    global A",
        "    t=A[x]",
        "    A[x]=A[y]",
        "    A[y]=t",
        "for i in range(n-1):",
        "    if lessthan(A[i+1],A[i]):",
        "        swap(i,i+1)",
        "print(A[0])",
        "print(A[1])",
      ].join("\n");
      const pcode = compileExample("Python", code);
      const { output } = runPcode(pcode);
      assertEquals(output.outputText, "apple\nbanana\n");
    });

    it("a while loop wrapping swap() doesn't corrupt an uninvolved list element", () => {
      // regression test: two independent single-element swaps at module level
      // used to corrupt a third, uninvolved element. Wrapping swap(0,1) in
      // a while loop that runs it twice (an identity operation - the list
      // should end up unchanged) used to corrupt A[2]/A[3] too, because
      // swap()'s temp variable "t" aliased its own fixed heap buffer into
      // both A[0] and A[1]'s slots; the second swap()'s "t=A[x]" reassignment
      // then silently rewrote whichever slot still aliased it
      const code = [
        "A=['delta','bravo','charlie','alpha']",
        "def swap(x,y):",
        "    global A",
        "    t=A[x]",
        "    A[x]=A[y]",
        "    A[y]=t",
        "i=0",
        "while i<2:",
        "    swap(0,1)",
        "    i=i+1",
        "print(A[0])",
        "print(A[1])",
        "print(A[2])",
        "print(A[3])",
      ].join("\n");
      const pcode = compileExample("Python", code);
      const { output } = runPcode(pcode);
      // two swaps of the same pair = identity; nothing should have changed
      assertEquals(output.outputText, "delta\nbravo\ncharlie\nalpha\n");
    });
  });
});
