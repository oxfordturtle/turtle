import { CompilerError } from "../../tools/error.ts";
import evaluate from "../common/evaluate.ts";
import parseExpression from "../common/expression.ts";
import * as find from "../common/find.ts";
import typeCheck from "../common/typeCheck.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import makeVariable, { type Variable } from "../definitions/variable.ts";
import { variableName } from "./identifier.ts";

export function variable(lexemes: Lexemes, routine: Routine): Variable {
  const [name, type, stringLength] = variableName(lexemes);

  // duplicate check
  if (find.isDuplicate(routine, name)) {
    throw new CompilerError(
      "{lex} is already defined in the current scope.",
      lexemes.get(-1),
    );
  }

  const variable = makeVariable(name, routine);
  variable.type = type;
  variable.stringLength = stringLength;

  return variable;
}

export function array(lexemes: Lexemes, routine: Routine): Variable {
  const foo = variable(lexemes, routine);

  if (!lexemes.get()) {
    throw new CompilerError(
      '"DIM" variable identifier must be followed by dimensions in brackets.',
      lexemes.get(-1),
    );
  }
  if (lexemes.get()?.content !== "(") {
    throw new CompilerError(
      '"DIM" variable identifier must be followed by dimensions in brackets.',
      lexemes.get(),
    );
  }
  lexemes.next();

  while (lexemes.get()?.content !== ")") {
    if (!lexemes.get()) {
      throw new CompilerError(
        "Expected array size specification.",
        lexemes.get(-1),
      );
    }
    if (lexemes.get()?.type === "newline") {
      throw new CompilerError(
        "Array declaration must be one a single line.",
        lexemes.get(-1),
      );
    }
    const exp = parseExpression(lexemes, routine);
    typeCheck(routine.language, exp, "integer");
    const value = evaluate(exp, "BASIC", "array");
    // deno-coverage-ignore-start -- unreachable: no BASIC expression both
    // passes the "integer" type check above and evaluates to a string -
    // character lexemes exist only in C/Java/Pascal, string literals,
    // constants and concatenations fail the type check as 'string', and
    // variables and function calls are rejected by evaluate itself. The
    // check still narrows `value` to number for the comparison below.
    if (typeof value === "string") {
      throw new CompilerError("Array size must be an integer.", lexemes.get());
    }
    // deno-coverage-ignore-stop
    if (value <= 0) {
      throw new CompilerError("Array size must be positive.", lexemes.get());
    }
    // N.B. BASIC arrays are indexed from zero up to *and including* the size
    // (so you get one more element than you might think)
    foo.arrayDimensions.push([0, value]);

    // move past comma (if there is one)
    if (lexemes.get()?.content === ",") {
      lexemes.next();
      if (lexemes.get()?.content === ")") {
        throw new CompilerError(
          "Trailing comma in array size specification.",
          lexemes.get(),
        );
      }
    }
  }

  // deno-coverage-ignore-start -- unreachable: the loop above only exits when
  // the current lexeme is ")" (a dry stream re-enters the loop, where the
  // "Expected array size specification" check throws first), so the current
  // lexeme is always ")" here
  if (!lexemes.get() || lexemes.get()?.content !== ")") {
    throw new CompilerError(
      "Closing bracket missing after array size specification.",
      lexemes.get(-1),
    );
  }
  // deno-coverage-ignore-stop
  if (foo.arrayDimensions.length === 0) {
    throw new CompilerError(
      "Expected array size specification.",
      lexemes.get(),
    );
  }
  lexemes.next();

  return foo;
}

export function variables(lexemes: Lexemes, routine: Routine): Variable[] {
  const variables: Variable[] = [];
  while (lexemes.get()?.type !== "newline") {
    variables.push(variable(lexemes, routine));
    if (lexemes.get()?.content === ",") {
      lexemes.next();
      if (!lexemes.get() || lexemes.get()?.type === "newline") {
        throw new CompilerError(
          "Trailing comma at end of line.",
          lexemes.get(-1),
        );
      }
    }
  }
  return variables;
}
