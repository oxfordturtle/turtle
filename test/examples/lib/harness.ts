import { type Language, languages } from "@/core/constants.ts";
import {
  defaultMachineOptions,
  isRunning,
  run,
  updateKeyDown,
  updateKeyUp,
} from "@/core/machine.ts";
import {
  type FakeCanvas,
  fakeCanvas,
  fakeFiles,
  fakeOutput,
  fakeTimers,
} from "../../core/machine/lib/fakes.ts";
import {
  compileExample,
  readExample,
  runExampleBounded,
  runExampleBoundedAsync,
  type RunResult,
} from "../../core/machine/lib/helpers.ts";
import { type CanvasSummary, canvasDigest } from "./record.ts";

/**
 * The machinery for running every real program under `assets/examples/`
 * deterministically under the fake ports, shared between the snapshot suite
 * (`lib/suite.ts`, one file per language) and the golden updater
 * (`lib/update.ts`) so the two can
 * never diverge on how an example is run.
 *
 * Determinism is what makes the golden records possible, and it rests on one
 * fact: `fakeTimers().now()` starts at 0 and only moves via `advance()`, which
 * nothing here calls - so the machine's PRNG seed (`seed = timers.now()` at
 * `run()`) and every `?time` query are identical on every run. The sentinel
 * test in `determinism.test.ts` runs one randomness-heavy example twice to fail
 * loudly if that ever changes.
 */

export type BoundedRun = RunResult & { hitIterationCap: boolean };

/**
 * For examples that block on a blocking line-read command (BASIC's
 * `GETLINE$`, C/Java/TypeScript's `gets()`/`readLine()`, Pascal's `readln`,
 * Python's `input()`) - these all compile to `PCode.rdln`, which schedules a
 * very-long-delay fallback callback and then suspends until `Enter` is
 * pressed (`updateKeyUp` with `key: "Enter"` is what actually calls
 * `handleReadline()` and resumes `execute()`).
 *
 * Two things make this trickier than just "type the line, press Enter":
 *
 * 1. `run()` doesn't execute the whole program synchronously up to the first
 *    suspend point - `execute()` cooperatively yields every
 *    `options.codeCountMax`/`drawCountMax` instructions via
 *    `timers.scheduleCallback(execute, 0)`, regardless of whether it's hit a
 *    genuine blocking read yet. So immediately after `run()` returns, the
 *    program may not have reached its prompt (or even allocated its
 *    keybuffer) at all - typing at that point either does nothing or
 *    corrupts memory the program hasn't initialised yet.
 * 2. `updateKeyUp(..., "Enter")` only calls `handleReadline()` if the machine
 *    is *actually* suspended waiting on `PCode.rdln` - otherwise the Enter
 *    keypress is silently dropped, and the RDLN fallback callback eventually
 *    fires with no `handleReadline()` ever having run, crashing on the stack
 *    state that leaves behind ("Stack operation called on empty stack").
 *
 * So each entry in `prompts` names a substring to wait for (in either the
 * console or output text, matching how `PRINTON`/`write`/`print` route)
 * before typing that prompt's `line`. Once all prompts are answered, flushes
 * the remaining fake timer queue exactly like `runExampleBounded`, for any
 * trailing `pause()`/animation-loop steps.
 */
export const runWithReadlines = (
  pcode: number[][],
  prompts: ReadlinePrompt[],
  canvas: FakeCanvas,
  finalMaxIterations = 500,
): BoundedRun => {
  const timers = fakeTimers();
  const output = fakeOutput();
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

export type ReadlinePrompt = { untilOutputIncludes: string; line: string };

/**
 * For examples that gate their real work behind one or more interactive
 * `detect(\key,0)` menu prompts. Each entry names a substring that appears in
 * the console once the program has printed that prompt and is genuinely
 * waiting on it (found by advancing the fake timer queue one callback at a
 * time - `timers.flush()` would just busy-loop), and the key to press once
 * there. `keyCode` must be the *keyboard* code from
 * `src/core/constants/inputs.ts` (e.g. `\w` is 87), not an ASCII code, and no
 * Enter follows - `detect` polls the key state directly, unlike `rdln`.
 * After the last keypress, flushes up to `finalMaxIterations` further steps,
 * exactly like `runExampleBounded` - so the golden record captures the
 * program's real post-menu work (a full fractal render, say) instead of an
 * endless spin at the menu.
 */
export const runWithKeypresses = (
  pcode: number[][],
  presses: KeyPress[],
  canvas: FakeCanvas,
  finalMaxIterations: number,
): BoundedRun => {
  const timers = fakeTimers();
  const output = fakeOutput();
  const files = fakeFiles();
  run(pcode, defaultMachineOptions, timers, output, canvas, files);
  for (const press of presses) {
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

export type KeyPress = {
  untilConsoleIncludes: string;
  keyCode: number;
  key: string;
};

// ---------------------------------------------------------------------------
// Discovery and dispatch - the single definition of which examples exist and
// how each one has to be run, used identically by the test and the updater.
// ---------------------------------------------------------------------------

export type ExampleEntry = { language: Language; path: string };

const LANGUAGE_DIRECTORIES: Record<
  Language,
  { directory: string; extension: string }
> = {
  BASIC: { directory: "BASIC", extension: ".tbas" },
  C: { directory: "C", extension: ".tc" },
  Java: { directory: "Java", extension: ".tjav" },
  Pascal: { directory: "Pascal", extension: ".tpas" },
  Python: { directory: "Python", extension: ".tpy" },
  TypeScript: { directory: "TypeScript", extension: ".tts" },
};

/** Every example on disk for one language, sorted - the suite is index-free,
 * so a file dropped into `assets/examples/` is picked up automatically. */
export const examplesFor = async (
  language: Language,
): Promise<ExampleEntry[]> => {
  const { directory, extension } = LANGUAGE_DIRECTORIES[language];
  const paths: string[] = [];
  const walk = async (relativeDir: string): Promise<void> => {
    const url = new URL(
      `../../../assets/examples/${relativeDir}`,
      import.meta.url,
    );
    for await (const entry of Deno.readDir(url)) {
      const relativeEntry = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory) {
        await walk(relativeEntry);
      } else if (entry.isFile && entry.name.endsWith(extension)) {
        paths.push(relativeEntry);
      }
    }
  };
  await walk(directory);
  paths.sort();
  return paths.map((path) => ({ language, path }));
};

/** Every example on disk, all six languages in `LANGUAGE_DIRECTORIES` order -
 * what the golden updater rewrites in one pass. The test suite itself goes a
 * language at a time, one file each, so `deno test --parallel` can run them
 * in separate processes (the machine is a module-level singleton, so tests
 * can only be concurrent across processes, not within one). */
export const allExamples = async (): Promise<ExampleEntry[]> =>
  (await Promise.all(languages.map(examplesFor))).flat();

// Canned (prompt substring, line to type) pairs, one per blocking read the
// program is expected to perform, in order - see runWithReadlines's own doc
// comment for why waiting for the actual prompt text matters. These are
// *inputs* to the run, not observations, so they live here rather than in the
// golden records; a record's `runMode: "readline"` says which path ran it.
const ASK_NAME: ReadlinePrompt[] = [
  { untilOutputIncludes: "What is your name?", line: "Amyas" },
];

export const READLINE_INPUTS: Record<string, ReadlinePrompt[]> = {
  "BASIC/Interaction/AskInput.tbas": ASK_NAME,
  "C/Interaction/AskInput.tc": ASK_NAME,
  "Java/Interaction/AskInput.tjav": ASK_NAME,
  "Pascal/Interaction/AskInput.tpas": ASK_NAME,
  "Python/Interaction/AskInput.tpy": ASK_NAME,
  "TypeScript/Interaction/AskInput.tts": ASK_NAME,
  // numdisks (>1, so getnum()'s own re-prompt loop only runs once), then
  // start pillar, then finish pillar - Pascal's pillars are 1/2/3, Python's
  // are 0/1/2 (see each file's own getnum())
  "Pascal/Logic&CS/Hanoi.tpas": [
    { untilOutputIncludes: "How many disks", line: "3" },
    { untilOutputIncludes: "Start pillar", line: "1" },
    { untilOutputIncludes: "Finish pillar", line: "2" },
  ],
  "Python/Logic&CS/Hanoi.tpy": [
    { untilOutputIncludes: "How many disks", line: "3" },
    { untilOutputIncludes: "Start pillar", line: "0" },
    { untilOutputIncludes: "Finish pillar", line: "1" },
  ],
  "Pascal/Logic&CS/IterateRoot.tpas": [
    { untilOutputIncludes: "Which square root", line: "10" },
  ],
  "Python/Logic&CS/IterateRoot.tpy": [
    { untilOutputIncludes: "Which square root", line: "10" },
  ],
};

// Examples that legitimately reach a file-processing PCode and so suspend
// execute() on a real FileSystem promise - a plain synchronous flush can
// never drive these to completion (see runExampleBoundedAsync). Asserted to
// complete: their records must show hitIterationCap: false.
export const FILE_PROCESSING_ASYNC = new Set([
  "BASIC/Files/DirectoryCommands.tbas",
  "BASIC/Files/RandomSentences.tbas",
  "Pascal/Files/DirectoryCommands.tpas",
  "Pascal/Files/RandomSentences.tpas",
  "Python/Files/DirectoryCommands.tpy",
  "Python/Files/RandomSentences.tpy",
  "Python/Files/FileSearching.tpy",
]);

// Examples that gate their real work behind detect(\key,0) menu prompts,
// driven through the menu so their goldens capture the actual computation
// (a full fractal render) rather than an endless spin at the prompt. The
// choices deliberately pick the cheapest menu options (Dragon curve, "Fast"
// resolution) to keep the suite quick; the per-example bound is whatever that
// choice needs to finish.
export const KEYPRESS_INPUTS: Record<
  string,
  { presses: KeyPress[]; finalMaxIterations: number }
> = {
  "Python/Fractals/IFSColour.tpy": {
    // Dragon curve (\d = 68): the smallest pixel region of the three shapes
    presses: [{ untilConsoleIncludes: "(S/B/D)", keyCode: 68, key: "d" }],
    finalMaxIterations: 1500,
  },
  "Python/Fractals/IFSDemonstrator.tpy": {
    // Dragon curve, single-pixel start, uniform colouring - the cheapest
    // per-iteration configuration
    presses: [
      { untilConsoleIncludes: "(B/S/D/T)", keyCode: 68, key: "d" },
      { untilConsoleIncludes: "(P/C)", keyCode: 80, key: "p" },
      { untilConsoleIncludes: "(U/D)", keyCode: 85, key: "u" },
    ],
    finalMaxIterations: 300,
  },
  // Whole set + Fast (300x300): a full frame of writePixel calls. The Python
  // and Pascal versions share the same menu and the same pure arithmetic, so
  // their canvas digests should track each other - if one drifts alone,
  // suspect that language's compiler rather than the machine.
  "Python/Fractals/MandelbrotSpectrumDemo.tpy": {
    presses: [
      { untilConsoleIncludes: "(W/Z)", keyCode: 87, key: "w" },
      { untilConsoleIncludes: "(F/M/S)", keyCode: 70, key: "f" },
    ],
    finalMaxIterations: 800,
  },
  "Pascal/Fractals/MandelbrotSpectrumDemo.tpas": {
    presses: [
      { untilConsoleIncludes: "(W/Z)", keyCode: 87, key: "w" },
      { untilConsoleIncludes: "(F/M/S)", keyCode: 70, key: "f" },
    ],
    finalMaxIterations: 800,
  },
};

/**
 * The one gate the golden records can never override: an example must run
 * without a runtime error unless it is listed here with the exact error
 * expected, tagged [known bug] in spirit (test/README.md rule 5). Because the
 * test asserts this *before* comparing to the golden, `test:examples:update`
 * can never silently bless a new runtime error into a record. Currently
 * empty.
 */
export const EXPECTED_RUNTIME_ERRORS: Record<string, RegExp> = {};

export type RunMode = "bounded" | "readline" | "keypress" | "asyncFiles";

/**
 * Read, compile and run one example the way its dispatch entry says.
 *
 * The canvas is built here rather than inside each run mode because it is
 * given a digesting sink: across the library the examples make 43 million
 * canvas calls, and folding each one into the record as it happens - instead
 * of accumulating them all in `FakeCanvas.calls` and walking them afterwards -
 * is what keeps that affordable. `result.canvas.calls` is therefore *empty*;
 * the returned `canvas` digest is the observation, and callers pass its
 * `summary()` to `buildRecord` - at the call site, not before returning here,
 * for the reason `canvasDigest` sets out.
 */
export const runExample = async (
  entry: ExampleEntry,
): Promise<{
  runMode: RunMode;
  pcode: number[][];
  result: BoundedRun;
  canvas: CanvasSummary;
}> => {
  const code = await readExample(entry.path);
  const pcode = compileExample(entry.language, code);
  const digest = canvasDigest();
  const canvas = fakeCanvas(digest.sink);

  // The summary is taken the instant each run returns, with no `await`
  // between, and that placement is load-bearing rather than tidy. A `bounded`
  // example that suspended on a file promise (the `Files/` programs not in
  // FILE_PROCESSING_ASYNC all do) goes on running whenever a macrotask turn
  // happens to pass, so a summary taken any later than this records however
  // far some unrelated `await` elsewhere let it get - which is to say, not a
  // property of the program at all. End of run is the one point that is.
  if (entry.path in READLINE_INPUTS) {
    const result = runWithReadlines(
      pcode,
      READLINE_INPUTS[entry.path]!,
      canvas,
    );
    return { runMode: "readline", pcode, result, canvas: digest.summary() };
  }
  if (entry.path in KEYPRESS_INPUTS) {
    const { presses, finalMaxIterations } = KEYPRESS_INPUTS[entry.path]!;
    const result = runWithKeypresses(
      pcode,
      presses,
      canvas,
      finalMaxIterations,
    );
    return { runMode: "keypress", pcode, result, canvas: digest.summary() };
  }
  if (FILE_PROCESSING_ASYNC.has(entry.path)) {
    const result = await runExampleBoundedAsync(
      pcode,
      50,
      {},
      undefined,
      canvas,
    );
    return { runMode: "asyncFiles", pcode, result, canvas: digest.summary() };
  }
  const result = runExampleBounded(pcode, 500, {}, canvas);
  return { runMode: "bounded", pcode, result, canvas: digest.summary() };
};
