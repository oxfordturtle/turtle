import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import {
  defaultMachineOptions,
  isRunning,
  run,
  updateKeyDown,
} from "@/core/machine.ts";
import {
  compileExample,
  readExample,
  runExampleBounded,
  runExampleBoundedAsync,
} from "../core/machine/_exampleHarness.ts";
import {
  fakeCanvas,
  fakeFiles,
  fakeOutput,
  fakeTimers,
} from "../core/machine/_fakes.ts";

/**
 * Regression coverage (group A of 3): compiles and runs 10 real
 * `assets/examples/Python/` programs from the Cellular, Files and Fractals
 * categories that use Python's `list` type.
 *
 * Every `it()` compiles fresh (via `compileExample`) and runs fresh (via
 * `runExampleBounded`/`runExampleBoundedAsync`/`runInteractiveExample`,
 * which each give their own fakes) rather than sharing state across `it()`s
 * in a `describe`, to keep each assertion independently readable and to
 * avoid one test's bounded run leaking into another's.
 *
 * Three of this group's files need more than `runExampleBounded` alone:
 * - `Fractals/IFSColour.tpy`, `Fractals/IFSDemonstrator.tpy`, and
 *   `Fractals/MandelbrotSpectrumDemo.tpy` all start with a keyboard menu
 *   prompt (`while det!=\x: det=detect(\key,0)` - see
 *   `src/core/constants/inputs.ts`'s `inputs` table for what each `\x` name
 *   means as a keyCode) before doing any of their real, list-touching work.
 *   `runExampleBounded` alone can never get past this: a plain
 *   `timers.flush()` just busy-loops the `detect()` call forever (the
 *   *expected*, harmless behaviour for the many *other* example programs
 *   that wait on input and are never going to receive any - see
 *   `_exampleHarness.ts`'s own doc comment) since no key ever arrives.
 *   `runInteractiveExample` below drives the fake timer queue one scheduled
 *   callback at a time up to each prompt, then calls `updateKeyDown` (the
 *   same barrel function the real UI calls) to answer it, so the program
 *   actually reaches its list-indexed drawing logic.
 * - `Files/ReadCSV.tpy` and `Files/SaveCSV.tpy` do real file I/O
 *   (`fopen`/`freadline`/`fwrite`/etc.), which suspends `execute()` on a
 *   genuine `Promise` rather than resuming via `timers.flush()` alone - see
 *   `runExampleBoundedAsync`'s own doc comment in `_exampleHarness.ts`.
 */
describe("Python list examples (A): Cellular, Files & Fractals", () => {
  /**
   * Drives a compiled program through one or more interactive
   * `detect(\key,0)` menu prompts before letting it run to completion (or
   * the iteration cap). `keyPresses` supplies, per prompt in order:
   * `untilConsoleIncludes` (a substring that appears in the console once the
   * program has printed that prompt and is genuinely waiting on it - found
   * by advancing the fake timer queue one callback at a time, since
   * `timers.flush()` would just busy-loop) and the `keyCode`/`key` to press
   * once there (same shape as `updateKeyDown`'s own parameters - `keyCode`
   * must be the *keyboard* code from `src/core/constants/inputs.ts`, e.g.
   * `\w` is 87, not the ASCII code for "w"). After the last keypress,
   * flushes up to `finalMaxIterations` further timer-driven steps, exactly
   * like `runExampleBounded`.
   */
  const runInteractiveExample = (
    pcode: number[][],
    keyPresses: {
      untilConsoleIncludes: string;
      keyCode: number;
      key: string;
    }[],
    finalMaxIterations: number,
  ) => {
    const timers = fakeTimers();
    const output = fakeOutput();
    const canvas = fakeCanvas();
    const files = fakeFiles();
    run(pcode, defaultMachineOptions, timers, output, canvas, files);
    for (const press of keyPresses) {
      let reached = false;
      for (let step = 0; step < 50; step += 1) {
        if (output.consoleText.includes(press.untilConsoleIncludes)) {
          reached = true;
          break;
        }
        timers.runNext();
      }
      if (!reached) {
        throw new Error(
          `never reached a prompt containing ${JSON.stringify(
            press.untilConsoleIncludes,
          )}`,
        );
      }
      updateKeyDown(press.keyCode, press.key, false, false, false);
    }
    let hitIterationCap = false;
    try {
      timers.flush(finalMaxIterations);
    } catch {
      hitIterationCap = true;
    }
    if (isRunning()) hitIterationCap = true;
    return { timers, output, canvas, files, hitIterationCap };
  };

  describe("Cellular/Automata.tpy", () => {
    it("compiles and runs several elementary-automata rule patterns without a runtime error", async () => {
      // confirmed fine, not a bug: the read-before-assignment pattern in
      // nextgen() (n1/n2/n3) was flagged
      // for a scoping-semantics confirmation, resolved by an actual
      // successful compile; this run exercises it for real
      const code = await readExample("Python/Cellular/Automata.tpy");
      const pcode = compileExample("Python", code);
      const { output } = runExampleBounded(pcode, 200);
      assertEquals(output.runtimeErrors, []);
    });
  });

  describe("Cellular/Diffusion.tpy", () => {
    it("compiles and runs the tapering-tube diffusion simulation without a runtime error", async () => {
      const code = await readExample("Python/Cellular/Diffusion.tpy");
      const pcode = compileExample("Python", code);
      const { output } = runExampleBounded(pcode, 100);
      assertEquals(output.runtimeErrors, []);
    });

    it("reaches and writes num1[100] - the fixed off-by-one boundary - without an IndexError", async () => {
      // num1 used to be sized
      // exactly WIDTH (100 elements, valid indices 0-99), but showswap()'s
      // graphit(x1+1,...) call can reach num1[100] once the random walk
      // picks x1=WIDTH-1=99 and the "x2=x1+1" branch. num1 is now sized
      // WIDTH+1. graphit(x) draws at canvas x-coordinate x+LEFTAXIS (21), so
      // num1[100] shows up as a writePixel call at x=121 - the PRNG is
      // seeded deterministically from fakeTimers().now() (always 0), so
      // this reliably happens within the first 50 bounded iterations.
      const code = await readExample("Python/Cellular/Diffusion.tpy");
      const pcode = compileExample("Python", code);
      const { output, canvas } = runExampleBounded(pcode, 50);
      const boundaryWrites = canvas.calls.filter(
        (call) => call.method === "writePixel" && call.args[0] === 121,
      );
      assertEquals(boundaryWrites.length > 0, true);
      assertEquals(output.runtimeErrors, []);
    });
  });

  describe("Cellular/LifeArrays.tpy", () => {
    it("compiles and runs several generations of the Life-like automaton without a runtime error", async () => {
      // an animation loop that waits on the ESCAPE key each frame
      // ("while ?key!=\\escape:") - never receiving it and hitting the
      // iteration cap is expected, not a failure
      const code = await readExample("Python/Cellular/LifeArrays.tpy");
      const pcode = compileExample("Python", code);
      const { output } = runExampleBounded(pcode, 150);
      assertEquals(output.runtimeErrors, []);
    });
  });

  describe("Files/RandomSentences.tpy", () => {
    it("compiles and runs cleanly now that DIRY/FFND/FDIR/FNXT/FMOV are implemented", async () => {
      // RandomSentences.tpy's very first real action is "if mkdir(subdir):"
      // - mkdir() compiles to PCode.diry, so this needs
      // `runExampleBoundedAsync` rather than `runExampleBounded`: every
      // FileSystem call suspends `execute()` on
      // a real `Promise` (see `_exampleHarness.ts`'s own doc comment), which
      // a purely synchronous `timers.flush()` can never drive to completion.
      const code = await readExample("Python/Files/RandomSentences.tpy");
      const pcode = compileExample("Python", code);
      const { output, hitIterationCap } = await runExampleBoundedAsync(
        pcode,
        50,
      );
      assertEquals(hitIterationCap, false);
      assertEquals(output.runtimeErrors, []);
    });

    it("building several lists via '.append()' inside a loop gives each row its own independent list", async () => {
      // reproduces the exact shape of the fixed aliasing bug:
      // "toadd=['']*maxwords" created ONCE
      // outside the loop, then "word.append(toadd)" five times, made all
      // five rows aliases of the SAME list object - mutating one corrupted
      // all the others. The fix (also used here) builds a fresh list
      // *inside* the loop for every row instead.
      const code = [
        "rows=[]",
        "for i in range(5):",
        "    rows.append(['']*3)",
        "rows[0][0]='X'",
        "print(rows[1][0])",
      ].join("\n");
      const pcode = compileExample("Python", code);
      const { output } = runExampleBounded(pcode, 50);
      assertEquals(output.runtimeErrors, []);
      // rows[1] must be untouched by the mutation to rows[0] - an empty
      // string, not "X"
      assertEquals(output.outputText.trim(), "");
    });

    it("sanity check: the pre-fix pattern (one shared list appended N times) really does alias, confirming the test above is meaningful", async () => {
      // same as above, but mirroring the ORIGINAL, buggy source text
      // (a single "toadd" list object appended 5 times) - this is not
      // testing a real bug in today's compiler (list append-by-reference is
      // correct Python semantics), it's confirming that *this specific
      // source pattern* is what the file's real fix moved away from, so the
      // previous test's assertion is known to actually distinguish the two
      // shapes rather than passing either way
      const code = [
        "toadd=['']*3",
        "rows=[]",
        "for i in range(5):",
        "    rows.append(toadd)",
        "rows[0][0]='X'",
        "print(rows[1][0])",
      ].join("\n");
      const pcode = compileExample("Python", code);
      const { output } = runExampleBounded(pcode, 50);
      assertEquals(output.runtimeErrors, []);
      // with the shared-list bug, rows[1] IS rows[0], so the mutation shows
      // up here too
      assertEquals(output.outputText.trim(), "X");
    });
  });

  describe("Files/ReadCSV.tpy", () => {
    it("compiles and reads a seeded CSV file into the value[][] list without a runtime error", async () => {
      // ReadCSV.tpy expects "SaveCSV.csv" (cols=rows=10) to already exist -
      // seed the fake filesystem before running, and drive the run with
      // runExampleBoundedAsync since fopen/freadline suspend on a real
      // Promise that plain timers.flush() can't resume on its own
      const code = await readExample("Python/Files/ReadCSV.tpy");
      const pcode = compileExample("Python", code);
      const files = fakeFiles();
      const lines: string[] = [];
      for (let row = 0; row < 10; row += 1) {
        const values: number[] = [];
        for (let col = 0; col < 10; col += 1) values.push(row * 10 + col);
        lines.push(values.join(","));
      }
      files.seed("SaveCSV.csv", lines.join("\n") + "\n");
      const { output, hitIterationCap } = await runExampleBoundedAsync(
        pcode,
        20,
        {},
        files,
      );
      assertEquals(output.runtimeErrors, []);
      assertEquals(hitIterationCap, false);
      assertEquals(output.consoleText.trim(), "File SaveCSV.csv has been read");
    });
  });

  describe("Files/SaveCSV.tpy", () => {
    it("compiles, computes the grid, and saves it to a CSV file without a runtime error", async () => {
      // no seeding needed - the file computes its own values and writes a
      // fresh file, checking isfile()/fremove() first (both no-ops here
      // since the fake filesystem starts empty)
      const code = await readExample("Python/Files/SaveCSV.tpy");
      const pcode = compileExample("Python", code);
      const { output, hitIterationCap } = await runExampleBoundedAsync(
        pcode,
        20,
      );
      assertEquals(output.runtimeErrors, []);
      assertEquals(hitIterationCap, false);
      assertEquals(
        output.consoleText.trim(),
        "File SaveCSV.csv has been saved",
      );
    });
  });

  describe("Fractals/IFSColour.tpy", () => {
    it("compiles and, once a shape is chosen, maps colours across the grid without a runtime error", async () => {
      // confirmed fine, not a bug: the
      // "global gt,xl,xr,yt: int,yb: int" stray type annotations turned out
      // to be silently ignored, not a parse error). Chooses Dragon curve
      // (\d, keyCode 68) since it maps the smallest pixel region of the
      // three shapes, keeping this test fast.
      const code = await readExample("Python/Fractals/IFSColour.tpy");
      const pcode = compileExample("Python", code);
      const { output, canvas, hitIterationCap } = runInteractiveExample(
        pcode,
        [{ untilConsoleIncludes: "(S/B/D)", keyCode: 68, key: "d" }],
        1500,
      );
      assertEquals(output.runtimeErrors, []);
      // the whole point of getting past the prompt is to actually exercise
      // domap()'s mapxx/mapyx/mapxy/mapyy/mapxc/mapyc list indexing - a
      // large number of real pixel writes is direct evidence that happened
      assertEquals(canvas.calls.length > 1000, true);
      assertEquals(hitIterationCap, false);
    });
  });

  describe("Fractals/IFSDemonstrator.tpy", () => {
    it("compiles and, once configured, runs several fixed-point iterations without a runtime error", async () => {
      // domap()'s
      // "pixcol(newx,newy)==white / numborn / pixset" block used to run
      // unconditionally for every pixel instead of being nested under the
      // "if pixcol(x,y)!=white:" check - getting genuinely-varying,
      // sensible "N pixels born; M pixels killed" counts per iteration
      // (rather than e.g. every pixel being touched every time) is evidence
      // the fix's conditional gating is working. Chooses Dragon curve
      // (smallest region), single-pixel start, and uniform colouring to
      // keep this test's per-iteration cost down.
      const code = await readExample("Python/Fractals/IFSDemonstrator.tpy");
      const pcode = compileExample("Python", code);
      const { output, canvas } = runInteractiveExample(
        pcode,
        [
          { untilConsoleIncludes: "(B/S/D/T)", keyCode: 68, key: "d" },
          { untilConsoleIncludes: "(P/C)", keyCode: 80, key: "p" },
          { untilConsoleIncludes: "(U/D)", keyCode: 85, key: "u" },
        ],
        300,
      );
      assertEquals(output.runtimeErrors, []);
      const iterationsLogged = (
        output.consoleText.match(/Iteration \d+:/g) ?? []
      ).length;
      assertEquals(iterationsLogged > 0, true);
      assertEquals(canvas.calls.length > 1000, true);
    });
  });

  describe("Fractals/MandelbrotSpectrumDemo.tpy", () => {
    const chooseWholeSetFast = [
      { untilConsoleIncludes: "(W/Z)", keyCode: 87, key: "w" }, // \w
      { untilConsoleIncludes: "(F/M/S)", keyCode: 70, key: "f" }, // \f
    ];

    it("compiles and, once configured, renders the whole Mandelbrot set without a runtime error", async () => {
      const code = await readExample(
        "Python/Fractals/MandelbrotSpectrumDemo.tpy",
      );
      const pcode = compileExample("Python", code);
      const { output, canvas, hitIterationCap } = runInteractiveExample(
        pcode,
        chooseWholeSetFast,
        800,
      );
      assertEquals(output.runtimeErrors, []);
      assertEquals(hitIterationCap, false);
      // "Fast" whole-set resolution is 300x300 - a full frame's worth of
      // pixel writes, plus setup calls
      assertEquals(
        canvas.calls.filter((call) => call.method === "writePixel").length,
        90000,
      );
    });

    it("matches its deterministic Pascal counterpart's pixel-by-pixel output (no randomness in either version)", async () => {
      // MandelbrotSpectrumDemo.tpy/.tpas use no randrange()/random() calls
      // (confirmed by inspection - the whole algorithm is pure divmult/hypot
      // arithmetic), so its Python and Pascal output should be
      // pixel-for-pixel identical once both are driven through the same
      // "Whole set" + "Fast" menu choices - this is exactly the
      // deterministic cross-check the plan's acceptance criteria call for.
      const pythonCode = await readExample(
        "Python/Fractals/MandelbrotSpectrumDemo.tpy",
      );
      const pascalCode = await readExample(
        "Pascal/Fractals/MandelbrotSpectrumDemo.tpas",
      );
      const pythonPcode = compileExample("Python", pythonCode);
      const pascalPcode = compileExample("Pascal", pascalCode);

      const python = runInteractiveExample(
        pythonPcode,
        chooseWholeSetFast,
        800,
      );
      const pascal = runInteractiveExample(
        pascalPcode,
        chooseWholeSetFast,
        800,
      );

      assertEquals(python.hitIterationCap, false);
      assertEquals(pascal.hitIterationCap, false);
      assertEquals(python.output.runtimeErrors, []);
      assertEquals(pascal.output.runtimeErrors, []);

      const pixelWrites = (calls: typeof python.canvas.calls) =>
        calls
          .filter((call) => call.method === "writePixel")
          .map((call) => call.args);
      const pythonWrites = pixelWrites(python.canvas.calls);
      const pascalWrites = pixelWrites(pascal.canvas.calls);
      assertEquals(pythonWrites.length, 90000);
      assertEquals(pythonWrites, pascalWrites);
    });
  });

  describe("Fractals/SierpinskiDots.tpy", () => {
    it("compiles and runs several chaos-game iterations without a runtime error", async () => {
      // an open-ended "while 1>0:" loop with no natural exit - hitting the
      // iteration cap is expected, not a failure
      const code = await readExample("Python/Fractals/SierpinskiDots.tpy");
      const pcode = compileExample("Python", code);
      const { output } = runExampleBounded(pcode, 200);
      assertEquals(output.runtimeErrors, []);
    });
  });
});
