import { assertEquals, assertMatch } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { Language } from "@/core/constants.ts";
import { EXPECTED_RUNTIME_ERRORS, examplesFor, runExample } from "./harness.ts";
import { buildRecord, readGolden } from "./record.ts";

/**
 * Runs every real example program of one language, under
 * `assets/examples/<Language>/**`, through the full
 * `tokenize -> lexify -> parse -> encode -> run` pipeline and compares
 * everything observable about the run - output and console text verbatim, a
 * digest of every canvas call, the pcode's shape, whether the program halted
 * or hit the iteration bound - against its golden record in
 * `test/examples/snapshots/`. The runs are deterministic under the fake ports
 * (see `lib/harness.ts`), which is what makes exact records possible for
 * programs that were never written as test fixtures.
 *
 * **One language per test file** (`basic.test.ts`, `c.test.ts`, ...), each a
 * three-line call to this function. Deno parallelises across *files*, not
 * across the steps within one, and the machine is a module-level singleton
 * that no two runs may share - so a file per language is what lets the six
 * run as six processes at once. `determinism.test.ts` is the seventh.
 *
 * Two assertions per example, in a deliberate order:
 *
 * 1. **No unexpected runtime error** - checked against
 *    `EXPECTED_RUNTIME_ERRORS` *before* any golden comparison, so
 *    `deno task test:examples:update` can regenerate every record without
 *    ever being able to bless a new crash into one.
 * 2. **The record matches the golden.** A failure here is either a real
 *    regression (wrong output, wrong drawing, a program that stopped halting
 *    or started looping) or a deliberate change - in which case re-run the
 *    updater and review the diff.
 *
 * A missing golden fails with instructions rather than passing vacuously.
 */
export const describeExamples = async (language: Language): Promise<void> => {
  const examples = await examplesFor(language);

  describe(`${language} example programs`, () => {
    for (const entry of examples) {
      it(entry.path, async () => {
        const { runMode, pcode, result, canvas } = await runExample(entry);
        const record = buildRecord(runMode, pcode, result, canvas);

        const expectedError = EXPECTED_RUNTIME_ERRORS[entry.path];
        if (expectedError === undefined) {
          assertEquals(record.runtimeErrors, []);
        } else {
          assertEquals(record.runtimeErrors.length, 1);
          assertMatch(record.runtimeErrors[0]!, expectedError);
        }
        if (runMode === "asyncFiles") {
          assertEquals(record.hitIterationCap, false);
        }

        const golden = await readGolden(entry.path);
        if (golden === null) {
          throw new Error(
            `no golden record for ${entry.path} - ` +
              `run \`deno task test:examples:update\` and review the new file`,
          );
        }
        assertEquals(record, golden);
      });
    }
  });
};
