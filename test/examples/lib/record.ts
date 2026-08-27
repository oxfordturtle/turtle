import type { CallSink } from "../../core/machine/lib/fakes.ts";
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
 * - `canvas.logHash`: the raw draw-call logs run to ~43 million calls
 *   (gigabytes of JSON) across the suite, so the full log is folded into one
 *   hash incrementally, never materialised - see `canvasDigest` below.
 *   `callCount` and `byMethod` say how much of what was drawn, and
 *   `head`/`tail` carry the first and last few calls verbatim, so a hash-only
 *   diff still shows *where* drawing changed.
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
  canvas: CanvasSummary;
};

/** The canvas part of a record - what `canvasDigest` accumulates. */
export type CanvasSummary = {
  callCount: number;
  byMethod: Record<string, number>;
  logHash: string;
  head: string[];
  tail: string[];
};

const HEAD_TAIL_CALLS = 25;

/**
 * Incremental 64-bit digest, as two independent 32-bit FNV-1a lanes over the
 * same byte stream (UTF-16 code units folded as two bytes each), differing
 * only in their offset basis and prime.
 *
 * Two 32-bit lanes rather than one 64-bit accumulator because JavaScript has
 * no 64-bit integer type but `Math.imul`: the obvious `BigInt` transcription
 * of FNV-1a costs two bigint multiplications *per character*, which measured
 * at 26s across the suite - a quarter of its entire runtime - against 5s for
 * this. Nothing here needs to interoperate with a standard FNV-1a; it only
 * has to change whenever the call log changes, and be stable across runs.
 */
const fnv1a = (): { fold: (text: string) => void; digest: () => string } => {
  let lo = 0x811c9dc5 | 0;
  let hi = 0x9e3779b9 | 0;
  return {
    fold: (text: string): void => {
      for (let i = 0; i < text.length; i += 1) {
        const unit = text.charCodeAt(i);
        const low = unit & 0xff;
        const high = unit >>> 8;
        lo = Math.imul(lo ^ low, 0x01000193);
        hi = Math.imul(hi ^ low, 0x85ebca6b);
        lo = Math.imul(lo ^ high, 0x01000193);
        hi = Math.imul(hi ^ high, 0x85ebca6b);
      }
    },
    digest: (): string =>
      (lo >>> 0).toString(16).padStart(8, "0") +
      (hi >>> 0).toString(16).padStart(8, "0"),
  };
};

/** One canvas call in canonical text form, e.g. `drawLine([{"x":1,...}])`. */
const canonicalCall = (method: string, args: unknown[]): string =>
  `${method}(${JSON.stringify(args)})`;

/**
 * A `CallSink` for `fakeCanvas` that folds every call into the record's
 * canvas summary as it happens, so the 43 million calls the suite makes are
 * never all in memory at once.
 *
 * This is the reason `fakeCanvas` takes a sink at all. Accumulating the calls
 * in its `.calls` array first - which is what every other machine test wants,
 * and what it still does by default - allocates a `{ method, args }` object
 * per call and leaves the whole log live until the record is built. Only
 * `head`, `tail` and the running hash are actually needed here, and `tail` is
 * a ring buffer of the last `HEAD_TAIL_CALLS`, so the memory is constant.
 *
 * `summary()` is a call rather than a field because *when* it is taken
 * matters: `runExample` takes it the instant the run returns, and nowhere
 * later - see the comment there.
 */
export const canvasDigest = (): {
  sink: CallSink;
  summary: () => CanvasSummary;
} => {
  const byMethod: Record<string, number> = {};
  const log = fnv1a();
  const head: string[] = [];
  const ring: string[] = new Array(HEAD_TAIL_CALLS);
  let callCount = 0;

  return {
    sink: (method: string, args: unknown[]): void => {
      const text = canonicalCall(method, args);
      byMethod[method] = (byMethod[method] ?? 0) + 1;
      log.fold(text);
      log.fold("\n");
      if (callCount < HEAD_TAIL_CALLS) {
        head.push(text);
      }
      ring[callCount % HEAD_TAIL_CALLS] = text;
      callCount += 1;
    },

    // `byMethod` and `head` are copied, not handed out: a `bounded` example
    // that suspended on a file promise goes on making canvas calls whenever a
    // macrotask turn passes, and a summary that aliased the live object and
    // array would keep growing inside a record that was already built.
    summary: (): CanvasSummary => ({
      callCount,
      byMethod: { ...byMethod },
      logHash: log.digest(),
      head: [...head],
      // the oldest entry still in the ring is the one the next call would
      // overwrite; below one full lap there is no tail to report, matching
      // `head` already carrying every call there was
      tail:
        callCount > HEAD_TAIL_CALLS
          ? Array.from(
              { length: HEAD_TAIL_CALLS },
              (_, i) => ring[(callCount + i) % HEAD_TAIL_CALLS]!,
            )
          : [],
    }),
  };
};

export const buildRecord = (
  runMode: RunMode,
  pcode: number[][],
  result: BoundedRun,
  canvas: CanvasSummary,
): ExampleRecord => {
  const { output, hitIterationCap } = result;

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
    canvas,
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
