import { PCode } from "@/core/constants.ts";
import makeVariableValue, {
  type VariableValue,
} from "../../parser/definitions/expressions/variableValue.ts";
import type { Program } from "../../parser/definitions/routines/program.ts";
import expression from "../expression.ts";
import merge from "../merge.ts";
import type { Options } from "../options.ts";

/**
 * Reads "x[i]", and "wins[i][j]" for a list-of-lists. The fixed-array
 * TEST/PLUS/INCR/LPTR sequence (variableValue.ts's array branch) adapted to a
 * *runtime* base address and a 5-cell header rather than a fixed array's 1-cell
 * one.
 *
 * A negative index is normalised before the TEST bounds check, which only
 * understands [0, length). Since this only runs for Python, LESS always pushes
 * exactly 1 or 0, so the "i<0 ? i+length : i" collapses into the branchless
 * "i + (i<0)*length".
 *
 * A second-level base is a transient stack value with no name to re-evaluate,
 * so it is duplicated with DUPL/ROLL where the first level just re-reads the
 * variable.
 *
 * The trailing LPTR is deliberate: the write path
 * (encoder/statements/variableAssignment.ts) reuses this encoding and swaps it
 * for SPTR.
 */
export default (
  exp: VariableValue,
  program: Program,
  options: Options,
): number[][] => {
  const baseVariableExp = makeVariableValue(exp.lexeme, exp.variable); // same variable, no indexes
  const pcode: number[][] = [];

  merge(pcode, expression(baseVariableExp, program, options)); // base
  merge(pcode, expression(exp.indexes[0], program, options)); // base, i
  merge(pcode, [[PCode.dupl, PCode.ldin, 0, PCode.less]]); // base, i, (i<0 ? 1 : 0)
  merge(pcode, expression(baseVariableExp, program, options)); // base, i, neg, base
  merge(pcode, [[PCode.lptr, PCode.mult, PCode.plus]]); // base, i2 = i + neg*length
  merge(pcode, [
    [PCode.swap, PCode.test, PCode.plus, PCode.ldin, 5, PCode.plus],
  ]); // address

  // list-of-lists: dereference the previous level's element address to get this
  // sublist's base pointer, then repeat
  for (let level = 1; level < exp.indexes.length; level += 1) {
    merge(pcode, [[PCode.lptr]]); // base (this level's sublist pointer)
    merge(pcode, [[PCode.dupl]]); // base, base
    merge(pcode, expression(exp.indexes[level], program, options)); // base, base, i
    merge(pcode, [[PCode.dupl, PCode.ldin, 0, PCode.less]]); // base, base, i, (i<0 ? 1 : 0)
    merge(pcode, [[PCode.ldin, 4, PCode.roll]]); // base, i, neg, base
    merge(pcode, [[PCode.lptr, PCode.mult, PCode.plus]]); // base, i2 = i + neg*length
    merge(pcode, [
      [PCode.swap, PCode.test, PCode.plus, PCode.ldin, 5, PCode.plus],
    ]); // address
  }

  merge(pcode, [[PCode.lptr]]);

  return pcode;
};
