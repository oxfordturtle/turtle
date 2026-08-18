import { PCode } from "@/core/constants.ts";
import type { Program } from "../../parser/definitions/routines/program.ts";
import type { WhileStatement } from "../../parser/definitions/statements/whileStatement.ts";
import expression from "../expression.ts";
import {
  makeLoopContext,
  patchBreaks,
  patchContinues,
} from "../loopContext.ts";
import merge from "../merge.ts";
import type { Options } from "../options.ts";
import statement from "../statement.ts";

export default (
  stmt: WhileStatement,
  program: Program,
  startLine: number,
  options: Options,
): number[][] => {
  // computed before the substatements, because the condition's real length -
  // more than one line when it calls a subroutine - is what the substatements'
  // own start lines are derived from
  const condition = expression(stmt.condition, program, options);

  const loopContext = makeLoopContext();

  const pcode: number[][] = [];
  for (const subStmt of stmt.statements) {
    const subStartLine = startLine + condition.length + pcode.length;
    pcode.push(
      ...statement(subStmt, program, subStartLine, options, loopContext),
    );
  }

  const nextLine = startLine + condition.length + pcode.length + 1; // +1 for last line
  merge(condition, [[PCode.ifno, nextLine]]);
  pcode.unshift(...condition);

  pcode.push([PCode.jump, startLine]);

  patchBreaks(loopContext, nextLine);
  patchContinues(loopContext, startLine);

  return pcode;
};
