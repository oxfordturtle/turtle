import { type Expression, foldCase, type Language } from "@/core/constants.ts";
import type { Lexeme } from "../lexer/lexeme.ts";

export interface UsageExpression {
  readonly name: string;
  readonly level: number;
  readonly count: number;
  readonly lines: string;
}

const usageExpression = (
  language: Language,
  lexemes: Lexeme[],
  expression: Expression,
): UsageExpression => {
  const name =
    expression.kind === "Command"
      ? expression.names[language]!
      : expression.name;

  const searchName = foldCase(language, name);
  const uses = lexemes.filter(
    (lexeme) => foldCase(language, lexeme.content) === searchName,
  );
  uses.sort((a, b) => a.line - b.line);

  return {
    name: searchName,
    level: expression.level + 1,
    count: uses.length,
    lines: uses.reduce((x, y) => `${x} ${y.line.toString(10)}`, "").trim(),
  };
};

export default usageExpression;
