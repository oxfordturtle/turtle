export interface BreakStatement {
  readonly kind: "breakStatement";
}

const makeBreakStatement = (): BreakStatement => ({
  kind: "breakStatement",
});

export default makeBreakStatement;
