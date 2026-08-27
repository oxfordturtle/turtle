/**
 * Regenerates the golden records under `test/examples/snapshots/`, one JSON
 * file per example, mirroring `assets/examples/`. Run via
 * `deno task test:examples:update` after a deliberate behaviour change, and
 * review the diff like any other code change - the diff IS the review surface,
 * which is why records are one-per-example files rather than one big blob.
 *
 * This can never bless a new runtime error: `lib/suite.ts` asserts "no
 * unexpected runtime errors" against `EXPECTED_RUNTIME_ERRORS` *before* it
 * compares the record to the golden, so an update that bakes an error into a
 * record just moves the failure, it doesn't hide it.
 *
 * Unlike the suite, this is one sequential pass over all six languages - it
 * writes files, and the whole point is a single reviewable diff at the end.
 */
import { allExamples, runExample } from "./harness.ts";
import { buildRecord, goldenUrl, readGolden } from "./record.ts";

const examples = await allExamples();
let written = 0;
let changed = 0;
let created = 0;

for (const entry of examples) {
  const { runMode, pcode, result, canvas } = await runExample(entry);
  const record = buildRecord(runMode, pcode, result, canvas);
  const existing = await readGolden(entry.path);
  const url = goldenUrl(entry.path);
  await Deno.mkdir(new URL(".", url), { recursive: true });
  const text = `${JSON.stringify(record, null, 2)}\n`;
  if (existing === null) {
    created += 1;
    console.log(`new:     ${entry.path}`);
  } else if (JSON.stringify(existing) !== JSON.stringify(record)) {
    changed += 1;
    const before = JSON.stringify(existing);
    const after = JSON.stringify(record);
    const fields = (Object.keys(record) as (keyof typeof record)[]).filter(
      (key) =>
        JSON.stringify(existing[key as keyof typeof existing]) !==
        JSON.stringify(record[key]),
    );
    console.log(`changed: ${entry.path} (${fields.join(", ")})`);
    if (before.length + after.length < 400) {
      console.log(`  was: ${before}`);
      console.log(`  now: ${after}`);
    }
  }
  await Deno.writeTextFile(url, text);
  written += 1;
}

console.log(
  `\n${written} records written (${created} new, ${changed} changed, ` +
    `${written - created - changed} unchanged)`,
);
