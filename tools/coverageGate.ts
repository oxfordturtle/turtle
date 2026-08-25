/**
 * The coverage gate. Reads the lcov reports that `deno task coverage:lcov`
 * writes, walks `src/` for files those reports never mention, and fails if any
 * enforced tree falls short of 100% on any of the three metrics — lines,
 * branches, functions. Run via `deno task coverage:check`.
 *
 * Two facts shape the design:
 *
 * - `deno coverage` only reports files that were *loaded* during the test run.
 *   A src file no test imports produces no lcov record at all, so a plain lcov
 *   parse would pass it silently. The gate therefore walks `src/` itself and
 *   treats an unreported file as 0% covered.
 * - Exclusions live in the source, not here. Deno's own directives
 *   (`deno-coverage-ignore`, `-start`/`-stop`, `-file`) remove the excluded
 *   lines, branches and functions from the lcov output entirely, and each
 *   directive must carry a justification alongside it (test/README.md rule 4).
 *   The one thing a directive can't do is speak for a file that was never
 *   loaded, which is what `deno-coverage-ignore-file` in the file itself (for
 *   type-only modules the runtime never touches) or, as a last resort, the
 *   FILE_EXCLUSIONS map below is for.
 */

export type FileCoverage = {
  /** Repo-relative path, e.g. "src/core/machine/runtime.ts". */
  path: string;
  lines: { found: number; hit: number; missed: number[] };
  functions: { found: number; hit: number; missed: string[] };
  branches: { found: number; hit: number; missedLines: number[] };
};

export type Tree = {
  name: string;
  lcov: string;
  roots: string[];
  /** false = report only; true = a shortfall fails the task. */
  enforce: boolean;
};

export const TREES: Tree[] = [
  {
    name: "core (measured from test/core only)",
    lcov: "coverage/core.lcov",
    roots: ["src/core"],
    enforce: true,
  },
  {
    name: "ui (measured from test/ui/ssr + test/ui/dom)",
    lcov: "coverage/ui.lcov",
    roots: ["src/islands", "src/pages", "src/client"],
    enforce: true,
  },
];

/**
 * Files legitimately absent from every lcov report, with the reason why.
 * Prefer a `// deno-coverage-ignore-file` directive in the file itself; this
 * map is only for files that can't carry one. Every entry is printed on every
 * run, so the list can't grow unnoticed.
 */
export const FILE_EXCLUSIONS: Record<string, string> = {};

/** Parse an lcov report into per-file records with the misses listed. */
export const parseLcov = (lcov: string, repoRoot: string): FileCoverage[] => {
  const files: FileCoverage[] = [];
  let current: FileCoverage | null = null;
  for (const rawLine of lcov.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("SF:")) {
      const absolute = line.slice(3);
      const path = absolute.startsWith(repoRoot)
        ? absolute.slice(repoRoot.length).replace(/^\//, "")
        : absolute;
      current = {
        path,
        lines: { found: 0, hit: 0, missed: [] },
        functions: { found: 0, hit: 0, missed: [] },
        branches: { found: 0, hit: 0, missedLines: [] },
      };
    } else if (current === null) {
      continue;
    } else if (line.startsWith("DA:")) {
      const [lineNumber, hits] = line.slice(3).split(",");
      if (Number(hits) === 0) current.lines.missed.push(Number(lineNumber));
    } else if (line.startsWith("LF:")) {
      current.lines.found = Number(line.slice(3));
    } else if (line.startsWith("LH:")) {
      current.lines.hit = Number(line.slice(3));
    } else if (line.startsWith("FNDA:")) {
      const comma = line.indexOf(",");
      const hits = Number(line.slice(5, comma));
      if (hits === 0) current.functions.missed.push(line.slice(comma + 1));
    } else if (line.startsWith("FNF:")) {
      current.functions.found = Number(line.slice(4));
    } else if (line.startsWith("FNH:")) {
      current.functions.hit = Number(line.slice(4));
    } else if (line.startsWith("BRDA:")) {
      const [lineNumber, , , taken] = line.slice(5).split(",");
      if (taken === "-" || Number(taken) === 0) {
        const n = Number(lineNumber);
        if (!current.branches.missedLines.includes(n)) {
          current.branches.missedLines.push(n);
        }
      }
    } else if (line.startsWith("BRF:")) {
      current.branches.found = Number(line.slice(4));
    } else if (line.startsWith("BRH:")) {
      current.branches.hit = Number(line.slice(4));
    } else if (line === "end_of_record") {
      files.push(current);
      current = null;
    }
  }
  return files;
};

/** Is this file 100% covered on all three metrics? */
export const isFullyCovered = (file: FileCoverage): boolean =>
  file.lines.hit === file.lines.found &&
  file.functions.hit === file.functions.found &&
  file.branches.hit === file.branches.found;

/** "1,2,3,7,9,10" -> "1-3, 7, 9-10", for compact missed-line lists. */
export const compressRanges = (numbers: number[]): string => {
  const sorted = [...numbers].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start: number | null = null;
  let previous: number | null = null;
  for (const n of sorted) {
    if (start === null) {
      start = n;
    } else if (previous !== null && n > previous + 1) {
      ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
      start = n;
    }
    previous = n;
  }
  if (start !== null && previous !== null) {
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
  }
  return ranges.join(", ");
};

const percent = (hit: number, found: number): string =>
  found === 0 ? "100%" : `${((100 * hit) / found).toFixed(1)}%`;

/** One line per shortfall, empty array for a fully covered file. */
export const describeShortfall = (file: FileCoverage): string[] => {
  const parts: string[] = [];
  if (file.lines.hit < file.lines.found) {
    parts.push(
      `lines ${percent(file.lines.hit, file.lines.found)} (missing ${compressRanges(file.lines.missed)})`,
    );
  }
  if (file.branches.hit < file.branches.found) {
    parts.push(
      `branches ${percent(file.branches.hit, file.branches.found)} (lines ${compressRanges(file.branches.missedLines)})`,
    );
  }
  if (file.functions.hit < file.functions.found) {
    parts.push(
      `functions ${percent(file.functions.hit, file.functions.found)} (${file.functions.missed.join(", ")})`,
    );
  }
  return parts;
};

/** Recursively collect every .ts file under a root (repo-relative paths). */
const sourceFiles = async (root: string): Promise<string[]> => {
  const collected: string[] = [];
  for await (const entry of Deno.readDir(root)) {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory) {
      collected.push(...(await sourceFiles(path)));
    } else if (entry.name.endsWith(".ts")) {
      collected.push(path);
    }
  }
  return collected;
};

const isFileLevelIgnored = async (path: string): Promise<boolean> =>
  (await Deno.readTextFile(path)).includes("// deno-coverage-ignore-file");

type TreeResult = {
  tree: Tree;
  shortfalls: { path: string; details: string[] }[];
  unreported: string[];
  excluded: { path: string; reason: string }[];
  fileCount: number;
};

const checkTree = async (tree: Tree, repoRoot: string): Promise<TreeResult> => {
  const lcov = await Deno.readTextFile(tree.lcov).catch(() => {
    throw new Error(
      `${tree.lcov} not found - run \`deno task coverage:lcov\` first ` +
        `(or \`deno task coverage:check\` to run everything)`,
    );
  });
  const reported = new Map(
    parseLcov(lcov, repoRoot).map((file) => [file.path, file]),
  );
  const shortfalls: TreeResult["shortfalls"] = [];
  const unreported: string[] = [];
  const excluded: TreeResult["excluded"] = [];
  let fileCount = 0;
  for (const root of tree.roots) {
    for (const path of await sourceFiles(root)) {
      fileCount += 1;
      const file = reported.get(path);
      if (file !== undefined) {
        if (!isFullyCovered(file)) {
          shortfalls.push({ path, details: describeShortfall(file) });
        }
      } else if (path in FILE_EXCLUSIONS) {
        excluded.push({ path, reason: FILE_EXCLUSIONS[path] });
      } else if (await isFileLevelIgnored(path)) {
        excluded.push({ path, reason: "deno-coverage-ignore-file directive" });
      } else {
        unreported.push(path);
      }
    }
  }
  shortfalls.sort((a, b) => a.path.localeCompare(b.path));
  unreported.sort();
  return { tree, shortfalls, unreported, excluded, fileCount };
};

const report = (result: TreeResult): boolean => {
  const { tree, shortfalls, unreported, excluded, fileCount } = result;
  const clean = shortfalls.length === 0 && unreported.length === 0;
  const status = clean
    ? "100% on lines, branches and functions"
    : `${shortfalls.length + unreported.length} of ${fileCount} files short of 100%`;
  const mode = tree.enforce ? "enforced" : "report only";
  console.log(`\n${tree.name} - ${status} (${mode})`);
  for (const { path, details } of shortfalls) {
    console.log(`  ${path}`);
    for (const detail of details) console.log(`    ${detail}`);
  }
  for (const path of unreported) {
    console.log(`  ${path}`);
    console.log(`    never loaded by this tree's tests (0% on everything)`);
  }
  for (const { path, reason } of excluded) {
    console.log(`  excluded: ${path} (${reason})`);
  }
  return clean;
};

if (import.meta.main) {
  const repoRoot = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
  let failed = false;
  for (const tree of TREES) {
    const clean = report(await checkTree(tree, repoRoot));
    if (!clean && tree.enforce) failed = true;
  }
  console.log("");
  if (failed) {
    console.error("Coverage gate failed: an enforced tree is below 100%.");
    Deno.exit(1);
  }
}
