import type { BreakStatement } from "./statements/breakStatement.ts";
import type { ContinueStatement } from "./statements/continueStatement.ts";
import type { ForStatement } from "./statements/forStatement.ts";
import type { IfStatement } from "./statements/ifStatement.ts";
import type { PassStatement } from "./statements/passStatement.ts";
import type { ProcedureCall } from "./statements/procedureCall.ts";
import type { RepeatStatement } from "./statements/repeatStatement.ts";
import type { ReturnStatement } from "./statements/returnStatement.ts";
import type { VariableAssignment } from "./statements/variableAssignment.ts";
import type { WhileStatement } from "./statements/whileStatement.ts";

export type Statement =
  | VariableAssignment
  | ProcedureCall
  | IfStatement
  | ForStatement
  | RepeatStatement
  | WhileStatement
  | ReturnStatement
  | PassStatement
  | BreakStatement
  | ContinueStatement;

export interface StatementCommon {
  readonly __: "Statement";
}

const makeStatement = (): StatementCommon => ({
  __: "Statement",
});

export default makeStatement;
