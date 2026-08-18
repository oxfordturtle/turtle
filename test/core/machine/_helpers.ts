import { PCode } from "@/core/constants.ts";
import {
  defaultMachineOptions,
  dump,
  isRunning,
  type MachineOptions,
  run,
} from "@/core/machine.ts";
import {
  type FakeCanvas,
  fakeCanvas,
  type FakeFiles,
  fakeFiles,
  type FakeOutput,
  fakeOutput,
  type FakeTimers,
  fakeTimers,
} from "./_fakes.ts";

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

export { dump, PCode };
