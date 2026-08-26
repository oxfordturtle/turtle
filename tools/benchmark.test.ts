import { assert, assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  arrayProgram,
  formatMs,
  formatTable,
  measure,
  quantile,
  SCALING_LIMIT,
  scalingRatio,
  scalingRows,
  scalingVerdict,
} from "./benchmark.ts";

/**
 * The benchmark's own numbers can't be asserted - they are timings, and a
 * test that pinned one would fail on a busy machine. What can be asserted is
 * everything the timings are fed through: the repeat-until-measurable loop,
 * the percentile arithmetic that turns 503 samples into a per-keystroke
 * figure, and the ms-per-unit ratio that decides linear from quadratic. That
 * last one is the whole point of the tool, and a bug in it would report a
 * quadratic stage as fine.
 */

/** Spins for approximately `ms` milliseconds. */
const busyFor = (ms: number): void => {
  const start = performance.now();
  while (performance.now() - start < ms);
};

describe("benchmark: measure", () => {
  it("runs once when the first run already fills the window", () => {
    let runs = 0;
    const measurement = measure(() => {
      runs += 1;
    }, 0);
    assertEquals(runs, 1);
    assertEquals(measurement.runs, 1);
  });

  it("repeats up to the cap when the work is too fast to time", () => {
    let runs = 0;
    // Nothing this cheap reaches a full second in three runs, so the cap is
    // what stops it - which is the branch that keeps a fast stage from
    // spinning for the whole window.
    const measurement = measure(
      () => {
        runs += 1;
      },
      1000,
      3,
    );
    assertEquals(runs, 3);
    assertEquals(measurement.runs, 3);
  });

  it("reports the mean per run, not the total", () => {
    const measurement = measure(() => busyFor(4), 10, 100);
    assert(measurement.runs >= 2, `ran ${measurement.runs} times`);
    // Each run is ~4ms, so the mean stays near 4 however many runs it took.
    assert(
      measurement.ms < 4 * measurement.runs,
      `${measurement.ms} ms should be a per-run figure`,
    );
  });
});

describe("benchmark: quantile", () => {
  it("interpolates the median of an even-length list", () => {
    assertEquals(quantile([1, 2, 3, 4], 0.5), 2.5);
  });

  it("takes the middle value of an odd-length list", () => {
    assertEquals(quantile([5, 1, 3], 0.5), 3);
  });

  it("sorts first, so sample order doesn't matter", () => {
    assertEquals(quantile([4, 1, 3, 2], 0.5), quantile([1, 2, 3, 4], 0.5));
  });

  it("reads 0 and 1 as the smallest and largest samples", () => {
    assertEquals(quantile([9, 2, 7], 0), 2);
    assertEquals(quantile([9, 2, 7], 1), 9);
  });

  it("interpolates between neighbours for p90", () => {
    // 11 samples, so p90 lands exactly on the 10th
    assertEquals(quantile([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9);
    // 6 samples: position 4.5, halfway between 5 and 6
    assertEquals(quantile([1, 2, 3, 4, 5, 6], 0.9), 5.5);
  });

  it("refuses an empty list rather than inventing a figure", () => {
    assertThrows(() => quantile([], 0.5), Error, "empty");
  });

  it("does not disturb the caller's array", () => {
    const times = [3, 1, 2];
    quantile(times, 0.5);
    assertEquals(times, [3, 1, 2]);
  });
});

describe("benchmark: formatMs", () => {
  it("keeps three significant figures across the ranges", () => {
    assertEquals(formatMs(0.3242), "0.32");
    assertEquals(formatMs(9.994), "9.99");
    assertEquals(formatMs(49.06), "49.1");
    assertEquals(formatMs(834.7), "835");
  });
});

describe("benchmark: scaling", () => {
  const linear = [
    { label: "1x", units: 30, ms: 30 },
    { label: "2x", units: 60, ms: 61 },
    { label: "4x", units: 120, ms: 119 },
    { label: "8x", units: 240, ms: 242 },
  ];

  // The tokenizer's real measured shape before Phase 1: doubling the input
  // roughly quadruples the time.
  const quadratic = [
    { label: "1x", units: 30, ms: 48 },
    { label: "2x", units: 60, ms: 169 },
    { label: "4x", units: 120, ms: 630 },
    { label: "8x", units: 240, ms: 2415 },
  ];

  it("divides time by units to get ms per unit", () => {
    assertEquals(scalingRows([{ label: "1x", units: 4, ms: 10 }]), [
      { label: "1x", units: 4, ms: 10, msPerUnit: 2.5 },
    ]);
  });

  it("reports a ratio near 1 for linear work", () => {
    const ratio = scalingRatio(scalingRows(linear));
    assert(ratio < SCALING_LIMIT, `${ratio} should be under the limit`);
    assertEquals(scalingVerdict(ratio), "linear (1.01x)");
  });

  it("reports the quadratic tokenizer as superlinear", () => {
    const ratio = scalingRatio(scalingRows(quadratic));
    // 2415/240 over 48/30 = 6.29
    assertEquals(ratio.toFixed(2), "6.29");
    assert(ratio > SCALING_LIMIT);
    assertEquals(scalingVerdict(ratio), "SUPERLINEAR (6.29x, limit 1.50x)");
  });

  it("calls a single point linear, having nothing to compare it with", () => {
    assertEquals(
      scalingRatio(scalingRows([{ label: "1x", units: 1, ms: 5 }])),
      1,
    );
    assertEquals(scalingRatio([]), 1);
  });

  it("treats exactly the limit as passing", () => {
    assertEquals(scalingVerdict(SCALING_LIMIT), "linear (1.50x)");
  });
});

describe("benchmark: formatTable", () => {
  it("pads each column to its widest cell", () => {
    assertEquals(
      formatTable([
        ["stage", "total"],
        ["tokenize", "340 ms"],
      ]),
      ["stage     total", "tokenize  340 ms"],
    );
  });

  it("right-aligns the columns asked for, and leaves the rest alone", () => {
    assertEquals(
      formatTable(
        [
          ["a", "1", "x"],
          ["bbb", "222", "y"],
        ],
        ["left", "right"],
      ),
      ["a      1  x", "bbb  222  y"],
    );
  });

  it("does not leave trailing whitespace on a short last cell", () => {
    const lines = formatTable([
      ["total", "835 ms", ""],
      ["encode", "419 ms", "x"],
    ]);
    assertEquals(lines[0], "total   835 ms");
  });
});

describe("benchmark: arrayProgram", () => {
  it("declares and assigns to the number of arrays asked for", () => {
    const source = arrayProgram(3);
    assertEquals(
      source,
      "PROGRAM Bench;\n" +
        "VAR\n" +
        "    a0: array[0..255] of integer;\n" +
        "    a1: array[0..255] of integer;\n" +
        "    a2: array[0..255] of integer;\n" +
        "BEGIN\n" +
        "  a0[0] := 0;\n" +
        "  a1[0] := 1;\n" +
        "  a2[0] := 2;\n" +
        "END.\n",
    );
  });
});
