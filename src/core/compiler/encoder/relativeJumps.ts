import { PCode, pcodeArgs } from "@/core/constants.ts";

/**
 * `PCode.jump`/`PCode.ifno` take an **absolute** line number, which an
 * expression cannot know: only statement encoders are handed a `startLine`, and
 * the same expression fragment may be built more than once and merged into
 * several places.
 *
 * So an expression emits a **relative** target - "n lines below the line I am
 * on" - and `resolve` converts it once the whole program is assembled. The
 * distance survives assembly because fragments are only ever glued end to end,
 * so nothing can be inserted between a jump and its target, and `addHCLR`, the
 * one pass that edits assembled code, never adds a line.
 *
 * A relative target is encoded as a negative number, which no absolute line
 * number can be, so an unresolved one can never be mistaken for a real line.
 */
export const relativeJump = (distance: number): number => {
  if (distance < 1) {
    // a zero or backwards distance would be indistinguishable from an absolute
    // target once negated. Unreachable from the current caller; this guards the
    // convention for whoever emits the next one.
    throw new Error(
      `Relative jump distance must be at least 1 (got ${distance}).`,
    );
  }
  return -distance;
};

/**
 * Rewrites every relative jump target emitted above into an absolute one. The
 * "+ 1" is the machine's convention that a jump operand is a *one-based* line
 * number (`runtime.ts` does `state.line = operand - 1`).
 */
export const resolve = (pcode: number[][]): void => {
  for (let line = 0; line < pcode.length; line += 1) {
    let i = 0;
    while (i < pcode[line].length) {
      const code = pcode[line][i];
      if (
        (code === PCode.jump || code === PCode.ifno) &&
        pcode[line][i + 1] < 0
      ) {
        pcode[line][i + 1] = line - pcode[line][i + 1] + 1;
      }
      const args = pcodeArgs(code);
      i += args === -1 ? pcode[line][i + 1] + 2 : args + 1;
    }
  }
};
