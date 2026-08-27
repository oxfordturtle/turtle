import { assertEquals } from "@std/assert";
import { it } from "@std/testing/bdd";
import { examplesFor, runExample } from "./lib/harness.ts";
import { buildRecord } from "./lib/record.ts";

/**
 * The whole snapshot suite rests on runs being deterministic (fixed fake-timer
 * origin, so a fixed PRNG seed). If that ever breaks, this fails with one
 * clear message rather than letting the 503 records in the six per-language
 * files drown it in opaque diffs - which is also why it is a file of its own:
 * under `deno test --parallel` it runs alongside them, and reads as its own
 * result rather than as one step among hundreds.
 *
 * Dendrites is the example to use: it is randomness-heavy, so every particle's
 * walk consumes the PRNG.
 */
it("determinism sentinel: the same example runs to the same record twice", async () => {
  const examples = await examplesFor("Python");
  const entry = examples.find(
    (candidate) => candidate.path === "Python/Cellular/Dendrites.tpy",
  );
  if (entry === undefined) throw new Error("sentinel example missing");
  const first = await runExample(entry);
  const second = await runExample(entry);
  assertEquals(
    buildRecord(first.runMode, first.pcode, first.result, first.canvas),
    buildRecord(second.runMode, second.pcode, second.result, second.canvas),
  );
});
