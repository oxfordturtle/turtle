import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import identifier from "./identifier.ts";

type Context = "global" | "nonlocal";

const identifiers = (
  lexemes: Lexemes,
  routine: Routine,
  context: Context,
): string[] => {
  const names: string[] = [];

  const name = identifier(lexemes, routine, false);
  names.push(name);

  if (lexemes.match(",")) {
    names.push(...identifiers(lexemes, routine, context));
  } else if (lexemes.peek()?.type === "identifier") {
    throw new CompilerError(
      `Comma missing between ${context} variable declarations.`,
      lexemes.peek(-1),
    );
  }

  return names;
};

export default identifiers;
