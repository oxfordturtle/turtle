import type { KeywordLexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import { getAllSubroutines, type Routine } from "../definitions/routine.ts";
import makeSubroutine, {
  getProgram,
  type Subroutine,
} from "../definitions/routines/subroutine.ts";
import makeVariable, { type Variable } from "../definitions/variable.ts";
import identifier from "./identifier.ts";
import type from "./type.ts";
import variable from "./variable.ts";

export default function subroutine(
  lexeme: KeywordLexeme,
  lexemes: Lexemes,
  parent: Routine,
): Subroutine {
  const name = identifier(lexemes, parent, true);

  const subroutine = makeSubroutine(lexeme, parent, name);
  const program = parent.kind === "Program" ? parent : getProgram(parent);
  subroutine.index = getAllSubroutines(program).length + 1;

  subroutine.variables.push(...parameters(lexemes, subroutine));

  const [subroutineType, stringLength, arrayDimensions] = type(lexemes, parent);

  if (arrayDimensions.length > 0) {
    throw new CompilerError("Functions cannot return arrays.", lexemes.get(-1));
  }

  if (subroutineType !== null) {
    const variable = makeVariable("!result", subroutine);
    variable.type = subroutineType;
    variable.stringLength = stringLength;
    subroutine.variables.unshift(variable);
  }

  if (!lexemes.get()) {
    throw new CompilerError(
      'Method parameters must be followed by an opening bracket "{".',
      lexemes.get(-1),
    );
  }
  if (lexemes.get()?.content !== "{") {
    throw new CompilerError(
      'Method parameters must be followed by an opening bracket "{".',
      lexemes.get(),
    );
  }
  lexemes.next();

  subroutine.start = lexemes.index;

  let brackets = 0;
  while (lexemes.get() && brackets >= 0) {
    if (lexemes.get()?.content === "{") {
      brackets += 1;
    } else if (lexemes.get()?.content === "}") {
      brackets -= 1;
    }
    lexemes.next();
  }

  subroutine.end = lexemes.index - 1;

  return subroutine;
}

/** parses lexemes at subroutine parameters, and returns the parameters */
function parameters(lexemes: Lexemes, subroutine: Subroutine): Variable[] {
  if (!lexemes.get()) {
    throw new CompilerError(
      'Opening bracket "(" missing after function name.',
      lexemes.get(-1),
    );
  }
  if (lexemes.get()?.content !== "(") {
    throw new CompilerError(
      'Opening bracket "(" missing after function name.',
      lexemes.get(),
    );
  }
  lexemes.next();

  const parameters: Variable[] = [];
  while (lexemes.get()?.content !== ")") {
    const parameter = variable(lexemes, subroutine, true);
    parameter.isParameter = true;
    parameters.push(parameter);
    if (lexemes.get()?.content === ",") {
      lexemes.next();
    }
  }

  // N.B. no check for the closing bracket here: the loop above only exits
  // once it has already found ")", so a check here would be unreachable
  lexemes.next();

  return parameters;
}
