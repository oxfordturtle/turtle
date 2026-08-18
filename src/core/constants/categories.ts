import type { Subroutine } from "../compiler/parser/definitions/routines/subroutine.ts";
import { type Command, commands } from "./commands.ts";
import { type Keyword, keywords } from "./keywords.ts";
import type { Language } from "./languages.ts";

export type Expression = Command | Keyword | Subroutine;

export interface Category<Exp extends Expression> {
  readonly __: "Category";
  readonly index: number;
  readonly title: string;
  readonly expressions: ReadonlyArray<Exp>;
}

export const category = <Exp extends Expression>(
  index: number,
  title: string,
  expressions: ReadonlyArray<Exp>,
): Category<Exp> => ({
  __: "Category",
  index,
  title,
  expressions,
});

export const commandCategories = [
  category(
    0,
    "Turtle: relative movement",
    commands.filter((x) => x.category === 0),
  ),
  category(
    1,
    "Turtle: absolute movement",
    commands.filter((x) => x.category === 1),
  ),
  category(
    2,
    "Turtle: drawing shapes",
    commands.filter((x) => x.category === 2),
  ),
  category(
    3,
    "Other Turtle commands",
    commands.filter((x) => x.category === 3),
  ),
  category(
    4,
    "Canvas operations",
    commands.filter((x) => x.category === 4),
  ),
  category(
    5,
    "General arithmetic functions",
    commands.filter((x) => x.category === 5),
  ),
  category(
    6,
    "Trig / exp / log functions",
    commands.filter((x) => x.category === 6),
  ),
  category(
    7,
    "String operations",
    commands.filter((x) => x.category === 7),
  ),
  category(
    8,
    "Type conversion routines",
    commands.filter((x) => x.category === 8),
  ),
  category(
    9,
    "Input and timing routines",
    commands.filter((x) => x.category === 9),
  ),
  category(
    10,
    "File processing",
    commands.filter((x) => x.category === 10),
  ),
  category(
    11,
    "Turtle Machine monitoring",
    commands.filter((x) => x.category === 11),
  ),
] as const;

export const keywordCategories: Record<
  Language,
  ReadonlyArray<Category<Keyword>>
> = {
  BASIC: [
    category(
      20,
      "Command structures",
      keywords.BASIC.filter((x) => x.category === 20),
    ),
    category(
      21,
      "Variable scope modifiers",
      keywords.BASIC.filter((x) => x.category === 21),
    ),
  ],
  C: [
    category(
      20,
      "Command structures",
      keywords.C.filter((x) => x.category === 20),
    ),
  ],
  Java: [
    category(
      20,
      "Command structures",
      keywords.Java.filter((x) => x.category === 20),
    ),
  ],
  Pascal: [
    category(
      20,
      "Command structures",
      keywords.Pascal.filter((x) => x.category === 20),
    ),
  ],
  Python: [
    category(
      20,
      "Command structures",
      keywords.Python.filter((x) => x.category === 20),
    ),
    category(
      21,
      "Variable scope modifiers",
      keywords.Python.filter((x) => x.category === 21),
    ),
  ],
  TypeScript: [
    category(
      20,
      "Command structures",
      keywords.TypeScript.filter((x) => x.category === 20),
    ),
  ],
};
