import makeStatement, { type StatementCommon } from "../statement.ts";

export interface ContinueStatement extends StatementCommon {
  readonly statementType: "continueStatement";
}

const makeContinueStatement = (): ContinueStatement => ({
  ...makeStatement(),
  statementType: "continueStatement",
});

export default makeContinueStatement;
