import type { KeywordLexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Program } from "../definitions/routines/program.ts";
import makeSubroutine, {
  getSubroutineType,
  type Subroutine,
} from "../definitions/routines/subroutine.ts";
import makeVariable, { type Variable } from "../definitions/variable.ts";
import { subroutineName } from "./identifier.ts";
import parseNewLine from "./statements/newLine.ts";
import { variable } from "./variable.ts";

export default (
  lexeme: KeywordLexeme,
  lexemes: Lexemes,
  program: Program,
): Subroutine => {
  const [name, subroutineType, type, stringLength] = subroutineName(lexemes);

  const subroutine = makeSubroutine(lexeme, program, name);
  subroutine.index = program.subroutines.length + 1;
  if (subroutineType === "function") {
    const returnVariable = makeVariable("!result", subroutine);
    returnVariable.type = type;
    returnVariable.stringLength = stringLength;
    subroutine.variables.push(returnVariable);
  }

  // parameters are permissible here
  if (lexemes.get()?.content === "(") {
    lexemes.next();
    subroutine.variables.push(...parameters(lexemes, subroutine));
  }

  if (!lexemes.get()) {
    throw new CompilerError(
      "No statements found after subroutine declaration.",
      lexemes.get(-1),
    );
  }
  parseNewLine(lexemes);

  subroutine.start = lexemes.index;

  // move past all inner lexemes
  let finished = false;
  if (getSubroutineType(subroutine) === "procedure") {
    // procedure
    while (lexemes.get() && !finished) {
      finished = lexemes.get()?.content === "ENDPROC";
      lexemes.next();
    }
  } else {
    // function
    while (lexemes.get() && !finished) {
      if (
        lexemes.get()?.content === "=" &&
        lexemes.get(-1)?.type === "newline"
      ) {
        finished = true;
        while (lexemes.get() && lexemes.get()?.type !== "newline") {
          lexemes.next(); // move past everything up to the next line break
        }
      } else {
        lexemes.next();
      }
    }
  }

  subroutine.end =
    getSubroutineType(subroutine) === "procedure"
      ? lexemes.index - 2
      : lexemes.index;

  // check for subroutine end
  if (!finished) {
    if (getSubroutineType(subroutine) === "procedure") {
      throw new CompilerError(
        `Procedure "${subroutine.name}" does not have an end (expected "ENDPROC").`,
        lexemes.lexemes[subroutine.start],
      );
    }
    throw new CompilerError(
      `Function "${subroutine.name}" does not have an end (expected "=<expression>").`,
      lexemes.lexemes[subroutine.end],
    );
  }

  // new line check
  parseNewLine(lexemes);

  return subroutine;
};

function parameters(lexemes: Lexemes, subroutine: Subroutine): Variable[] {
  const parameters: Variable[] = [];
  while (lexemes.get()?.content !== ")") {
    let isReferenceParameter = false;
    if (lexemes.get()?.content === "RETURN") {
      isReferenceParameter = true;
      lexemes.next();
    }
    const parameter = variable(lexemes, subroutine);
    parameter.isParameter = true;
    parameter.isReferenceParameter = isReferenceParameter;
    // brackets here "()" means array parameter
    if (lexemes.get()?.content === "(") {
      parameter.arrayDimensions.push([0, 0]); // give dummy array dimensions
      lexemes.next();
      if (!lexemes.get() || lexemes.get()?.content !== ")") {
        throw new CompilerError(
          "Closing bracket missing after array parameter specification.",
          lexemes.get(-1),
        );
      }
      lexemes.next();
    }
    parameters.push(parameter);
    if (lexemes.get()?.content === ",") {
      lexemes.next();
    }
  }

  // deno-coverage-ignore-start -- unreachable: the loop above only exits when
  // the current lexeme is ")" (a dry stream re-enters the loop, where the
  // identifier check inside variable() throws first), so the current lexeme
  // is always ")" here
  if (lexemes.get()?.content !== ")") {
    throw new CompilerError(
      "Closing bracket missing after method parameters.",
      lexemes.get(-1),
    );
  }
  // deno-coverage-ignore-stop
  lexemes.next();

  return parameters;
}
