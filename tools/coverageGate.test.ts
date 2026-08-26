import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  compressRanges,
  describeShortfall,
  type FileCoverage,
  isFullyCovered,
  parseLcov,
} from "./coverageGate.ts";

// The gate is load-bearing infrastructure: if it misreads an lcov record, a
// coverage regression ships silently. These fixtures pin the exact record
// grammar `deno coverage --lcov` emits, including the '-' branch marker for a
// branch whose enclosing line never ran.

const REPO = "/repo";

const record = (body: string): string =>
  `SF:${REPO}/src/core/example.ts\n${body}\nend_of_record\n`;

/** The single file record a one-file lcov fixture parses to. */
const parseOne = (lcov: string): FileCoverage => parseLcov(lcov, REPO)[0]!;

describe("coverageGate: parseLcov", () => {
  it("reads a fully covered file as fully covered", () => {
    const file = parseOne(
      record(
        "FN:1,pick\nFNDA:2,pick\nFNF:1\nFNH:1\n" +
          "BRDA:2,1,0,1\nBRDA:2,1,1,1\nBRF:2\nBRH:2\n" +
          "DA:1,1\nDA:2,2\nLH:2\nLF:2",
      ),
    );
    assertEquals(file.path, "src/core/example.ts");
    assert(isFullyCovered(file));
    assertEquals(describeShortfall(file), []);
  });

  it("lists a missed line by number", () => {
    const file = parseOne(record("DA:1,1\nDA:2,0\nDA:3,0\nLH:1\nLF:3"));
    assertFalse(isFullyCovered(file));
    assertEquals(file.lines.missed, [2, 3]);
    assertEquals(describeShortfall(file), ["lines 33.3% (missing 2-3)"]);
  });

  it("counts an untaken branch, whether recorded as 0 or as '-'", () => {
    const file = parseOne(
      record("BRDA:5,1,0,3\nBRDA:5,1,1,0\nBRDA:9,2,0,-\nBRF:3\nBRH:1"),
    );
    assertFalse(isFullyCovered(file));
    assertEquals(file.branches.missedLines, [5, 9]);
    assertEquals(describeShortfall(file), ["branches 33.3% (lines 5, 9)"]);
  });

  it("dedupes several missed branches on one line to one reported line", () => {
    const file = parseOne(record("BRDA:5,1,0,0\nBRDA:5,1,1,0\nBRF:2\nBRH:0"));
    assertEquals(file.branches.missedLines, [5]);
  });

  it("names an uncalled function", () => {
    const file = parseOne(
      record("FN:1,pick\nFN:8,dead\nFNDA:2,pick\nFNDA:0,dead\nFNF:2\nFNH:1"),
    );
    assertFalse(isFullyCovered(file));
    assertEquals(file.functions.missed, ["dead"]);
    assertEquals(describeShortfall(file), ["functions 50.0% (dead)"]);
  });

  it("keeps a function name containing commas intact", () => {
    const file = parseOne(record("FNDA:0,a,b,c\nFNF:1\nFNH:0"));
    assertEquals(file.functions.missed, ["a,b,c"]);
  });

  it("splits multiple files at end_of_record", () => {
    const files = parseLcov(
      record("LH:1\nLF:1") +
        `SF:${REPO}/src/core/other.ts\nLH:0\nLF:1\nend_of_record\n`,
      REPO,
    );
    assertEquals(
      files.map((file) => file.path),
      ["src/core/example.ts", "src/core/other.ts"],
    );
    assert(isFullyCovered(files[0]!));
    assertFalse(isFullyCovered(files[1]!));
  });

  it("leaves a path outside the repo root untouched", () => {
    const file = parseOne(
      "SF:/elsewhere/thing.ts\nLH:1\nLF:1\nend_of_record\n",
    );
    assertEquals(file.path, "/elsewhere/thing.ts");
  });

  it("treats a file with nothing executable as fully covered", () => {
    // A type-only module that *is* loaded reports LF:0/FNF:0/BRF:0.
    const file = parseOne(record("LH:0\nLF:0\nFNF:0\nFNH:0"));
    assert(isFullyCovered(file));
  });
});

describe("coverageGate: compressRanges", () => {
  it("collapses consecutive runs and sorts the input", () => {
    assertEquals(compressRanges([10, 9, 1, 2, 3, 7]), "1-3, 7, 9-10");
  });

  it("renders a single line as itself", () => {
    assertEquals(compressRanges([42]), "42");
  });
});
