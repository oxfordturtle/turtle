import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import makeVariable, { type Variable } from "../definitions/variable.ts";
import identifier from "./identifier.ts";
import parseSemicolon from "./statements/semicolon.ts";
import type from "./type.ts";

export function variables(lexemes: Lexemes, routine: Routine): Variable[] {
  const vars: Variable[] = [];

  while (lexemes.get() && lexemes.get()?.content !== ":") {
    const name = identifier(lexemes, routine);
    vars.push(makeVariable(name, routine));
    if (lexemes.get()?.content === ",") {
      lexemes.next();
    } else if (lexemes.get()?.type === "identifier") {
      throw new CompilerError(
        "Comma missing between variable names.",
        lexemes.get(),
      );
    }
  }

  const [variableType, stringLength, arrayDimensions] = type(
    lexemes,
    routine,
    false,
  );
  for (const foo of vars) {
    foo.type = variableType;
    foo.stringLength = stringLength;
    foo.arrayDimensions = arrayDimensions;
  }

  parseSemicolon(lexemes, true, "variable declaration");

  // a comment may separate one variable declaration from the next (e.g.
  // documenting what each variable is for, right after its semicolon)
  while (lexemes.get()?.type === "comment") {
    lexemes.next();
  }

  // an identifier next means more variable declarations
  if (lexemes.get() && lexemes.get()?.type === "identifier") {
    vars.push(...variables(lexemes, routine));
  }

  return vars;
}
