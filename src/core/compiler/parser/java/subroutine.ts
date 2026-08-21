import type { TypeLexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Program } from "../definitions/routines/program.ts";
import makeSubroutine, {
  type Subroutine,
} from "../definitions/routines/subroutine.ts";
import makeVariable, { type Variable } from "../definitions/variable.ts";
import identifier from "./identifier.ts";
import type from "./type.ts";
import variable from "./variable.ts";

export default function subroutine(
  lexeme: TypeLexeme,
  lexemes: Lexemes,
  program: Program,
): Subroutine {
  const [subroutineType, stringLength, arrayDimensions] = type(
    lexemes,
    program,
  );
  const name = identifier(lexemes, program);

  if (arrayDimensions.length > 0) {
    throw new CompilerError("Methods cannot return arrays.", lexemes.get(-1));
  }

  const subroutine = makeSubroutine(lexeme, program, name);
  subroutine.index = program.subroutines.length + 1;

  if (subroutineType !== null) {
    const variable = makeVariable("!result", subroutine);
    variable.type = subroutineType;
    variable.stringLength = stringLength;
    subroutine.variables.push(variable);
  }

  subroutine.variables.push(...parameters(lexemes, subroutine));

  // deno-coverage-ignore-start -- unreachable: parameters() has just consumed
  // the closing ")", which can never be the program's final lexeme
  // (program.ts guarantees that's "}"), so the stream cannot be dry here
  if (!lexemes.get()) {
    throw new CompilerError(
      'Method parameters must be followed by an opening bracket "{".',
      lexemes.get(-1),
    );
  }
  // deno-coverage-ignore-stop
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

/**
 * parses lexemes at subroutine parameters, and returns the parameters
 *
 * N.B. no check for the opening/closing brackets here: the only call site
 * (subroutine(), above, via java/parser.ts) always rewinds to a lexeme it
 * has already confirmed is "(", and the parameter-collecting loop's only
 * exit condition is finding ")", so both would be unreachable dead code
 */
function parameters(lexemes: Lexemes, subroutine: Subroutine): Variable[] {
  lexemes.next(); // the opening bracket "("

  const parameters: Variable[] = [];
  while (lexemes.get()?.content !== ")") {
    const parameter = variable(lexemes, subroutine);
    parameter.isParameter = true;
    parameters.push(parameter);
    if (lexemes.get()?.content === ",") {
      lexemes.next();
    }
  }
  lexemes.next(); // the closing bracket ")"

  return parameters;
}
