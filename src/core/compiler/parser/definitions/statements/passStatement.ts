export interface PassStatement {
  readonly kind: "passStatement";
}

const makePassStatement = (): PassStatement => ({
  kind: "passStatement",
});

export default makePassStatement;
