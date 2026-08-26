/**
 * The compiler benchmark. Compiles the whole `assets/examples/` corpus and
 * reports where the time goes, in the shape of `tools/coverageGate.ts` — pure
 * exported helpers with their own tests (`tools/benchmark.test.ts`, run by
 * `deno task test`), and a `main` block that does the I/O. Run via
 * `deno task bench`.
 *
 * Three sections, each answering a different question:
 *
 * - **Per stage, whole corpus** — where the compiler's time goes in aggregate,
 *   plus the single slowest program in each stage. An outlier here is how the
 *   encoder's address arithmetic gave itself away: one 9 KB program accounted
 *   for most of the corpus's encode time.
 * - **Per keystroke** — `tokenize` then `highlight`, which is exactly what the
 *   editor does on every edit (`islands/turtle-system/program.ts` `setCode`
 *   tokenizes, `editor.ts`'s render highlights the tokens). This is the number
 *   a student actually feels, so it is reported per file — median, p90, p99 and
 *   the worst shipped example — not as a corpus total.
 * - **Scaling** — the same work at 1×/2×/4×/8× the input, reported as
 *   ms-per-unit. A flat column is linear; a rising one is quadratic, and says
 *   so at a glance long before the absolute numbers look alarming. Two axes,
 *   because one input doesn't stress both ends: a real file repeated for the
 *   tokenizer, and a generated program with N array declarations for the
 *   parser and encoder.
 *
 * **Absolute timings are not gated, and must not be** — they are
 * machine-dependent and would fail CI on a busy runner. The *scaling ratio* is
 * gateable, because it is a ratio of two measurements taken seconds apart on
 * the same machine: `--check` exits non-zero if ms-per-unit at the largest size
 * is more than `SCALING_LIMIT` times the figure at the smallest.
 *
 * Repeated measurement rests on one property of the pipeline: every stage can
 * be re-run on the same input and produce the same output. `tokenize` and
 * `lexify` are pure; `parse` builds a fresh cursor over the lexemes it is
 * given; `encode` reads the program without writing to it. If that ever stops
 * being true, this tool starts measuring something other than what it claims
 * to.
 */

import type { Language } from "@/core/constants.ts";
import { encode, highlight, lexify, parse, tokenize } from "@/core/compiler.ts";

export type Stage = "tokenize" | "lexify" | "parse" | "encode";

export const STAGES: readonly Stage[] = [
  "tokenize",
  "lexify",
  "parse",
  "encode",
];

/**
 * ms-per-unit at the largest size may not exceed this multiple of the figure
 * at the smallest. Linear work holds at ~1.0; anything approaching 2 is
 * superlinear. The slack is for measurement noise and cache effects, not for
 * a bit of quadratic.
 */
export const SCALING_LIMIT = 1.5;

/** Repeat a measurement until it has run for at least this long. */
const MINIMUM_WINDOW_MS = 1;

/** ...but never more than this many times, however fast it is. */
const MAXIMUM_RUNS = 20;

/**
 * The scaling checks get a longer window than the per-example measurements: a
 * ratio divides one figure by another, so noise at the smallest size — the
 * fastest, and so the least stable — lands squarely on the verdict. The
 * smallest points here are fractions of a millisecond, and averaging a couple
 * of hundred runs is what keeps the ratio from wobbling by a factor of two
 * between runs. The largest points are tens of milliseconds and so run once
 * regardless, which is why this costs nothing on the expensive end.
 */
const SCALING_WINDOW_MS = 25;
const SCALING_MAX_RUNS = 500;

export type Measurement = { ms: number; runs: number };

/**
 * Times `run`, repeating it until either the elapsed time reaches
 * `minimumMs` or it has run `maximumRuns` times, and returns the mean ms per
 * run. The repetition is what makes a 0.3 ms stage measurable at all:
 * `performance.now()`'s resolution is coarse enough that a single call of
 * something that fast measures mostly noise.
 */
export const measure = (
  run: () => void,
  minimumMs: number = MINIMUM_WINDOW_MS,
  maximumRuns: number = MAXIMUM_RUNS,
): Measurement => {
  const start = performance.now();
  let runs = 0;
  let elapsed = 0;
  do {
    run();
    runs += 1;
    elapsed = performance.now() - start;
  } while (elapsed < minimumMs && runs < maximumRuns);
  return { ms: elapsed / runs, runs };
};

/**
 * The value at `fraction` through `values`, interpolating between the two
 * neighbouring samples — so the median of an even-length list is the mean of
 * the middle pair, rather than an arbitrary one of them.
 */
export const quantile = (values: number[], fraction: number): number => {
  if (values.length === 0) {
    throw new Error("quantile of an empty list");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const position = fraction * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return (
    sorted[lower]! * (1 - (position - lower)) +
    sorted[upper]! * (position - lower)
  );
};

/** Milliseconds at a readable precision: three significant figures, near enough. */
export const formatMs = (ms: number): string =>
  ms >= 100 ? ms.toFixed(0) : ms >= 10 ? ms.toFixed(1) : ms.toFixed(2);

export type ScalingPoint = { label: string; units: number; ms: number };
export type ScalingRow = ScalingPoint & { msPerUnit: number };

export const scalingRows = (points: ScalingPoint[]): ScalingRow[] =>
  points.map((point) => ({ ...point, msPerUnit: point.ms / point.units }));

/**
 * ms-per-unit at the largest size as a multiple of the figure at the smallest.
 * ~1 is linear, ~2 across a doubling is quadratic. A single point can't scale,
 * so reports 1.
 */
export const scalingRatio = (rows: ScalingRow[]): number => {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (first === undefined || last === undefined || rows.length < 2) return 1;
  return last.msPerUnit / first.msPerUnit;
};

/** "linear (1.03x)" or "SUPERLINEAR (12.4x, limit 1.5x)". */
export const scalingVerdict = (ratio: number): string =>
  ratio <= SCALING_LIMIT
    ? `linear (${ratio.toFixed(2)}x)`
    : `SUPERLINEAR (${ratio.toFixed(2)}x, limit ${SCALING_LIMIT.toFixed(2)}x)`;

/**
 * Pads a grid of cells into aligned lines. `align` is per column and defaults
 * to left, so a trailing filename column doesn't get pushed to the right.
 */
export const formatTable = (
  rows: string[][],
  align: ("left" | "right")[] = [],
): string[] => {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, column) => {
      widths[column] = Math.max(widths[column] ?? 0, cell.length);
    });
  }
  return rows.map((row) =>
    row
      .map((cell, column) =>
        align[column] === "right"
          ? cell.padStart(widths[column]!)
          : cell.padEnd(widths[column]!),
      )
      .join("  ")
      .trimEnd(),
  );
};

// ---------------------------------------------------------------------------
// The corpus
// ---------------------------------------------------------------------------

const EXTENSIONS: { language: Language; extension: string }[] = [
  { language: "BASIC", extension: ".tbas" },
  { language: "C", extension: ".tc" },
  { language: "Java", extension: ".tjav" },
  { language: "Pascal", extension: ".tpas" },
  { language: "Python", extension: ".tpy" },
  { language: "TypeScript", extension: ".tts" },
];

export type Example = {
  /** Repo-relative path, e.g. "assets/examples/Pascal/Models/Wave.tpas". */
  path: string;
  /** Path within the examples tree, which is what the report prints. */
  name: string;
  language: Language;
  source: string;
  bytes: number;
};

const ROOT = "assets/examples";

/**
 * Every example on disk. Deliberately its own walk rather than a call into
 * `test/examples/lib/harness.ts`: that module discovers examples in order to
 * *run* them, and pulls in the machine and the fake ports to do it. The
 * benchmark only compiles, and a tool reaching into the test tree for twenty
 * lines of `readDir` would be the wrong dependency to have.
 */
export const corpus = async (): Promise<Example[]> => {
  const encoder = new TextEncoder();
  const examples: Example[] = [];
  const walk = async (directory: string): Promise<void> => {
    for await (const entry of Deno.readDir(directory)) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory) {
        await walk(path);
        continue;
      }
      const match = EXTENSIONS.find(({ extension }) =>
        entry.name.endsWith(extension),
      );
      if (match === undefined) continue;
      const source = await Deno.readTextFile(path);
      examples.push({
        path,
        name: path.slice(ROOT.length + 1),
        language: match.language,
        source,
        bytes: encoder.encode(source).length,
      });
    }
  };
  await walk(ROOT);
  examples.sort((a, b) => a.name.localeCompare(b.name));
  return examples;
};

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

type StageResult = { total: number; slowest: { name: string; ms: number } };

type CorpusResult = {
  stages: Record<Stage, StageResult>;
  /** tokenize + highlight, one entry per example. */
  keystrokes: { name: string; bytes: number; ms: number; highlight: number }[];
  failures: { name: string; message: string }[];
};

const emptyStage = (): StageResult => ({
  total: 0,
  slowest: { name: "-", ms: 0 },
});

const record = (stage: StageResult, name: string, ms: number): void => {
  stage.total += ms;
  if (ms > stage.slowest.ms) stage.slowest = { name, ms };
};

/**
 * Compiles one example through every stage, timing each. A program that
 * doesn't compile is recorded as a failure rather than thrown: the corpus is
 * expected to be clean, and if it isn't, the rest of the run should still
 * produce numbers and say what was left out.
 */
const timeExample = (example: Example, result: CorpusResult): void => {
  const { name, language, source } = example;
  try {
    const tokenizeMs = measure(() => tokenize(source, language)).ms;
    const tokens = tokenize(source, language);
    const lexifyMs = measure(() => lexify(tokens, language)).ms;
    const lexemes = lexify(tokens, language);
    const parseMs = measure(() => parse(lexemes, language)).ms;
    const program = parse(lexemes, language);
    const encodeMs = measure(() => encode(program)).ms;
    const highlightMs = measure(() => highlight(tokens, language)).ms;
    record(result.stages.tokenize, name, tokenizeMs);
    record(result.stages.lexify, name, lexifyMs);
    record(result.stages.parse, name, parseMs);
    record(result.stages.encode, name, encodeMs);
    result.keystrokes.push({
      name,
      bytes: example.bytes,
      ms: tokenizeMs + highlightMs,
      highlight: highlightMs,
    });
  } catch (error) {
    result.failures.push({
      name,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * One untimed pass over the corpus. The first compilation of anything pays for
 * the JIT compiling the compiler; without this that cost lands entirely on
 * whichever example happens to sort first, and shows up as a fictional
 * outlier in the slowest-program column.
 */
const warmUp = (examples: Example[]): void => {
  for (const { language, source } of examples) {
    try {
      const tokens = tokenize(source, language);
      encode(parse(lexify(tokens, language), language));
      highlight(tokens, language);
    } catch {
      // the timed pass reports it
    }
  }
};

const timeCorpus = (examples: Example[]): CorpusResult => {
  const result: CorpusResult = {
    stages: {
      tokenize: emptyStage(),
      lexify: emptyStage(),
      parse: emptyStage(),
      encode: emptyStage(),
    },
    keystrokes: [],
    failures: [],
  };
  warmUp(examples);
  for (const example of examples) timeExample(example, result);
  return result;
};

/**
 * A Pascal program declaring `count` 256-element arrays and assigning to each.
 * The shape that exposes address arithmetic: every declaration adds work to
 * every later one, so a quadratic address calculation shows as a rising
 * ms-per-declaration column while the file itself stays tiny.
 */
export const arrayProgram = (count: number): string => {
  const declarations = Array.from(
    { length: count },
    (_, index) => `    a${index}: array[0..255] of integer;`,
  ).join("\n");
  const body = Array.from(
    { length: count },
    (_, index) => `  a${index}[0] := ${index};`,
  ).join("\n");
  return `PROGRAM Bench;\nVAR\n${declarations}\nBEGIN\n${body}\nEND.\n`;
};

const tokenizeScaling = (example: Example): ScalingRow[] =>
  scalingRows(
    [1, 2, 4, 8].map((multiple) => {
      const source = example.source.repeat(multiple);
      const kilobytes = (example.bytes * multiple) / 1024;
      return {
        label: `${multiple}x`,
        units: kilobytes,
        ms: measure(
          () => tokenize(source, example.language),
          SCALING_WINDOW_MS,
          SCALING_MAX_RUNS,
        ).ms,
      };
    }),
  );

const parseEncodeScaling = (): ScalingRow[] =>
  scalingRows(
    [4, 8, 16, 32].map((count) => {
      const source = arrayProgram(count);
      const lexemes = lexify(tokenize(source, "Pascal"), "Pascal");
      return {
        label: `${count}`,
        units: count,
        ms: measure(
          () => encode(parse(lexemes, "Pascal")),
          SCALING_WINDOW_MS,
          SCALING_MAX_RUNS,
        ).ms,
      };
    }),
  );

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

const reportStages = (result: CorpusResult): void => {
  const rows = [["stage", "total", "per KB", "slowest single program"]];
  let total = 0;
  const kilobytes =
    result.keystrokes.reduce((sum, k) => sum + k.bytes, 0) / 1024;
  for (const stage of STAGES) {
    const { total: stageTotal, slowest } = result.stages[stage];
    total += stageTotal;
    rows.push([
      stage,
      `${formatMs(stageTotal)} ms`,
      formatMs(stageTotal / kilobytes),
      `${formatMs(slowest.ms)} ms  ${slowest.name}`,
    ]);
  }
  rows.push([
    "total",
    `${formatMs(total)} ms`,
    formatMs(total / kilobytes),
    "",
  ]);
  console.log("\nPer stage, whole corpus");
  for (const line of formatTable(rows, ["left", "right", "right", "left"])) {
    console.log(`  ${line}`);
  }
};

const reportKeystrokes = (result: CorpusResult): void => {
  const times = result.keystrokes.map((keystroke) => keystroke.ms);
  const worst = result.keystrokes.reduce((a, b) => (b.ms > a.ms ? b : a));
  const rows = [
    ["median", `${formatMs(quantile(times, 0.5))} ms`, ""],
    ["p90", `${formatMs(quantile(times, 0.9))} ms`, ""],
    ["p99", `${formatMs(quantile(times, 0.99))} ms`, ""],
    [
      "worst",
      `${formatMs(worst.ms)} ms`,
      `${worst.name} (${(worst.bytes / 1024).toFixed(0)} KB, of which highlight ${formatMs(worst.highlight)} ms)`,
    ],
  ];
  console.log("\nPer keystroke (tokenize then highlight, one file)");
  for (const line of formatTable(rows, ["left", "right", "left"])) {
    console.log(`  ${line}`);
  }
};

const reportScaling = (
  title: string,
  size: string,
  unit: string,
  rows: ScalingRow[],
): number => {
  const ratio = scalingRatio(rows);
  const table = [[size, "time", `ms per ${unit}`]];
  for (const row of rows) {
    table.push([row.label, `${formatMs(row.ms)} ms`, row.msPerUnit.toFixed(3)]);
  }
  console.log(`\n${title}`);
  for (const line of formatTable(table, ["left", "right", "right"])) {
    console.log(`  ${line}`);
  }
  console.log(`  ${scalingVerdict(ratio)}`);
  return ratio;
};

if (import.meta.main) {
  const check = Deno.args.includes("--check");
  const examples = await corpus();
  const bytes = examples.reduce((sum, example) => sum + example.bytes, 0);
  console.log(
    `Compiler benchmark: ${examples.length} programs, ` +
      `${(bytes / 1024).toFixed(0)} KB of source`,
  );

  const result = timeCorpus(examples);
  reportStages(result);
  reportKeystrokes(result);

  const largest = examples.reduce((a, b) => (b.bytes > a.bytes ? b : a));
  const ratios = [
    reportScaling(
      `Scaling: tokenize, ${largest.name} repeated`,
      "size",
      "KB",
      tokenizeScaling(largest),
    ),
    reportScaling(
      "Scaling: parse + encode, N 256-element arrays",
      "arrays",
      "array",
      parseEncodeScaling(),
    ),
  ];

  if (result.failures.length > 0) {
    console.log(`\n${result.failures.length} examples failed to compile`);
    for (const { name, message } of result.failures) {
      console.log(`  ${name}: ${message}`);
    }
  }

  console.log(
    "\nAbsolute times are machine-dependent and are not gated; " +
      "the scaling ratios are.",
  );
  if (check && ratios.some((ratio) => ratio > SCALING_LIMIT)) {
    console.error(
      `\nBenchmark check failed: ms-per-unit grows with input size ` +
        `(limit ${SCALING_LIMIT.toFixed(2)}x).`,
    );
    Deno.exit(1);
  }
}
