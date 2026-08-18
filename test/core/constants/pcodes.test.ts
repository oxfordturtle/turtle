import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { PCode, pcodeArgs } from "@/core/constants.ts";

// mirrors the four groups in pcodeArgs's switch statement -- kept as an
// independent list (not derived from the source) so this test would
// actually fail if someone accidentally moved a pcode between groups.
const takesVariableArgs = new Set([PCode.lstr]);

const takesOneArg = new Set([
  PCode.pick,
  PCode.true,
  PCode.try,
  PCode.lapp,
  PCode.lcpy,
  PCode.lext,
  PCode.lidx,
  PCode.lins,
  PCode.lmul,
  PCode.lpop,
  PCode.lprt,
  PCode.lrem,
  PCode.lrev,
  PCode.liad,
  PCode.lihp,
  PCode.ldel,
  PCode.ldin,
  PCode.ldvg,
  PCode.ldag,
  PCode.stvg,
  PCode.jump,
  PCode.ifno,
  PCode.subr,
  PCode.pssr,
  PCode.memr,
]);

const takesTwoArgs = new Set([
  PCode.ldvv,
  PCode.ldvr,
  PCode.ldav,
  PCode.stvv,
  PCode.stvr,
  PCode.memc,
]);

const allPCodes = Object.values(PCode).filter(
  (value): value is number => typeof value === "number",
);

describe("pcodeArgs", () => {
  it("returns -1 for pcodes with a variable-length argument list", () => {
    for (const code of takesVariableArgs) {
      assertEquals(pcodeArgs(code), -1, PCode[code]);
    }
  });

  it("returns 1 for pcodes that take a single argument", () => {
    for (const code of takesOneArg) {
      assertEquals(pcodeArgs(code), 1, PCode[code]);
    }
  });

  it("returns 2 for pcodes that take two arguments", () => {
    for (const code of takesTwoArgs) {
      assertEquals(pcodeArgs(code), 2, PCode[code]);
    }
  });

  it("returns 0 for every other pcode", () => {
    const known = new Set([
      ...takesVariableArgs,
      ...takesOneArg,
      ...takesTwoArgs,
    ]);
    const others = allPCodes.filter((code) => !known.has(code));
    // sanity: this codebase has plenty of pcodes outside the three named
    // groups (e.g. plain stack/arithmetic operators) -- if this list were
    // empty the test below would be vacuous
    assertEquals(others.length > 0, true);
    for (const code of others) {
      assertEquals(pcodeArgs(code), 0, PCode[code]);
    }
  });
});

describe("PCode", () => {
  it("has no duplicate numeric values", () => {
    assertEquals(new Set(allPCodes).size, allPCodes.length);
  });
});
