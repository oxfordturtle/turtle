import { assertThrows } from "@std/assert";
import { type Language, PCode } from "@/core/constants.ts";
import {
  defaultMachineOptions,
  dump,
  isRunning,
  type MachineOptions,
  run,
} from "@/core/machine.ts";
import { compileAndEncode } from "../../compiler/encoder/lib/helpers.ts";
import {
  type FakeCanvas,
  fakeCanvas,
  type FakeFiles,
  fakeFiles,
  type FakeOutput,
  fakeOutput,
  type FakeTimers,
  fakeTimers,
} from "./fakes.ts";

export type RunResult = {
  timers: FakeTimers;
  output: FakeOutput;
  canvas: FakeCanvas;
  files: FakeFiles;
};

/**
 * Runs a hand-written pcode program - via the `run` barrel function, with
 * fresh fakes - and flushes the fake timers so any deferred re-entry into
 * `execute` (a draw-count/code-count pause, or a WAIT) runs too. Returns
 * the fakes for assertions, plus you can call `dump()` (re-exported by
 * `@/core/machine.ts`) afterwards to inspect final memory state.
 *
 * If the program uses TDET or RDLN, it will *not* reach HALT on its own -
 * flush() will return with the machine still paused waiting for input.
 * Drive it forward with the relevant `update*` function from
 * `@/core/machine.ts` (see `input.test.ts`) before flushing again.
 */
export const runPcode = (
  pcode: number[][],
  optionsOverrides: Partial<MachineOptions> = {},
  filesOverride?: FakeFiles,
): RunResult => {
  const timers = fakeTimers();
  const output = fakeOutput();
  const canvas = fakeCanvas();
  const files = filesOverride ?? fakeFiles();
  const options = { ...defaultMachineOptions, ...optionsOverrides };
  run(pcode, options, timers, output, canvas, files);
  timers.flush();
  return { timers, output, canvas, files };
};

/**
 * Like `runPcode`, but for a program that uses at least one file-processing
 * PCode - those suspend `execute()` on a real (`fakeFiles()`) `Promise`
 * rather than resuming synchronously via `timers.flush()` alone. Alternates
 * awaiting a microtask turn (letting any
 * settled promise's `.then`/`.catch` - and the `execute()` re-entry it
 * triggers - actually run) with `timers.flush()` (draining any ordinary
 * timer-driven work that re-entry schedules), until the machine halts or
 * the iteration cap is hit - the cap is a safety net against a genuinely
 * stuck program, not a normal exit, matching `fakeTimers().flush()`'s own
 * `maxIterations` guard.
 */
export const runFilePcode = async (
  pcode: number[][],
  optionsOverrides: Partial<MachineOptions> = {},
  filesOverride?: FakeFiles,
): Promise<RunResult> => {
  const result = runPcode(pcode, optionsOverrides, filesOverride);
  let iterations = 0;
  while (isRunning() && iterations < 50) {
    iterations += 1;
    await Promise.resolve();
    result.timers.flush();
  }
  return result;
};

/**
 * Compiles a real source program (the full tokenize/lexify/parse/encode
 * pipeline, via `compileAndEncode`) and runs it exactly as `runPcode` runs a
 * hand-written one: under fresh fakes, with the fake timers flushed - console
 * writes are queued, not immediate, so nothing reaches `output.outputText`
 * until that flush. Returns the fakes for assertions.
 */
export const runSource = (language: Language, code: string): RunResult =>
  runPcode(compileAndEncode(language, code));

/**
 * `runSource`, reduced to what most whole-pipeline compiler tests assert on:
 * the program's console text, exactly as written - trailing newline and all.
 * A test that doesn't care about trailing whitespace trims at the call site.
 */
export const runSourceToText = (language: Language, code: string): string =>
  runSource(language, code).output.outputText;

/**
 * Asserts that compiling source - the full pipeline through `encode()`, since
 * some errors only surface at the encoder - throws an error whose message
 * contains `message`.
 */
export const assertCompilerError = (
  language: Language,
  code: string,
  message: string,
): void => {
  assertThrows(() => compileAndEncode(language, code), Error, message);
};

/** Encodes a string literal as `LSTR` pcode, pushing a heap string pointer - the raw-pcode equivalent of a string literal in source. */
export const str = (text: string): number[] => [
  PCode.lstr,
  text.length,
  ...[...text].map((ch) => ch.charCodeAt(0)),
];

/** Like `runToInt`, but for a program with a file-processing PCode - see `runFilePcode`. */
export const runFileToInt = async (...lines: number[][]): Promise<number> => {
  const { output } = await runFilePcode([
    ...lines,
    [PCode.itos],
    [PCode.writ],
    [PCode.halt],
  ]);
  return parseInt(output.outputText, 10);
};

/**
 * Runs a pcode fragment that leaves exactly one *integer* on the evaluation
 * stack, converts it to a string (ITOS) and writes it (WRIT), then reads
 * the result back off `output.outputText`. The evaluation stack itself
 * isn't part of the machine's public surface (only `dump()`'s variable/heap
 * memory view is), so routing through the machine's own text output is the
 * most direct way to observe "what ended up on top of the stack" without
 * reaching past the barrel.
 */
export const runToInt = (...lines: number[][]): number => {
  const { output } = runPcode([
    ...lines,
    [PCode.itos],
    [PCode.writ],
    [PCode.halt],
  ]);
  return parseInt(output.outputText, 10);
};

/**
 * Like `runToInt`, but for a fragment that leaves a heap *string* address on
 * top of the stack (WRIT alone reads a heap string directly, no ITOS needed).
 */
export const runToString = (...lines: number[][]): string => {
  const { output } = runPcode([...lines, [PCode.writ], [PCode.halt]]);
  return output.outputText;
};

/**
 * Reads back the value the machine has stored at a given main-memory
 * address, by pushing it (LDVG) and printing it (ITOS/WRIT) - the same
 * "observe through output" idiom as `runToInt`, useful for asserting on
 * pointer/memory-management pcodes (STVG, MEMC, MEMR, ...) whose direct
 * effect is on `main[]`, not the evaluation stack.
 */
export const readAddr = (setupLines: number[][], address: number): number => {
  return runToInt(...setupLines, [PCode.ldvg, address]);
};

/**
 * Sets up 360-degree angle units (a `[PCode.ldin, 360], [PCode.angl]` pair)
 * before the given pcode lines. Needed for any turtle-direction pcode
 * (SETD, LEFT, RGHT, TURN, FWRD, BACK, trig ops) because `getTurtA()`
 * defaults to 0 after a fresh `run()` - real compiled programs always set
 * this in their startup prelude, which these raw-pcode tests bypass.
 */
export const withAngles360 = (...lines: number[][]): number[][] => [
  [PCode.ldin, 360],
  [PCode.angl],
  ...lines,
];

// ---------------------------------------------------------------------------
// Real `assets/examples/` programs. Unlike the hand-written fixtures above,
// these are read off disk and run bounded, so a genuinely open-ended program -
// an animation `while True:` loop, or one waiting on input that never arrives -
// can't hang the suite. Shared with the snapshot suite's own harness
// (`test/examples/lib/harness.ts`), which layers example discovery and the
// interactive run modes on top of these.
// ---------------------------------------------------------------------------

/** Reads one example source file, by its path relative to `assets/examples/`. */
export const readExample = (relativePath: string): Promise<string> =>
  Deno.readTextFile(
    new URL(`../../../../assets/examples/${relativePath}`, import.meta.url),
  );

/**
 * Compiles an example's source all the way through to pcode, with the
 * encoder's default options - exactly what the app itself does with a freshly
 * opened example, and the same pipeline every encoder test uses.
 */
export const compileExample = (language: Language, code: string): number[][] =>
  compileAndEncode(language, code);

/**
 * Runs `pcode` with fresh fakes, bounded to `maxIterations` fake-timer flush
 * cycles (default 500 - enough for a handful of animation frames or loop
 * passes without making the suite slow). A program that's still running when
 * the bound is hit (an animation loop, or one busy-looping on a
 * `?key`/`?clickx` query that never changes without simulated input) is the
 * *expected*, common case here, not a failure - `hitIterationCap` reports
 * whether that happened, so callers can assert on it explicitly rather than
 * the bound leaking out as an uncaught exception (unlike `runPcode` above,
 * whose default 10000-iteration `flush()` is meant to catch genuine hangs in
 * hand-written fixtures that are never supposed to loop that long, and
 * therefore rethrows).
 *
 * Accepts an optional pre-built `FakeCanvas` for the same reason
 * `runExampleBoundedAsync` accepts a `FakeFiles`: the snapshot suite builds
 * one with a digesting sink rather than letting 43 million recorded calls
 * accumulate in `.calls` (see `test/examples/lib/record.ts`).
 */
export const runExampleBounded = (
  pcode: number[][],
  maxIterations = 500,
  optionsOverrides: Partial<MachineOptions> = {},
  canvasOverride?: FakeCanvas,
): RunResult & { hitIterationCap: boolean } => {
  const timers = fakeTimers();
  const output = fakeOutput();
  const canvas = canvasOverride ?? fakeCanvas();
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
 * Like `runExampleBounded`, but for examples that reach a file-processing
 * PCode (`fopen`/`freadline`/`fwrite`/etc.) rather than just being interactive
 * or open-ended: those PCodes suspend `execute()` on a real `FileSystem`
 * `Promise` (see `lib/fakes.ts`'s `fakeFiles()` doc comment and `runFilePcode`
 * above), which `runExampleBounded`'s plain synchronous `timers.flush()` can
 * never drive to completion on its own - it needs an actual event-loop turn
 * between flushes for the promise's `.then()` continuation (and the
 * `execute()` re-entry it triggers) to run. A single microtask turn
 * (`await Promise.resolve()`) isn't enough in practice - empirically this
 * needs a real macrotask tick, so this alternates `setTimeout(resolve, 0)`
 * with `timers.flush()` until the machine halts or `maxOuterIterations` is
 * hit.
 *
 * Accepts an optional pre-seeded `FakeFiles` (build one with `fakeFiles()`
 * from `lib/fakes.ts` and call `.seed(path, content)` before passing it in) -
 * needed for an example that expects a file to already exist.
 */
export const runExampleBoundedAsync = async (
  pcode: number[][],
  maxOuterIterations = 20,
  optionsOverrides: Partial<MachineOptions> = {},
  filesOverride?: FakeFiles,
  canvasOverride?: FakeCanvas,
): Promise<RunResult & { hitIterationCap: boolean }> => {
  const timers = fakeTimers();
  const output = fakeOutput();
  const canvas = canvasOverride ?? fakeCanvas();
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

export { dump, PCode };
