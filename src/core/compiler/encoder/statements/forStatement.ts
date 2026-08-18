import { PCode } from "@/core/constants.ts";
import type { Program } from "../../parser/definitions/routines/program.ts";
import type { ForStatement } from "../../parser/definitions/statements/forStatement.ts";
import expression from "../expression.ts";
import {
  makeLoopContext,
  patchBreaks,
  patchContinues,
} from "../loopContext.ts";
import merge from "../merge.ts";
import type { Options } from "../options.ts";
import statement from "../statement.ts";
import variableAssignment from "./variableAssignment.ts";

export default (
  stmt: ForStatement,
  program: Program,
  startLine: number,
  options: Options,
): number[][] => {
  // computed before the substatement loop, because their real lengths - which
  // can exceed one line each, e.g. a subroutine call in a range() bound - are
  // what the substatements' own start lines are derived from
  const initialisation = variableAssignment(
    stmt.initialisation,
    program,
    startLine,
    options,
  );
  const conditionStartLine = startLine + initialisation.length;
  const condition = expression(stmt.condition, program, options);
  const bodyStartLine = conditionStartLine + condition.length;

  // "continue" targets changeStartLine, not conditionStartLine: skipping the
  // increment is the classic infinite loop here
  const loopContext = makeLoopContext();

  const pcode: number[][] = [];
  for (const subStmt of stmt.statements) {
    const subStartLine = bodyStartLine + pcode.length;
    pcode.push(
      ...statement(subStmt, program, subStartLine, options, loopContext),
    );
  }

  const changeStartLine = bodyStartLine + pcode.length;
  const change = variableAssignment(
    stmt.change,
    program,
    changeStartLine,
    options,
  );
  merge(change, [[PCode.jump, conditionStartLine]]);

  const exitLine = changeStartLine + change.length;
  merge(condition, [[PCode.ifno, exitLine]]);

  patchBreaks(loopContext, exitLine);
  patchContinues(loopContext, changeStartLine);

  return [...initialisation, ...condition, ...pcode, ...change];
};
