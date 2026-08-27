export interface ContinueStatement {
  readonly kind: "continueStatement";
}

const makeContinueStatement = (): ContinueStatement => ({
  kind: "continueStatement",
});

export default makeContinueStatement;
