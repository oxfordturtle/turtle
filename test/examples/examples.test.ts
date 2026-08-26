import { assertEquals, assertMatch } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  allExamples,
  EXPECTED_RUNTIME_ERRORS,
  runExample,
} from "./lib/harness.ts";
import { buildRecord, readGolden } from "./lib/record.ts";

/**
 * Runs every real example program under `assets/examples/**` through the full
 * `tokenize -> lexify -> parse -> encode -> run` pipeline and compares
 * everything observable about the run - output and console text verbatim, a
 * digest of every canvas call, the pcode's shape, whether the program halted
 * or hit the iteration bound - against its golden record in
 * `test/examples/snapshots/`. The runs are deterministic under the fake ports
 * (see `lib/harness.ts`), which is what makes exact records possible for
 * programs that were never written as test fixtures.
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

const examples = await allExamples();

describe("example programs", () => {
  for (const entry of examples) {
    it(entry.path, async () => {
      const { runMode, pcode, result } = await runExample(entry);
      const record = buildRecord(runMode, pcode, result);

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

  // The whole suite rests on runs being deterministic (fixed fake-timer
  // origin, so a fixed PRNG seed). If that ever breaks, this fails with one
  // clear message before the 503 records above drown it in opaque diffs.
  // Dendrites is randomness-heavy: every particle's walk consumes the PRNG.
  it("determinism sentinel: the same example runs to the same record twice", async () => {
    const entry = examples.find(
      (candidate) => candidate.path === "Python/Cellular/Dendrites.tpy",
    );
    if (entry === undefined) throw new Error("sentinel example missing");
    const first = await runExample(entry);
    const second = await runExample(entry);
    assertEquals(
      buildRecord(first.runMode, first.pcode, first.result),
      buildRecord(second.runMode, second.pcode, second.result),
    );
  });
});
