import { PCode } from "@/core/constants.ts";
import type { Program } from "../../parser/definitions/routines/program.ts";
import type { RepeatStatement } from "../../parser/definitions/statements/repeatStatement.ts";
import expression from "../expression.ts";
import {
  makeLoopContext,
  patchBreaks,
  patchContinues,
} from "../loopContext.ts";
import merge from "../merge.ts";
import type { Options } from "../options.ts";
import statement from "../statement.ts";

// No parser produces a "break"/"continue" inside a "repeat" body - only Python
// parses them, and Python has no "repeat" - so the back-patch calls below are
// unreachable. Wired up anyway, since the mechanism is the same as
// whileStatement.ts's.
export default (
  stmt: RepeatStatement,
  program: Program,
  startLine: number,
  options: Options,
): number[][] => {
  const loopContext = makeLoopContext();
  const pcode: number[][] = [];

  for (const subStmt of stmt.statements) {
    const subStartLine = startLine + pcode.length;
    pcode.push(
      ...statement(subStmt, program, subStartLine, options, loopContext),
    );
  }

  // "continue" re-tests the until-condition immediately
  const conditionStartLine = startLine + pcode.length;

  const condition = expression(stmt.condition, program, options);
  merge(condition, [[PCode.ifno, startLine]]);
  pcode.push(...condition);

  patchBreaks(loopContext, startLine + pcode.length);
  patchContinues(loopContext, conditionStartLine);

  return pcode;
};
