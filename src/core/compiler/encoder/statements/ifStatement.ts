import { PCode } from "@/core/constants.ts";
import type { Program } from "../../parser/definitions/routines/program.ts";
import type { IfStatement } from "../../parser/definitions/statements/ifStatement.ts";
import expression from "../expression.ts";
import type { LoopContext } from "../loopContext.ts";
import merge from "../merge.ts";
import type { Options } from "../options.ts";
import statement from "../statement.ts";

export default (
  stmt: IfStatement,
  program: Program,
  startLine: number,
  options: Options,
  // forwarded unchanged: an "if" starts no loop, so a break/continue inside it
  // targets whatever loop the "if" is itself nested in
  loopContext: LoopContext | null,
): number[][] => {
  const firstLines = expression(stmt.condition, program, options);

  const ifPcode: number[][] = [];
  for (const subStmt of stmt.ifStatements) {
    const subStartLine = startLine + ifPcode.length + firstLines.length;
    ifPcode.push(
      ...statement(subStmt, program, subStartLine, options, loopContext),
    );
  }

  const elsePcode: number[][] = [];
  for (const subStmt of stmt.elseStatements) {
    const subStartLine =
      startLine + ifPcode.length + elsePcode.length + firstLines.length + 1;
    elsePcode.push(
      ...statement(subStmt, program, subStartLine, options, loopContext),
    );
  }

  if (elsePcode.length === 0) {
    merge(firstLines, [
      [PCode.ifno, startLine + ifPcode.length + firstLines.length],
    ]);
    ifPcode.unshift(...firstLines);
    return ifPcode;
  }

  merge(firstLines, [
    [PCode.ifno, startLine + ifPcode.length + firstLines.length + 1],
  ]);

  const middleLine = [
    PCode.jump,
    startLine + ifPcode.length + elsePcode.length + firstLines.length + 1,
  ];

  ifPcode.unshift(...firstLines);
  ifPcode.push(middleLine);
  return ifPcode.concat(elsePcode);
};
