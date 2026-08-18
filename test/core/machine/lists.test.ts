import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import {
  PCode,
  readAddr,
  runPcode,
  runToInt,
  runToString,
} from "./_helpers.ts";

/**
 * Behavioral coverage for the eleven Python list operator PCodes (`LAPP`
 * through `LIHP`, hex `0x50`-`0x5A`) in `src/core/machine/runtime.ts`. These
 * hand-write pcode directly rather than going through a compiler round-trip.
 *
 * What they check: header layout, stack contracts, and every resolved judgment
 * call (LCPY's copy direction, LIDX/LREM's "not found"
 * behavior and string-content equality, LINS's out-of-range clamping,
 * multi-dimensional lists being treated as flat sequences by every
 * operator except LIAD/LIHP's capacity computation).
 *
 * Testing strategy: `LIAD`/`LIHP` are tested first, directly, since every
 * other operator needs a way to create a list to operate on. `LAPP` is
 * tested next (the simplest mutator), and then used as the fixture-builder
 * for every other operator's tests, mirroring how a real Python program
 * would build up a list in the first place. `LPRT` is tested directly
 * (empty/int/string cases) and then *also* used as the general "read a
 * list's current content back out" tool for the remaining operators
 * (LCPY/LEXT/LINS/LMUL/LREM/LREV), since it's simpler and more faithful to
 * go through the machine's own pcode than to reach into `main[]` from the
 * test - `readAddr` and a DUPL/LPTR-based direct memory read are used only
 * where LPRT can't help (inspecting header/capacity fields directly).
 */
describe("machine/lists: Python list operators", () => {
  // lp encoding (see 02): 4/5 = integer/string, base case (1-D); +16 per
  // additional dimension. Only LIDX/LREM/LPRT ever decode this - the rest
  // move raw cells regardless of declared element kind, so an arbitrary
  // consistent placeholder would do for them, but real values are used
  // throughout for realism.
  const INT_1D = 4;
  const STR_1D = 5;
  const INT_2D = 20; // 4 + 16
  const STR_3D = 37; // 5 + 16*2

  // size encoding (see 02): dim1 in bits 0-10, dim2 in bits 11-20, dim3 in
  // bits 21-26, dim4 (max string length, string lists only) in bits 27-31.
  // Built with multiplication rather than `<<` so the numbers stay
  // unambiguous (and within Number.MAX_SAFE_INTEGER) regardless of whether
  // the top bit ends up set - `decodeSize`'s `&`/`>>>` recover the same
  // bits either way.
  const packSize = (
    dim1: number,
    dim2: number,
    dim3: number,
    dim4: number,
  ): number => dim1 + dim2 * 0x800 + dim3 * 0x200000 + dim4 * 0x8000000;

  const str = (s: string): number[] => [
    PCode.lstr,
    s.length,
    ...Array.from(s).map((c) => c.charCodeAt(0)),
  ];

  /** LIHP + repeated DUPL/LDIN/LAPP, leaving the built list's heap base address on top of the stack */
  const buildHeapIntList = (size: number, values: number[]): number[][] => {
    const lines: number[][] = [[PCode.lihp, size]];
    for (const value of values) {
      lines.push([PCode.dupl], [PCode.ldin, value], [PCode.lapp, INT_1D]);
    }
    return lines;
  };

  /** like buildHeapIntList, but for a string-kind list - each value becomes its own independent heap string (LSTR), then a pointer to it is appended */
  const buildHeapStrList = (size: number, values: string[]): number[][] => {
    const lines: number[][] = [[PCode.lihp, size]];
    for (const value of values) {
      lines.push([PCode.dupl], str(value), [PCode.lapp, STR_1D]);
    }
    return lines;
  };

  /** reads a single cell at a known offset from a list whose base address is on top of the stack at the end of `buildLines` - a fresh run per call, mirroring readAddr's pattern */
  const readListCell = (buildLines: number[][], offset: number): number =>
    runToInt(...buildLines, [PCode.ldin, offset], [PCode.plus], [PCode.lptr]);

  describe("LIAD (create an empty list at a fixed address)", () => {
    it("1-D integer list: header fields", () => {
      const addr = 200;
      const setup = [
        [PCode.ldin, addr],
        [PCode.liad, packSize(7, 0, 0, 0)],
      ];
      assertEquals(readAddr(setup, addr), 0); // length
      assertEquals(readAddr(setup, addr + 1), 7); // dim1
      assertEquals(readAddr(setup, addr + 2), 0); // dim2
      assertEquals(readAddr(setup, addr + 3), 0); // dim3
      assertEquals(readAddr(setup, addr + 4), 0); // dim4
    });

    it("1-D string list: header fields, including max string length (dim4)", () => {
      const addr = 200;
      const setup = [
        [PCode.ldin, addr],
        [PCode.liad, packSize(6, 0, 0, 12)],
      ];
      assertEquals(readAddr(setup, addr), 0);
      assertEquals(readAddr(setup, addr + 1), 6);
      assertEquals(readAddr(setup, addr + 2), 0);
      assertEquals(readAddr(setup, addr + 3), 0);
      assertEquals(readAddr(setup, addr + 4), 12);
    });

    it("2-D integer list: header fields", () => {
      const addr = 200;
      const setup = [
        [PCode.ldin, addr],
        [PCode.liad, packSize(9, 5, 0, 0)],
      ];
      assertEquals(readAddr(setup, addr), 0);
      assertEquals(readAddr(setup, addr + 1), 9);
      assertEquals(readAddr(setup, addr + 2), 5);
      assertEquals(readAddr(setup, addr + 3), 0);
      assertEquals(readAddr(setup, addr + 4), 0);
    });

    it("2-D string list: header fields", () => {
      const addr = 200;
      const setup = [
        [PCode.ldin, addr],
        [PCode.liad, packSize(4, 3, 0, 8)],
      ];
      assertEquals(readAddr(setup, addr), 0);
      assertEquals(readAddr(setup, addr + 1), 4);
      assertEquals(readAddr(setup, addr + 2), 3);
      assertEquals(readAddr(setup, addr + 3), 0);
      assertEquals(readAddr(setup, addr + 4), 8);
    });

    it("3-D integer list: header fields", () => {
      const addr = 200;
      const setup = [
        [PCode.ldin, addr],
        [PCode.liad, packSize(11, 3, 2, 0)],
      ];
      assertEquals(readAddr(setup, addr), 0);
      assertEquals(readAddr(setup, addr + 1), 11);
      assertEquals(readAddr(setup, addr + 2), 3);
      assertEquals(readAddr(setup, addr + 3), 2);
      assertEquals(readAddr(setup, addr + 4), 0);
    });

    it("3-D string list: header fields (all four size fields in use at once)", () => {
      const addr = 200;
      const setup = [
        [PCode.ldin, addr],
        [PCode.liad, packSize(5, 2, 2, 10)],
      ];
      assertEquals(readAddr(setup, addr), 0);
      assertEquals(readAddr(setup, addr + 1), 5);
      assertEquals(readAddr(setup, addr + 2), 2);
      assertEquals(readAddr(setup, addr + 3), 2);
      assertEquals(readAddr(setup, addr + 4), 10);
    });

    it("decodes each bit-packed field distinctly, not just round numbers that could hide a shift/mask error", () => {
      // dim1 pushed near its 11-bit max to prove the mask doesn't clip it;
      // dim2/dim3 kept small (unlike dim1) purely to keep this test's
      // element-zeroing loop (capacity = dim1*dim2*dim3) fast - the point
      // being tested is field decoding, not capacity size
      const addr = 200;
      const setup = [
        [PCode.ldin, addr],
        [PCode.liad, packSize(1500, 7, 3, 20)],
      ];
      assertEquals(readAddr(setup, addr + 1), 1500);
      assertEquals(readAddr(setup, addr + 2), 7);
      assertEquals(readAddr(setup, addr + 3), 3);
      assertEquals(readAddr(setup, addr + 4), 20);
    });

    it("zero-initializes every element cell", () => {
      const addr = 200;
      const setup = [
        [PCode.ldin, addr],
        [PCode.liad, packSize(3, 0, 0, 0)],
      ];
      assertEquals(readAddr(setup, addr + 5), 0);
      assertEquals(readAddr(setup, addr + 6), 0);
      assertEquals(readAddr(setup, addr + 7), 0);
    });
  });

  describe("LIHP (create an empty list on the heap)", () => {
    it("pushes the new list's base address, net stack effect +1", () => {
      assertEquals(
        runToInt([PCode.lihp, packSize(3, 0, 0, 0)]),
        runToInt([PCode.lihp, packSize(3, 0, 0, 0)]),
      );
    });

    it("2-D integer list: header fields, read back via DUPL/LPTR", () => {
      const build = [[PCode.lihp, packSize(9, 5, 0, 0)]];
      assertEquals(readListCell(build, 0), 0); // length
      assertEquals(readListCell(build, 1), 9);
      assertEquals(readListCell(build, 2), 5);
      assertEquals(readListCell(build, 3), 0);
      assertEquals(readListCell(build, 4), 0);
    });

    it("3-D string list: header fields (all four size fields in use at once)", () => {
      const build = [[PCode.lihp, packSize(5, 2, 2, 10)]];
      assertEquals(readListCell(build, 0), 0);
      assertEquals(readListCell(build, 1), 5);
      assertEquals(readListCell(build, 2), 2);
      assertEquals(readListCell(build, 3), 2);
      assertEquals(readListCell(build, 4), 10);
    });

    it("creates an empty list (length 0) regardless of capacity", () => {
      const build = [[PCode.lihp, packSize(50, 0, 0, 0)]];
      assertEquals(readListCell(build, 0), 0);
    });
  });

  describe("LAPP (append)", () => {
    it("appends integers, growing the length", () => {
      const build = buildHeapIntList(packSize(3, 0, 0, 0), [10, 20, 30]);
      assertEquals(runToString(...build, [PCode.lprt, INT_1D]), "[10, 20, 30]");
    });

    it("appends strings (as pointers)", () => {
      const build = buildHeapStrList(packSize(2, 0, 0, 0), ["a", "bb"]);
      assertEquals(runToString(...build, [PCode.lprt, STR_1D]), "['a', 'bb']");
    });

    it("throws once capacity is exceeded, halting the machine", () => {
      const build = buildHeapIntList(packSize(2, 0, 0, 0), [1, 2]);
      const { output } = runPcode([
        ...build,
        [PCode.ldin, 3],
        [PCode.lapp, INT_1D],
        [PCode.halt],
      ]);
      assertEquals(output.runtimeErrors.length, 1);
      assertEquals(
        output.runtimeErrors[0].message,
        "List has reached its maximum capacity of 2 items.",
      );
      assertEquals(output.stateChanges.at(-1), "halted");
    });
  });

  describe("LINS (insert)", () => {
    const source = () => buildHeapIntList(packSize(4, 0, 0, 0), [1, 2, 3]); // capacity 4, room for one insert

    it("inserts at the start", () => {
      const build = [
        ...source(),
        [PCode.dupl],
        [PCode.ldin, 0],
        [PCode.ldin, 99],
        [PCode.lins, INT_1D],
      ];
      assertEquals(
        runToString(...build, [PCode.lprt, INT_1D]),
        "[99, 1, 2, 3]",
      );
    });

    it("inserts in the middle", () => {
      const build = [
        ...source(),
        [PCode.dupl],
        [PCode.ldin, 1],
        [PCode.ldin, 99],
        [PCode.lins, INT_1D],
      ];
      assertEquals(
        runToString(...build, [PCode.lprt, INT_1D]),
        "[1, 99, 2, 3]",
      );
    });

    it("inserts at the end", () => {
      const build = [
        ...source(),
        [PCode.dupl],
        [PCode.ldin, 3],
        [PCode.ldin, 99],
        [PCode.lins, INT_1D],
      ];
      assertEquals(
        runToString(...build, [PCode.lprt, INT_1D]),
        "[1, 2, 3, 99]",
      );
    });

    it("clamps an out-of-range position to the end, matching real Python list.insert()", () => {
      const build = [
        ...source(),
        [PCode.dupl],
        [PCode.ldin, 100],
        [PCode.ldin, 99],
        [PCode.lins, INT_1D],
      ];
      assertEquals(
        runToString(...build, [PCode.lprt, INT_1D]),
        "[1, 2, 3, 99]",
      );
    });

    it("clamps a very negative position to the start, matching real Python list.insert()", () => {
      const build = [
        ...source(),
        [PCode.dupl],
        [PCode.ldin, -100],
        [PCode.ldin, 99],
        [PCode.lins, INT_1D],
      ];
      assertEquals(
        runToString(...build, [PCode.lprt, INT_1D]),
        "[99, 1, 2, 3]",
      );
    });

    it("throws once capacity is exceeded", () => {
      const build = buildHeapIntList(packSize(3, 0, 0, 0), [1, 2, 3]);
      const { output } = runPcode([
        ...build,
        [PCode.dupl],
        [PCode.ldin, 0],
        [PCode.ldin, 99],
        [PCode.lins, INT_1D],
        [PCode.halt],
      ]);
      assertEquals(output.runtimeErrors.length, 1);
      assertEquals(
        output.runtimeErrors[0].message,
        "List has reached its maximum capacity of 3 items.",
      );
    });
  });

  describe("LDEL (delete by index)", () => {
    // mirrors the Delphi original's LISTDEL exactly (Win_TurtleRun.pas,
    // "procedure listdel") - see the doc comment on PCode.ldel's case in
    // runtime.ts. Unlike LINS, out-of-range (including negative) indices
    // are not clamped or normalized - they raise an error.
    const source = () => buildHeapIntList(packSize(4, 0, 0, 0), [10, 20, 30]);

    it("deletes the element at the start", () => {
      const build = [
        ...source(),
        [PCode.dupl],
        [PCode.ldin, 0],
        [PCode.ldel, INT_1D],
      ];
      assertEquals(runToString(...build, [PCode.lprt, INT_1D]), "[20, 30]");
    });

    it("deletes the element in the middle, shifting later elements down", () => {
      const build = [
        ...source(),
        [PCode.dupl],
        [PCode.ldin, 1],
        [PCode.ldel, INT_1D],
      ];
      assertEquals(runToString(...build, [PCode.lprt, INT_1D]), "[10, 30]");
    });

    it("deletes the element at the end", () => {
      const build = [
        ...source(),
        [PCode.dupl],
        [PCode.ldin, 2],
        [PCode.ldel, INT_1D],
      ];
      assertEquals(runToString(...build, [PCode.lprt, INT_1D]), "[10, 20]");
    });

    it("throws on an out-of-range index, unlike LINS's clamping", () => {
      const build = [
        ...source(),
        [PCode.dupl],
        [PCode.ldin, 3],
        [PCode.ldel, INT_1D],
        [PCode.halt],
      ];
      const { output } = runPcode(build);
      assertEquals(output.runtimeErrors.length, 1);
      assertEquals(
        output.runtimeErrors[0].message,
        'Invalid list index in ".del" method.',
      );
    });

    it("throws on a negative index rather than counting from the end", () => {
      const build = [
        ...source(),
        [PCode.dupl],
        [PCode.ldin, -1],
        [PCode.ldel, INT_1D],
        [PCode.halt],
      ];
      const { output } = runPcode(build);
      assertEquals(output.runtimeErrors.length, 1);
      assertEquals(
        output.runtimeErrors[0].message,
        'Invalid list index in ".del" method.',
      );
    });
  });

  describe("LREM (remove)", () => {
    it("removes the first occurrence of a present value, shifting later elements down", () => {
      const build = buildHeapIntList(packSize(3, 0, 0, 0), [10, 20, 30]);
      assertEquals(
        runToString(
          ...build,
          [PCode.dupl],
          [PCode.ldin, 20],
          [PCode.lrem, INT_1D],
          [PCode.lprt, INT_1D],
        ),
        "[10, 30]",
      );
    });

    it("is a silent no-op if the value isn't present", () => {
      const build = buildHeapIntList(packSize(3, 0, 0, 0), [10, 20, 30]);
      assertEquals(
        runToString(
          ...build,
          [PCode.dupl],
          [PCode.ldin, 99],
          [PCode.lrem, INT_1D],
          [PCode.lprt, INT_1D],
        ),
        "[10, 20, 30]",
      );
    });

    it("compares string-list elements by content, not pointer identity", () => {
      // two independently-heap-allocated "bb" strings - content-equal, but
      // different addresses. Removing the second must still work.
      const build = [
        ...buildHeapStrList(packSize(3, 0, 0, 0), ["aa", "bb", "cc"]),
        [PCode.dupl],
        str("bb"), // a *different* heap allocation with the same content
        [PCode.lrem, STR_1D],
        [PCode.lprt, STR_1D],
      ];
      assertEquals(runToString(...build), "['aa', 'cc']");
    });
  });

  describe("LREV (reverse)", () => {
    it("reverses an even-length list in place", () => {
      const build = buildHeapIntList(packSize(4, 0, 0, 0), [1, 2, 3, 4]);
      assertEquals(
        runToString(
          ...build,
          [PCode.dupl],
          [PCode.lrev, INT_1D],
          [PCode.lprt, INT_1D],
        ),
        "[4, 3, 2, 1]",
      );
    });

    it("reverses an odd-length list in place", () => {
      const build = buildHeapIntList(packSize(3, 0, 0, 0), [1, 2, 3]);
      assertEquals(
        runToString(
          ...build,
          [PCode.dupl],
          [PCode.lrev, INT_1D],
          [PCode.lprt, INT_1D],
        ),
        "[3, 2, 1]",
      );
    });
  });

  describe("LEXT (extend)", () => {
    it("extends a list within capacity", () => {
      const build = [
        ...buildHeapIntList(packSize(4, 0, 0, 0), [1]), // target, capacity 4
        [PCode.dupl],
        ...buildHeapIntList(packSize(2, 0, 0, 0), [2, 3]), // ^addlist
        [PCode.lext, INT_1D],
      ];
      assertEquals(runToString(...build, [PCode.lprt, INT_1D]), "[1, 2, 3]");
    });

    it("fails atomically: an over-capacity extend leaves the target list unchanged", () => {
      // TRY/XCPT to catch the error and keep running, so we can inspect the
      // target afterwards - LIAD (fixed address) rather than LIHP, so the
      // target's address is known independent of whatever's left on the
      // evaluation stack after the exception jump.
      const targetAddr = 200;
      const pcode = [
        /* 0 */ [PCode.try, 2],
        /* 1 */ [
          PCode.ldin,
          targetAddr,
          PCode.liad,
          packSize(2, 0, 0, 0), // target: capacity 2
          PCode.ldin,
          targetAddr,
          PCode.dupl,
          PCode.ldin,
          10,
          PCode.lapp,
          INT_1D, // target = [10]
          ...buildHeapIntList(packSize(2, 0, 0, 0), [20, 30]).flat(), // ^addlist = [20, 30]
          PCode.lext,
          INT_1D, // 1 + 2 > 2 capacity -> throws
          PCode.halt,
        ],
        /* 2 */ [
          PCode.xcpt,
          PCode.ldin,
          targetAddr,
          PCode.lprt,
          INT_1D,
          PCode.writ,
          PCode.halt,
        ],
      ];
      const { output } = runPcode(pcode);
      assertEquals(output.runtimeErrors, []);
      assertEquals(output.outputText, "[10]");
    });
  });

  describe("LCPY (copy)", () => {
    it("copies source content into destination (asymmetric fixture, to catch a direction bug loudly)", () => {
      // destination pre-filled with clearly different content to source -
      // if LCPY's direction were backwards, this would copy [100, 200, 300]
      // onto the source instead, and the destination read-back below would
      // still show the old [100, 200, 300], failing loudly. Pushing
      // destination first and source second naturally leaves source on
      // top (LCPY's required pop order: source=TOS, destination=second) -
      // no swap needed.
      const destAddr = 200;
      const build = [
        [PCode.ldin, destAddr, PCode.liad, packSize(5, 0, 0, 0)], // dest, capacity 5
        [PCode.ldin, destAddr, PCode.dupl, PCode.ldin, 100, PCode.lapp, INT_1D],
        [PCode.dupl, PCode.ldin, 200, PCode.lapp, INT_1D],
        [PCode.dupl, PCode.ldin, 300, PCode.lapp, INT_1D], // dest is now [100, 200, 300], one ^dest copy left on stack
        ...buildHeapIntList(packSize(5, 0, 0, 0), [1, 2]), // ^source = [1, 2], pushed on top of ^dest
        [PCode.lcpy, INT_1D],
        [PCode.ldin, destAddr],
        [PCode.lprt, INT_1D],
      ];
      assertEquals(runToString(...build), "[1, 2]");
    });

    it("throws when the destination's capacity is smaller than the source's length", () => {
      const destAddr = 200;
      const build = [
        [PCode.ldin, destAddr, PCode.liad, packSize(1, 0, 0, 0)], // dest, capacity 1
        [PCode.ldin, destAddr], // ^dest, pushed first
        ...buildHeapIntList(packSize(3, 0, 0, 0), [1, 2, 3]), // ^source, length 3, pushed second (ends up TOS)
        [PCode.lcpy, INT_1D],
        [PCode.halt],
      ];
      const { output } = runPcode(build);
      assertEquals(output.runtimeErrors.length, 1);
      assertEquals(
        output.runtimeErrors[0].message,
        "List has reached its maximum capacity of 1 items.",
      );
    });
  });

  describe("LMUL (multiply)", () => {
    const source = () => buildHeapIntList(packSize(2, 0, 0, 0), [1, 2]);

    it("n=0 produces an empty list", () => {
      assertEquals(
        runToString(
          ...source(),
          [PCode.ldin, 0],
          [PCode.lmul, INT_1D],
          [PCode.lprt, INT_1D],
        ),
        "[]",
      );
    });

    it("n=1 produces a copy of the same length", () => {
      assertEquals(
        runToString(
          ...source(),
          [PCode.ldin, 1],
          [PCode.lmul, INT_1D],
          [PCode.lprt, INT_1D],
        ),
        "[1, 2]",
      );
    });

    it("n>1 repeats the source n times", () => {
      assertEquals(
        runToString(
          ...source(),
          [PCode.ldin, 3],
          [PCode.lmul, INT_1D],
          [PCode.lprt, INT_1D],
        ),
        "[1, 2, 1, 2, 1, 2]",
      );
    });

    it("negative n behaves like Python's `list * n` (treated as 0)", () => {
      assertEquals(
        runToString(
          ...source(),
          [PCode.ldin, -5],
          [PCode.lmul, INT_1D],
          [PCode.lprt, INT_1D],
        ),
        "[]",
      );
    });
  });

  describe("LIDX (index)", () => {
    it("finds a present value, including at index 0 (not confused with 'not found')", () => {
      const build = buildHeapIntList(packSize(3, 0, 0, 0), [10, 20, 30]);
      assertEquals(
        runToInt(
          ...build,
          [PCode.dupl],
          [PCode.ldin, 10],
          [PCode.lidx, INT_1D],
        ),
        0,
      );
    });

    it("finds a value in the middle", () => {
      const build = buildHeapIntList(packSize(3, 0, 0, 0), [10, 20, 30]);
      assertEquals(
        runToInt(
          ...build,
          [PCode.dupl],
          [PCode.ldin, 20],
          [PCode.lidx, INT_1D],
        ),
        1,
      );
    });

    it("returns -1 for a value that isn't present", () => {
      const build = buildHeapIntList(packSize(3, 0, 0, 0), [10, 20, 30]);
      assertEquals(
        runToInt(
          ...build,
          [PCode.dupl],
          [PCode.ldin, 99],
          [PCode.lidx, INT_1D],
        ),
        -1,
      );
    });

    it("compares string-list elements by content, not pointer identity", () => {
      const build = buildHeapStrList(packSize(3, 0, 0, 0), ["aa", "bb", "cc"]);
      assertEquals(
        runToInt(...build, [PCode.dupl], str("bb"), [PCode.lidx, STR_1D]), // different heap allocation, same content
        1,
      );
    });
  });

  describe("LPRT (repr string)", () => {
    it("renders an empty list", () => {
      const build = buildHeapIntList(packSize(3, 0, 0, 0), []);
      assertEquals(runToString(...build, [PCode.lprt, INT_1D]), "[]");
    });

    it("renders an integer list", () => {
      const build = buildHeapIntList(packSize(3, 0, 0, 0), [1, 2, 3]);
      assertEquals(runToString(...build, [PCode.lprt, INT_1D]), "[1, 2, 3]");
    });

    it("renders a string list with single-quoted elements", () => {
      const build = buildHeapStrList(packSize(2, 0, 0, 0), ["a", "bb"]);
      assertEquals(runToString(...build, [PCode.lprt, STR_1D]), "['a', 'bb']");
    });
  });

  describe("multi-dimensional lists are treated as flat sequences by every operator except LIAD/LIHP", () => {
    it("LAPP/LPRT on a declared 2-D or 3-D list still just appends/renders flat", () => {
      const build2d = buildHeapIntList(packSize(4, 3, 0, 0), [1, 2, 3, 4, 5]);
      assertEquals(
        runToString(...build2d, [PCode.lprt, INT_2D]),
        "[1, 2, 3, 4, 5]",
      );
      const build3d = buildHeapStrList(packSize(2, 2, 2, 0), ["x", "y"]);
      assertEquals(runToString(...build3d, [PCode.lprt, STR_3D]), "['x', 'y']");
    });
  });
});
