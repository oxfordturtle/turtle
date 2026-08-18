import { encode, lexify, parse, tokenize } from "@/core/compiler.ts";
import type { Language } from "@/core/constants.ts";
import {
  defaultMachineOptions,
  isRunning,
  type MachineOptions,
  run,
  updateKeyDown,
  updateKeyUp,
} from "@/core/machine.ts";
import {
  fakeCanvas,
  type FakeFiles,
  fakeFiles,
  fakeOutput,
  fakeTimers,
} from "./_fakes.ts";
import type { RunResult } from "./_helpers.ts";

/**
 * Compiles and runs a real `assets/examples/` source file, rather than a
 * hand-written fixture, bounded so a genuinely open-ended program - an animation
 * `while True:` loop, or one waiting on input that never arrives - can't hang
 * the suite.
 *
 * Deliberately small and Python-only. A project-wide version across all six
 * languages and all ~514 examples would want to generalize this rather than
 * duplicate it from scratch.
 */

export const readExample = (relativePath: string): Promise<string> =>
  Deno.readTextFile(
    new URL(`../../../assets/examples/${relativePath}`, import.meta.url),
  );

export const compileExample = (
  language: Language,
  code: string,
): number[][] => {
  const tokens = tokenize(code, language);
  const lexemes = lexify(tokens, language);
  const program = parse(lexemes, language);
  return encode(program);
};

/**
 * Runs `pcode` with fresh fakes, bounded to `maxIterations` fake-timer
 * flush cycles (default 500 - enough for a handful of animation frames or
 * loop passes without making the suite slow). A program that's still
 * running when the bound is hit (an animation loop, or one busy-looping on
 * an `?key`/`?clickx` query that never changes without simulated input) is
 * the *expected*, common case here, not a failure - `hitIterationCap`
 * reports whether that happened, so callers can assert on it explicitly
 * rather than the bound leaking out as an uncaught exception (unlike
 * `_helpers.ts`'s `runPcode`, whose default 10000-iteration `flush()` is
 * meant to catch genuine hangs in hand-written fixtures that are never
 * supposed to loop that long, and therefore rethrows).
 */
export const runExampleBounded = (
  pcode: number[][],
  maxIterations = 500,
  optionsOverrides: Partial<MachineOptions> = {},
): RunResult & { hitIterationCap: boolean } => {
  const timers = fakeTimers();
  const output = fakeOutput();
  const canvas = fakeCanvas();
  const files = fakeFiles();
  const options = { ...defaultMachineOptions, ...optionsOverrides };
  run(pcode, options, timers, output, canvas, files);
  let hitIterationCap = false;
  try {
    timers.flush(maxIterations);
  } catch {
    hitIterationCap = true;
  }
  // isRunning() may also still be true without the flush() cap firing, if the
  // machine paused waiting on file-system async work rather than looping -
  // treat that the same way
  if (isRunning()) hitIterationCap = true;
  return { timers, output, canvas, files, hitIterationCap };
};

/**
 * Like `runExampleBounded`, but for the two example files
 * (`Files/ReadCSV.tpy`, `Files/SaveCSV.tpy`) that actually do file I/O
 * (`fopen`/`freadline`/`fwrite`/etc.) rather than just being interactive or
 * open-ended: those PCodes suspend `execute()` on a real `FileSystem`
 * `Promise` (see `_fakes.ts`'s `fakeFiles()` doc comment and
 * `test/core/machine/_helpers.ts`'s `runFilePcode`), which
 * `runExampleBounded`'s plain synchronous `timers.flush()` can never drive
 * to completion on its own - it needs an actual event-loop turn between
 * flushes for the promise's `.then()` continuation (and the `execute()`
 * re-entry it triggers) to run. A single microtask turn
 * (`await Promise.resolve()`) isn't enough in practice - empirically this
 * needs a real macrotask tick, so this alternates `setTimeout(resolve, 0)`
 * with `timers.flush()` until the machine halts or `maxOuterIterations` is
 * hit.
 *
 * Accepts an optional pre-seeded `FakeFiles` (build one with `fakeFiles()`
 * from `_fakes.ts` and call `.seed(path, content)` before passing it in) -
 * needed for `ReadCSV.tpy`, which expects a CSV file to already exist.
 */
export const runExampleBoundedAsync = async (
  pcode: number[][],
  maxOuterIterations = 20,
  optionsOverrides: Partial<MachineOptions> = {},
  filesOverride?: ReturnType<typeof fakeFiles>,
): Promise<RunResult & { hitIterationCap: boolean }> => {
  const timers = fakeTimers();
  const output = fakeOutput();
  const canvas = fakeCanvas();
  const files: FakeFiles = filesOverride ?? fakeFiles();
  const options = { ...defaultMachineOptions, ...optionsOverrides };
  run(pcode, options, timers, output, canvas, files);
  let hitIterationCap = false;
  let outerIterations = 0;
  while (isRunning() && outerIterations < maxOuterIterations) {
    outerIterations += 1;
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      timers.flush();
    } catch {
      hitIterationCap = true;
      break;
    }
  }
  if (isRunning()) hitIterationCap = true;
  return { timers, output, canvas, files, hitIterationCap };
};

/**
 * For examples that block on a blocking line-read command (BASIC's
 * `GETLINE$`, C/Java/TypeScript's `gets()`/`readLine()`, Pascal's `readln`,
 * Python's `input()`) - these all compile to `PCode.rdln`, which schedules
 * a very-long-delay fallback callback and then suspends until `Enter` is
 * pressed (`updateKeyUp` with `key: "Enter"` is what actually calls
 * `handleReadline()` and resumes `execute()` - see `input.ts`).
 *
 * Two things make this trickier than just "type the line, press Enter":
 *
 * 1. `run()` doesn't execute the whole program synchronously up to the
 *    first suspend point - `execute()` cooperatively yields every
 *    `options.codeCountMax`/`drawCountMax` instructions via
 *    `timers.scheduleCallback(execute, 0)` (see `runtime.ts`), regardless
 *    of whether it's hit a genuine blocking read yet. So immediately after
 *    `run()` returns, the program may not have reached its prompt (or even
 *    allocated its keybuffer) at all - typing at that point either does
 *    nothing or corrupts memory the program hasn't initialised yet.
 * 2. `updateKeyUp(..., "Enter")` only calls `handleReadline()` if the
 *    machine is *actually* suspended waiting on `PCode.rdln`
 *    (`state.readlineTimeoutID !== 0`) - otherwise the Enter keypress is
 *    silently dropped, and the huge RDLN fallback callback that eventually
 *    does get scheduled eventually fires via a later `flush()` with no
 *    handleReadline() ever having run, crashing on the stack state that
 *    leaves behind ("Stack operation called on empty stack").
 *
 * So each entry in `prompts` names a substring to wait for (in either the
 * console or output text - matching how `PRINTON`/`write`/`print` route,
 * see `_fakes.ts`'s `fakeOutput`) before typing that prompt's `line` -
 * mirroring the menu-driven `detect()` examples' own
 * "advance one scheduled callback at a time, checking output, until the
 * prompt appears" pattern (see e.g. `pythonListExamplesA.test.ts`'s
 * `runInteractiveExample`), just for a blocking read instead of a `detect`
 * menu. Once all prompts are answered, flushes the remaining fake timer
 * queue exactly like `runExampleBounded`, for any trailing
 * `pause()`/animation-loop steps.
 */
export const runWithReadlines = (
  pcode: number[][],
  prompts: { untilOutputIncludes: string; line: string }[],
  finalMaxIterations = 500,
): RunResult & { hitIterationCap: boolean } => {
  const timers = fakeTimers();
  const output = fakeOutput();
  const canvas = fakeCanvas();
  const files = fakeFiles();
  run(pcode, defaultMachineOptions, timers, output, canvas, files);
  for (const prompt of prompts) {
    let reached = false;
    for (let step = 0; step < 200; step += 1) {
      if (
        output.outputText.includes(prompt.untilOutputIncludes) ||
        output.consoleText.includes(prompt.untilOutputIncludes)
      ) {
        reached = true;
        break;
      }
      timers.runNext();
    }
    if (!reached) {
      throw new Error(
        `never reached a prompt containing ${JSON.stringify(
          prompt.untilOutputIncludes,
        )}`,
      );
    }
    for (const character of prompt.line) {
      updateKeyDown(character.charCodeAt(0), character, false, false, false);
    }
    updateKeyDown(13, "Enter", false, false, false);
    updateKeyUp(13, "Enter");
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
