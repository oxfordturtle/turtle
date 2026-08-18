import { assertEquals, assertMatch } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { Language } from "@/core/constants.ts";
import {
  compileExample,
  readExample,
  runExampleBounded,
  runExampleBoundedAsync,
  runWithReadlines,
} from "../core/machine/_exampleHarness.ts";

/**
 * Compiles and runs every real example program under `assets/examples/**`
 * through the full
 * `tokenize -> lexify -> parse -> analyse -> encode -> run` pipeline, as an
 * end-to-end regression suite. These programs weren't written as test
 * fixtures and have no recorded expected output, so "compiles, and runs
 * bounded without an unexpected runtime error" is the baseline assertion for
 * the vast majority of files below.
 *
 * Three kinds of named exception exist, each asserting a *specific*,
 * understood outcome rather than silently skipping the file:
 *
 * - `READLINE_INPUTS`: examples that block on a line-read command
 *   (`GETLINE$`/`gets()`/`readLine()`/`readln`/`input()`, all compiling to
 *   `PCode.rdln`) right at or near the start. Fed canned keyboard input via
 *   `runWithReadlines` (see that function's doc comment in
 *   `_exampleHarness.ts` for why a plain bounded run can't just be flushed
 *   past these).
 * - `FILE_PROCESSING_ASYNC`: examples that legitimately reach `DIRY`/`FFND`/
 *   `FDIR`/`FNXT`/`FMOV` (or, transitively, any other file-processing PCode)
 *   and so suspend
 *   `execute()` on a real `FileSystem` `Promise` - a plain synchronous
 *   `runExampleBounded`/`timers.flush()` can never drive that to
 *   completion (see `_exampleHarness.ts`'s `runExampleBoundedAsync` doc
 *   comment), so these route through that instead. Asserted to run cleanly,
 *   same bar as the default path.
 * - `KNOWN_BUGS`: for a real, already-investigated bug being deliberately
 *   deferred rather than fixed - asserted to fail with exactly its known
 *   error, so a real fix (or a regression) shows up as a test change either
 *   way. Currently empty.
 *
 * `BASIC/Files/FileSearching.tbas` and `Pascal/Files/FileSearching.tpas`
 * still hit the (unrelated) iteration cap before ever reaching a
 * file-processing PCode within a *bounded* run, even now that DIRY/FFND are
 * implemented - so they need no exception entry either, the default
 * (synchronous) assertion already passes them the same way it always did.
 * `Files/ReadCSV.tpy`/`Files/SaveCSV.tpy` and other file-touching examples
 * not listed in `FILE_PROCESSING_ASYNC` below have the same latent gap this
 * category exists to fix (a synchronous run leaves them suspended, not
 * verified to actually complete) but happen to still assert cleanly via the
 * default path's "zero runtime errors" bar. Auditing every file-touching example
 * is a job of its own; `FILE_PROCESSING_ASYNC` below only lists the examples
 * that a synchronous run asserts *wrongly*, rather than merely incompletely.
 */

const LANGUAGES: {
  language: Language;
  directory: string;
  extension: string;
}[] = [
  { language: "BASIC", directory: "BASIC", extension: ".tbas" },
  { language: "C", directory: "C", extension: ".tc" },
  { language: "Java", directory: "Java", extension: ".tjav" },
  { language: "Pascal", directory: "Pascal", extension: ".tpas" },
  { language: "Python", directory: "Python", extension: ".tpy" },
  { language: "TypeScript", directory: "TypeScript", extension: ".tts" },
];

// canned (prompt substring, line to type) pairs, one per blocking read the
// program is expected to perform, in order - see runWithReadlines's own
// doc comment for why waiting for the actual prompt text matters here
const ASK_NAME = [{ untilOutputIncludes: "What is your name?", line: "Amyas" }];

const READLINE_INPUTS: Record<
  string,
  { untilOutputIncludes: string; line: string }[]
> = {
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

const FILE_PROCESSING_ASYNC = new Set([
  "BASIC/Files/DirectoryCommands.tbas",
  "BASIC/Files/RandomSentences.tbas",
  "Pascal/Files/DirectoryCommands.tpas",
  "Pascal/Files/RandomSentences.tpas",
  "Python/Files/DirectoryCommands.tpy",
  "Python/Files/RandomSentences.tpy",
  "Python/Files/FileSearching.tpy",
]);

const KNOWN_BUGS: Record<string, RegExp> = {};

const collectExamplePaths = async (
  language: string,
  directory: string,
  extension: string,
): Promise<string[]> => {
  const paths: string[] = [];
  const walk = async (relativeDir: string): Promise<void> => {
    const url = new URL(
      `../../assets/examples/${relativeDir}`,
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
  return paths;
};

const allExamples = (
  await Promise.all(
    LANGUAGES.map(async ({ language, directory, extension }) => {
      const paths = await collectExamplePaths(language, directory, extension);
      return paths.map((path) => ({ language, path }));
    }),
  )
).flat();

describe("example programs", () => {
  for (const { language, path } of allExamples) {
    it(path, async () => {
      const code = await readExample(path);
      const pcode = compileExample(language, code);

      if (path in READLINE_INPUTS) {
        const { output } = runWithReadlines(pcode, READLINE_INPUTS[path]);
        assertEquals(output.runtimeErrors, []);
        return;
      }

      if (FILE_PROCESSING_ASYNC.has(path)) {
        const { output, hitIterationCap } = await runExampleBoundedAsync(
          pcode,
          50,
        );
        assertEquals(hitIterationCap, false);
        assertEquals(output.runtimeErrors, []);
        return;
      }

      if (path in KNOWN_BUGS) {
        const { output } = runExampleBounded(pcode, 500);
        assertEquals(output.runtimeErrors.length, 1);
        assertMatch(output.runtimeErrors[0].message, KNOWN_BUGS[path]);
        return;
      }

      const { output } = runExampleBounded(pcode, 500);
      assertEquals(output.runtimeErrors, []);
    });
  }
});
