import makeStatement, { type StatementCommon } from "../statement.ts";

export interface BreakStatement extends StatementCommon {
  readonly statementType: "breakStatement";
}

const makeBreakStatement = (): BreakStatement => ({
  ...makeStatement(),
  statementType: "breakStatement",
});

export default makeBreakStatement;
