import { examples } from "./examples.ts";

export interface ExampleGroup {
  readonly __: "ExampleGroup";
  readonly index: number;
  readonly id: ExampleGroupId;
  readonly title: string;
  readonly examples: ReadonlyArray<(typeof examples)[number]>;
}

export type ExampleGroupId =
  | "CSAC"
  | "Drawing"
  | "Procedures"
  | "Further"
  | "Movement"
  | "Interaction"
  | "Files"
  | "Cellular"
  | "Models"
  | "Fractals"
  | "Logic&CS";

const exampleGroup = (
  index: number,
  id: ExampleGroupId,
  title: string,
): ExampleGroup => ({
  __: "ExampleGroup",
  index,
  id,
  title,
  examples: examples.filter((example) => example.groupId === id),
});

export const exampleGroups = [
  exampleGroup(0, "CSAC", "computer science across the curriculum"),
  exampleGroup(1, "Drawing", "drawing and counting loops"),
  exampleGroup(2, "Procedures", "procedures, functions and recursion"),
  exampleGroup(3, "Further", "further commands and structures"),
  exampleGroup(4, "Movement", "smooth movement and bouncing"),
  // exampleGroup(5, "Files", "file and directory handling"),
  exampleGroup(5, "Interaction", "user input, interaction and games"),
  exampleGroup(6, "Cellular", "cellular models"),
  exampleGroup(7, "Models", "other models"),
  exampleGroup(8, "Fractals", "self-similarity and chaos"),
  exampleGroup(9, "Logic&CS", "computer science and logic"),
] as const;
