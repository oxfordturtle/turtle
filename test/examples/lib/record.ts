import type { BoundedRun, RunMode } from "./harness.ts";

/**
 * The golden record for one example: everything observable about a
 * deterministic bounded run, in a shape small enough to check in and diff.
 * One shared builder, used by both the snapshot suite and the updater, so the
 * two can never drift on what a record contains.
 *
 * Two fields are digests rather than verbatim data, for size reasons:
 *
 * - `pcode.hash`: the full pcode for all examples is ~1.15 MB of JSON that
 *   the encoder unit tests already specify line by line; the hash still
 *   catches every codegen drift, and `pcode.lines` localises it a little.
 * - `canvas.logHash`: the raw draw-call logs run to ~40 million calls
 *   (gigabytes of JSON) across the suite, so the full log is folded into one
 *   hash incrementally, never materialised. `callCount` and `byMethod` say
 *   how much of what was drawn, and `head`/`tail` carry the first and last
 *   few calls verbatim, so a hash-only diff still shows *where* drawing
 *   changed.
 *
 * Text output is tiny across the whole library and is kept verbatim, so an
 * output regression diffs as the actual text.
 */
export type ExampleRecord = {
  schemaVersion: 1;
  runMode: RunMode;
  pcode: { lines: number; hash: string };
  hitIterationCap: boolean;
  consoleText: string;
  outputText: string;
  runtimeErrors: string[];
  turtle: Record<string, string | number>;
  canvas: {
    callCount: number;
    byMethod: Record<string, number>;
    logHash: string;
    head: string[];
    tail: string[];
  };
};

const HEAD_TAIL_CALLS = 25;

/** Incremental FNV-1a (64-bit), folding UTF-16 code units as two bytes. */
const fnv1a = (): { fold: (text: string) => void; digest: () => string } => {
  const PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  return {
    fold: (text: string): void => {
      for (let i = 0; i < text.length; i += 1) {
        const unit = text.charCodeAt(i);
        hash = ((hash ^ BigInt(unit & 0xff)) * PRIME) & MASK;
        hash = ((hash ^ BigInt(unit >> 8)) * PRIME) & MASK;
      }
    },
    digest: (): string => hash.toString(16).padStart(16, "0"),
  };
};

/** One canvas call in canonical text form, e.g. `drawLine([{"x":1,...}])`. */
const canonicalCall = (call: { method: string; args: unknown[] }): string =>
  `${call.method}(${JSON.stringify(call.args)})`;

export const buildRecord = (
  runMode: RunMode,
  pcode: number[][],
  result: BoundedRun,
): ExampleRecord => {
  const { output, canvas, hitIterationCap } = result;

  const byMethod: Record<string, number> = {};
  const log = fnv1a();
  for (const call of canvas.calls) {
    byMethod[call.method] = (byMethod[call.method] ?? 0) + 1;
    log.fold(canonicalCall(call));
    log.fold("\n");
  }

  const pcodeHash = fnv1a();
  pcodeHash.fold(JSON.stringify(pcode));

  return {
    schemaVersion: 1,
    runMode,
    pcode: { lines: pcode.length, hash: pcodeHash.digest() },
    hitIterationCap,
    consoleText: output.consoleText,
    outputText: output.outputText,
    runtimeErrors: output.runtimeErrors.map((error) => error.message),
    turtle: { ...output.turtleProperties },
    canvas: {
      callCount: canvas.calls.length,
      byMethod,
      logHash: log.digest(),
      head: canvas.calls.slice(0, HEAD_TAIL_CALLS).map(canonicalCall),
      tail:
        canvas.calls.length > HEAD_TAIL_CALLS
          ? canvas.calls.slice(-HEAD_TAIL_CALLS).map(canonicalCall)
          : [],
    },
  };
};

/** Where one example's golden record lives, relative to this module. */
export const goldenUrl = (examplePath: string): URL =>
  new URL(`../snapshots/${examplePath}.json`, import.meta.url);

export const readGolden = async (
  examplePath: string,
): Promise<ExampleRecord | null> => {
  try {
    return JSON.parse(await Deno.readTextFile(goldenUrl(examplePath)));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }
};
