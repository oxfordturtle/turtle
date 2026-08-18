export interface Keyword {
  readonly __: "Keyword";
  readonly category: number;
  readonly level: number;
  readonly name: string;
}

const keyword = (category: number, level: number, name: string): Keyword => ({
  __: "Keyword",
  category,
  level,
  name,
});

const BASIC = [
  // command structures
  keyword(20, 0, "IF"),
  keyword(20, 0, "ELSE"),
  keyword(20, 0, "FOR"),
  keyword(20, 1, "REPEAT"),
  keyword(20, 1, "WHILE"),
  keyword(20, 1, "DEF"),
  // variable scope modifiers
  keyword(21, 1, "LOCAL"),
  keyword(21, 2, "PRIVATE"),
  // other keywords (not shown in usage tables)
  keyword(22, 0, "RETURN"),
  keyword(22, 0, "CONST"),
  keyword(22, 0, "DIM"),
  keyword(22, 0, "END"),
  keyword(22, 0, "ENDPROC"),
  keyword(22, 0, "THEN"),
  keyword(22, 0, "ENDIF"),
  keyword(22, 0, "TO"),
  keyword(22, 0, "STEP"),
  keyword(22, 0, "NEXT"),
  keyword(22, 0, "UNTIL"),
  keyword(22, 0, "ENDWHILE"),
] as const;

const C = [
  // command structures
  keyword(20, 0, "if"),
  keyword(20, 0, "else"),
  keyword(20, 0, "for"),
  keyword(20, 1, "while"),
  keyword(20, 1, "do"),
  // other keywords (not shown in usage tables)
  keyword(22, 0, "const"),
  keyword(22, 0, "return"),
  keyword(22, 1, "break"),
  keyword(22, 2, "continue"),
] as const;

const Java = [
  // command structures
  keyword(20, 0, "if"),
  keyword(20, 0, "else"),
  keyword(20, 0, "for"),
  keyword(20, 1, "while"),
  keyword(20, 1, "do"),
  // other keywords (not shown in usage tables)
  keyword(22, 0, "class"),
  keyword(22, 0, "final"),
  keyword(22, 0, "return"),
  keyword(22, 1, "break"),
  keyword(22, 2, "continue"),
] as const;

const Pascal = [
  // command structures
  keyword(20, 0, "if"),
  keyword(20, 0, "else"),
  keyword(20, 0, "for"),
  keyword(20, 1, "repeat"),
  keyword(20, 1, "while"),
  keyword(20, 1, "procedure"),
  keyword(20, 2, "function"),
  // other keywords (not shown in usage tables)
  keyword(22, 0, "program"),
  keyword(22, 0, "var"),
  keyword(22, 0, "const"),
  keyword(22, 0, "array"),
  keyword(22, 0, "of"),
  keyword(22, 0, "begin"),
  keyword(22, 0, "end"),
  keyword(22, 0, "then"),
  keyword(22, 0, "to"),
  keyword(22, 0, "downto"),
  keyword(22, 0, "do"),
  keyword(22, 0, "until"),
] as const;

const Python = [
  // command structures
  keyword(20, 0, "if"),
  keyword(20, 0, "else"),
  keyword(20, 0, "elif"),
  keyword(20, 0, "for"),
  keyword(20, 1, "while"),
  keyword(20, 1, "def"),
  // variable scope modifiers
  keyword(21, 1, "global"),
  keyword(21, 2, "nonlocal"),
  // other keywords (not shown in usage tables)
  keyword(22, 0, "in"),
  keyword(22, 0, "pass"),
  keyword(22, 0, "return"),
  keyword(22, 1, "break"),
  keyword(22, 2, "continue"),
] as const;

const TypeScript = [
  // command structures
  keyword(20, 0, "if"),
  keyword(20, 0, "else"),
  keyword(20, 0, "for"),
  keyword(20, 1, "while"),
  keyword(20, 1, "do"),
  keyword(20, 1, "function"),
  // other keywords (not shown in usage tables)
  keyword(22, 0, "var"),
  keyword(22, 0, "const"),
  keyword(22, 0, "return"),
  keyword(22, 1, "break"),
  keyword(22, 2, "continue"),
];

export const keywords = {
  BASIC,
  C,
  Java,
  Pascal,
  Python,
  TypeScript,
} as const;
