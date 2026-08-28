import type { TypeLexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Program } from "../definitions/routines/program.ts";
import makeSubroutine, {
  type Subroutine,
} from "../definitions/routines/subroutine.ts";
import makeVariable, {
  isArray,
  type Variable,
} from "../definitions/variable.ts";
import identifier from "../cFamily/identifier.ts";
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
    throw new CompilerError("Methods cannot return arrays.", lexemes.peek(-1));
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
  if (lexemes.atEnd()) {
    throw new CompilerError(
      'Method parameters must be followed by an opening bracket "{".',
      lexemes.peek(-1),
    );
  }
  // deno-coverage-ignore-stop
  lexemes.expect(
    "{",
    'Method parameters must be followed by an opening bracket "{".',
  );

  const bodyStart = lexemes.mark();

  let brackets = 0;
  while (!lexemes.atEnd() && brackets >= 0) {
    if (lexemes.peek()?.content === "{") {
      brackets += 1;
    } else if (lexemes.peek()?.content === "}") {
      brackets -= 1;
    }
    lexemes.advance();
  }

  lexemes.setBody(subroutine, bodyStart, lexemes.mark() - 1);

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
  lexemes.advance(); // the opening bracket "("

  const parameters: Variable[] = [];
  while (lexemes.peek()?.content !== ")") {
    const parameter = variable(lexemes, subroutine);
    parameter.isParameter = true;
    // an array parameter is the caller's array in this language, not a copy of
    // it, which the encoder expresses as a reference parameter
    if (isArray(parameter)) {
      parameter.isReferenceParameter = true;
    }
    parameters.push(parameter);
    lexemes.match(",");
  }
  lexemes.advance(); // the closing bracket ")"

  return parameters;
}
