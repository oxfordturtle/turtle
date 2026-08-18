import makeStatement, { type StatementCommon } from "../statement.ts";

export interface PassStatement extends StatementCommon {
  readonly statementType: "passStatement";
}

const makePassStatement = (): PassStatement => ({
  ...makeStatement(),
  statementType: "passStatement",
});

export default makePassStatement;
