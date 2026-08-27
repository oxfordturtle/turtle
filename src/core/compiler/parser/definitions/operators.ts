import type { Language } from "@/core/constants.ts";
import type { Lexeme } from "../../lexer/lexeme.ts";
import type { Operator, Type } from "../../lexer/types.ts";

/**
 * One rung of a language's precedence ladder, loosest first. A `unary`
 * level is a prefix operator rather than an infix one (Python's "not" is
 * the only one); every other level is a set of binary operators that
 * `common/expression.ts` applies left to right.
 *
 * The tightest-binding operators - "neg" and the C-family's "!"/"~" - have
 * no rung at all: they're prefixes parsed by `common/factor.ts`, which is
 * where the ladder bottoms out.
 */
export type PrecedenceLevel = {
  readonly operators: readonly Operator[];
  readonly unary?: true;
};

const comparisons: readonly Operator[] = [
  "eqal",
  "less",
  "lseq",
  "more",
  "mreq",
  "noeq",
  "seql",
  "sles",
  "sleq",
  "smor",
  "smeq",
  "sneq",
];

/**
 * Pascal's own precedence: "not" tightest, then (* / div mod and), then
 * (+ - or xor), then the comparisons - which is why Pascal requires
 * brackets around the operands of "and"/"or" when they are comparisons.
 *
 * BASIC keeps this table too. Turtle's BASIC is modelled on BBC BASIC, whose
 * AND/OR/EOR are bitwise operators over integers rather than logical
 * connectives, so they can't follow `bitwiseLevels` below without also moving
 * BASIC's only spelling of "and"/"or" - and BBC BASIC's own rule is this one.
 */
const pascalLevels: readonly PrecedenceLevel[] = [
  { operators: comparisons },
  { operators: ["plus", "scat", "subt", "or", "orl", "xor"] },
  { operators: ["and", "andl", "div", "divr", "mod", "mult"] },
];

/**
 * The additive and multiplicative rungs shared by the four languages whose
 * logical operators bind looser than their comparisons.
 */
const arithmeticLevels: readonly PrecedenceLevel[] = [
  { operators: ["plus", "scat", "subt"] },
  { operators: ["div", "divr", "mod", "mult"] },
];

/**
 * The bitwise "|", "^" and "&", three rungs of their own in that order, as
 * they are in both real Python and the real C family. They are looser than
 * every arithmetic operator in both, so "a + b & c" is "(a + b) & c"; where
 * the two families differ is only in where the trio as a whole sits relative
 * to the comparisons, which is why this is spliced into each ladder below at
 * a different point rather than shared wholesale.
 */
const bitwiseLevels: readonly PrecedenceLevel[] = [
  { operators: ["or"] },
  { operators: ["xor"] },
  { operators: ["and"] },
];

/**
 * C, Java and TypeScript: "||" loosest, then "&&", then the bitwise trio,
 * then the comparisons. All three really do put the bitwise operators looser
 * than "==", so "x & 1 == 0" means "x & (1 == 0)" - the classic C gotcha,
 * faithfully reproduced. Turtle catches it where C and JavaScript don't,
 * though: "integer & boolean" fails `common/typeCheck.ts`, so the mis-parse
 * is a compile error rather than a silent zero, as it is in real Java and
 * real TypeScript.
 *
 * The comparisons share one rung here, where real C splits the relational
 * operators from the equality ones. That doesn't affect the bitwise
 * placement - "&" is looser than both halves in real C - so the trio sits
 * below the merged rung and is right either way.
 */
const cFamilyLevels: readonly PrecedenceLevel[] = [
  { operators: ["orl"] },
  { operators: ["andl"] },
  ...bitwiseLevels,
  { operators: comparisons },
  ...arithmeticLevels,
];

/**
 * Python, which puts the bitwise trio on the other side of the comparisons -
 * so "x & 1 == 0" means "(x & 1) == 0", the reading the C family denies you -
 * and additionally puts "not" on its own rung between "and" and the
 * comparisons, so "not x == y" means "not (x == y)". (C/Java/TypeScript's "!"
 * genuinely *is* tighter than "==", so it stays in `common/factor.ts` with
 * the other prefixes.)
 */
const pythonLevels: readonly PrecedenceLevel[] = [
  { operators: ["orl"] },
  { operators: ["andl"] },
  { operators: ["not"], unary: true },
  { operators: comparisons },
  ...bitwiseLevels,
  ...arithmeticLevels,
];

export const precedence: Record<Language, readonly PrecedenceLevel[]> = {
  BASIC: pascalLevels,
  C: cFamilyLevels,
  Java: cFamilyLevels,
  Pascal: pascalLevels,
  Python: pythonLevels,
  TypeScript: cFamilyLevels,
};

/** The operator this lexeme is, if it's one of the operators at this level. */
export const operator = (
  lexeme: Lexeme,
  level: PrecedenceLevel,
): Operator | undefined =>
  level.operators.find(
    (x) => lexeme.type === "operator" && lexeme.subtype === x,
  );

/**
 * The index of the level holding the comparison operators. Python's
 * membership tests ("x in y") bind like a comparison but can't live in the
 * table itself (see `common/expression.ts`), so they need to know which
 * rung to join.
 */
export const comparisonLevel = (language: Language): number =>
  precedence[language].findIndex((level) => level.operators.includes("eqal"));

export const operatorType: Record<Operator, Type> = {
  not: "boolean",
  eqal: "boolean",
  less: "boolean",
  lseq: "boolean",
  more: "boolean",
  mreq: "boolean",
  noeq: "boolean",
  seql: "boolean",
  sles: "boolean",
  sleq: "boolean",
  smor: "boolean",
  smeq: "boolean",
  sneq: "boolean",
  or: "boolint",
  orl: "boolint",
  xor: "boolint",
  and: "boolint",
  andl: "boolint",
  plus: "integer",
  subt: "integer",
  div: "integer",
  divr: "integer",
  mod: "integer",
  mult: "integer",
  neg: "integer",
  scat: "string",
  // a placeholder: lmul's real element kind is on the expression, in
  // CompoundExpression.listElementKind
  lmul: "integer",
  smul: "string",
  lin: "boolean",
  lnin: "boolean",
  sin: "boolean",
  snin: "boolean",
};

export const stringOperator = (operator: Operator): Operator => {
  const stringOperators: Partial<Record<Operator, Operator>> = {
    eqal: "seql",
    less: "sles",
    lseq: "sleq",
    more: "smor",
    mreq: "smeq",
    noeq: "sneq",
    plus: "scat",
  };

  return stringOperators[operator] ?? operator;
};
