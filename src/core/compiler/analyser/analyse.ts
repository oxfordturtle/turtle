import {
  type Category,
  category,
  type Command,
  commandCategories,
  type Keyword,
  keywordCategories,
} from "@/core/constants.ts";
import type { Lexeme } from "../lexer/lexeme.ts";
import { getAllSubroutines } from "../parser/definitions/routine.ts";
import type { Program } from "../parser/definitions/routines/program.ts";
import usageCategory, { type UsageCategory } from "./usageCategory.ts";

export default (lexemes: Lexeme[], program: Program): UsageCategory[] => {
  const categories: ReadonlyArray<Category<Command | Keyword>> = [
    ...commandCategories,
    ...keywordCategories[program.language],
  ];

  const usageCategories = categories.map((category) =>
    usageCategory(program.language, lexemes, category),
  );

  const subroutineCategory = category(
    30,
    "Subroutine calls",
    getAllSubroutines(program).slice(1),
  );

  // TODO: don't count subroutine definitions as subroutine calls

  const subroutineUsageCategory = usageCategory(
    program.language,
    lexemes,
    subroutineCategory,
  );

  return usageCategories
    .concat(subroutineUsageCategory)
    .filter((category) => category.expressions.length > 0);
};
