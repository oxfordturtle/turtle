import type { Lexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { ParserContext } from "../definitions/context.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import makeProgram, { type Program } from "../definitions/routines/program.ts";
import type { Subroutine } from "../definitions/routines/subroutine.ts";
import statement from "./statement.ts";
import subroutine from "./subroutine.ts";

export default (lexemes: Lexemes, context: ParserContext): Program => {
  const program = makeProgram("Python");
  lexemes.setBody(program, 0, lexemes.length);

  parseBody(lexemes, context, program);

  checkForUncertainTypes(program);

  return program;
};

const parseBody = (
  lexemes: Lexemes,
  context: ParserContext,
  routine: Program | Subroutine,
): void => {
  let indents = 0;
  lexemes.seekBody(routine);
  while (lexemes.inBody(routine)) {
    const lexeme = lexemes.peek() as Lexeme;
    lexemes.advance();
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

  lexemes.seekBody(routine);
  while (lexemes.inBody(routine)) {
    routine.statements.push(
      statement(lexemes.peek() as Lexeme, lexemes, context, routine),
    );
  }
  for (const sub of routine.subroutines) {
    parseBody(lexemes, context, sub);
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
