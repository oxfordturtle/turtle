import type { Lexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import makeProgram, { type Program } from "../definitions/routines/program.ts";
import type { Subroutine } from "../definitions/routines/subroutine.ts";
import statement from "./statement.ts";
import subroutine from "./subroutine.ts";

export default (lexemes: Lexemes): Program => {
  const program = makeProgram("Python");
  program.end = lexemes.lexemes.length;

  parseBody(lexemes, program);

  checkForUncertainTypes(program);

  return program;
};

const parseBody = (lexemes: Lexemes, routine: Program | Subroutine): void => {
  let indents = 0;
  lexemes.index = routine.start;
  while (lexemes.index < routine.end) {
    const lexeme = lexemes.get() as Lexeme;
    lexemes.next();
    switch (lexeme.type) {
      case "indent":
        indents += 1;
        break;

      case "dedent":
        indents -= 1;
        break;

      case "keyword":
        if (lexeme.subtype === "def") {
          routine.subroutines.push(
            subroutine(lexeme, lexemes, routine, indents),
          );
        }
        break;
    }
  }

  lexemes.index = routine.start;
  while (lexemes.index < routine.end) {
    routine.statements.push(
      statement(lexemes.get() as Lexeme, lexemes, routine),
    );
  }
  for (const sub of routine.subroutines) {
    parseBody(lexemes, sub);
  }
};

const checkForUncertainTypes = (routine: Program | Subroutine): void => {
  const untypedVariable = routine.variables.find((x) => !x.typeIsCertain);
  if (untypedVariable) {
    throw new CompilerError(
      `Could not infer the type of variable ${untypedVariable.name}.`,
    );
  }

  routine.subroutines.forEach(checkForUncertainTypes);
};
