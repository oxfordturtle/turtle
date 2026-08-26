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
  if (lexemes.match("(")) {
    subroutine.variables.push(...parameters(lexemes, subroutine));
  }

  if (lexemes.atEnd()) {
    throw new CompilerError(
      "No statements found after subroutine declaration.",
      lexemes.peek(-1),
    );
  }
  parseNewLine(lexemes);

  subroutine.start = lexemes.mark();

  // move past all inner lexemes
  let finished = false;
  if (getSubroutineType(subroutine) === "procedure") {
    // procedure
    while (!lexemes.atEnd() && !finished) {
      finished = lexemes.peek()?.content === "ENDPROC";
      lexemes.advance();
    }
  } else {
    // function
    while (!lexemes.atEnd() && !finished) {
      if (
        lexemes.peek()?.content === "=" &&
        lexemes.peek(-1)?.type === "newline"
      ) {
        finished = true;
        while (!lexemes.atEnd() && lexemes.peek()?.type !== "newline") {
          lexemes.advance(); // move past everything up to the next line break
        }
      } else {
        lexemes.advance();
      }
    }
  }

  subroutine.end =
    getSubroutineType(subroutine) === "procedure"
      ? lexemes.mark() - 2
      : lexemes.mark();

  // check for subroutine end
  if (!finished) {
    if (getSubroutineType(subroutine) === "procedure") {
      throw new CompilerError(
        `Procedure "${subroutine.name}" does not have an end (expected "ENDPROC").`,
        lexemes.at(subroutine.start),
      );
    }
    throw new CompilerError(
      `Function "${subroutine.name}" does not have an end (expected "=<expression>").`,
      lexemes.at(subroutine.end),
    );
  }

  // new line check
  parseNewLine(lexemes);

  return subroutine;
};

function parameters(lexemes: Lexemes, subroutine: Subroutine): Variable[] {
  const parameters: Variable[] = [];
  while (lexemes.peek()?.content !== ")") {
    let isReferenceParameter = false;
    if (lexemes.peek()?.content === "RETURN") {
      isReferenceParameter = true;
      lexemes.advance();
    }
    const parameter = variable(lexemes, subroutine);
    parameter.isParameter = true;
    parameter.isReferenceParameter = isReferenceParameter;
    // brackets here "()" means array parameter
    if (lexemes.peek()?.content === "(") {
      parameter.arrayDimensions.push([0, 0]); // give dummy array dimensions
      lexemes.advance();
      lexemes.expectAfter(
        ")",
        "Closing bracket missing after array parameter specification.",
      );
    }
    parameters.push(parameter);
    lexemes.match(",");
  }

  // deno-coverage-ignore-start -- unreachable: the loop above only exits when
  // the current lexeme is ")" (a dry stream re-enters the loop, where the
  // identifier check inside variable() throws first), so the current lexeme
  // is always ")" here
  if (lexemes.peek()?.content !== ")") {
    throw new CompilerError(
      "Closing bracket missing after method parameters.",
      lexemes.peek(-1),
    );
  }
  // deno-coverage-ignore-stop
  lexemes.advance();

  return parameters;
}
