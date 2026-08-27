import type { Program } from "../parser/definitions/routines/program.ts";
import type { Statement } from "../parser/definitions/statement.ts";
import type { LoopContext } from "./loopContext.ts";
import type { Options } from "./options.ts";
import breakStatement from "./statements/breakStatement.ts";
import continueStatement from "./statements/continueStatement.ts";
import forStatement from "./statements/forStatement.ts";
import ifStatement from "./statements/ifStatement.ts";
import procedureCall from "./statements/procedureCall.ts";
import repeatStatement from "./statements/repeatStatement.ts";
import returnStatement from "./statements/returnStatement.ts";
import variableAssignment from "./statements/variableAssignment.ts";
import whileStatement from "./statements/whileStatement.ts";

export default (
  stmt: Statement,
  program: Program,
  startLine: number,
  options: Options,
  // non-null only while encoding inside a loop's body; "if" forwards it
  // unchanged, since it starts no loop of its own - see loopContext.ts
  loopContext: LoopContext | null = null,
): number[][] => {
  switch (stmt.kind) {
    case "variableAssignment":
      return variableAssignment(stmt, program, startLine, options);
    case "procedureCall":
      return procedureCall(stmt, program, startLine, options);
    case "ifStatement":
      return ifStatement(stmt, program, startLine, options, loopContext);
    case "forStatement":
      return forStatement(stmt, program, startLine, options);
    case "repeatStatement":
      return repeatStatement(stmt, program, startLine, options);
    case "whileStatement":
      return whileStatement(stmt, program, startLine, options);
    case "returnStatement":
      return returnStatement(stmt, program, startLine, options);
    case "passStatement":
      return [];
    case "breakStatement":
      // non-null: the parser's loopDepth check guarantees it
      return breakStatement(loopContext as LoopContext);
    case "continueStatement":
      return continueStatement(loopContext as LoopContext);
  }
};
