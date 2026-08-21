import type { KeywordLexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import * as find from "../common/find.ts";
import skipComments from "../common/skipComments.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import { getAllSubroutines, type Routine } from "../definitions/routine.ts";
import makeSubroutine, {
  getProgram,
  type Subroutine,
} from "../definitions/routines/subroutine.ts";
import makeVariable, { type Variable } from "../definitions/variable.ts";
import identifier from "./identifier.ts";
import identifiers from "./identifiers.ts";
import type from "./type.ts";
import variable from "./variable.ts";

export default (
  lexeme: KeywordLexeme,
  lexemes: Lexemes,
  parent: Routine,
  baseIndent: number,
): Subroutine => {
  const name = identifier(lexemes, parent, true);

  const program = parent.__ === "Program" ? parent : getProgram(parent);
  const subroutine = makeSubroutine(lexeme, parent, name);
  subroutine.index = getAllSubroutines(program).length + 1;

  subroutine.variables.push(...parameters(lexemes, subroutine));

  if (lexemes.get()?.content === "->") {
    lexemes.next();

    const [isConstant, returnType, stringLength, arrayDimensions, isList] =
      type(lexemes, parent);

    if (isConstant) {
      throw new CompilerError(
        "Functions cannot return constant values.",
        lexemes.get(),
      );
    }

    // deno-coverage-ignore-start -- unreachable: python/type.ts returns empty
    // arrayDimensions on every path (Python has no array type syntax; the
    // tuple slot only exists for signature parity with the other languages'
    // type parsers), so this guard can never fire
    if (arrayDimensions.length > 0) {
      throw new CompilerError(
        "Functions cannot return arrays.",
        lexemes.get(-1),
      );
    }
    // deno-coverage-ignore-stop

    if (isList) {
      throw new CompilerError(
        "Functions cannot return lists.",
        lexemes.get(-1),
      );
    }

    const variable = makeVariable("!result", subroutine);
    variable.type = returnType;
    variable.typeIsCertain = true;
    variable.stringLength = stringLength;
    subroutine.variables.unshift(variable);
    subroutine.typeIsCertain = true;
  }

  if (!lexemes.get()) {
    throw new CompilerError(
      'Subroutine declaration must be followed by a colon ":".',
      lexemes.get(-1),
    );
  }
  if (lexemes.get()?.content !== ":") {
    throw new CompilerError(
      'Subroutine declaration must be followed by a colon ":".',
      lexemes.get(),
    );
  }
  lexemes.next();

  // first - see python/statements/whileStatement.ts's equivalent check for
  // why)
  skipComments(lexemes);
  if (!lexemes.get()) {
    throw new CompilerError(
      "No statements found after subroutine definition.",
      lexemes.get(-1),
    );
  }
  if (lexemes.get()?.type !== "newline") {
    throw new CompilerError(
      "Subroutine definition must be followed by a line break.",
      lexemes.get(),
    );
  }
  lexemes.next();
  if (!lexemes.get()) {
    throw new CompilerError(
      "No statements found after subroutine definition.",
      lexemes.get(-1),
    );
  }
  if (lexemes.get()?.type !== "indent") {
    throw new CompilerError(
      "Indent needed after subroutine definition.",
      lexemes.get(),
    );
  }
  subroutine.indent = baseIndent + 1;
  lexemes.next();

  subroutine.start = lexemes.index;

  // move past the subroutine's lexemes, hoisting any undefined globals
  let indents = 0;
  while (lexemes.get() && indents >= 0) {
    const lexeme = lexemes.get()!;
    switch (lexeme.type) {
      case "indent":
        indents += 1;
        break;
      case "dedent":
        indents -= 1;
        break;
      case "keyword":
        if (lexeme.subtype === "global") {
          lexemes.next();
          const globals = identifiers(lexemes, subroutine, "global");
          for (const global of globals) {
            if (!find.variable(subroutine, global)) {
              const program = getProgram(subroutine);
              program.variables.push(makeVariable(global, program));
            }
          }
        }
        break;
    }
    lexemes.next();
  }

  subroutine.end = lexemes.index - 1;

  return subroutine;
};

const parameters = (lexemes: Lexemes, routine: Subroutine): Variable[] => {
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
    const parameter = variable(lexemes, routine);
    if (parameter.__ === "constant") {
      throw new CompilerError(
        "Subroutine parameters cannot be constants.",
        lexemes.get(-1),
      );
    }
    parameter.isParameter = true;
    parameters.push(parameter);
    if (lexemes.get()?.content === ",") {
      lexemes.next();
    }
  }

  // deno-coverage-ignore-start -- unreachable: the loop above only exits when
  // the current lexeme is ")" - if the lexemes run dry first, variable() ->
  // identifier() throws '"..." must be followed by an identifier.' inside the
  // loop body instead
  if (lexemes.get()?.content !== ")") {
    throw new CompilerError(
      "Closing bracket missing after function parameters.",
      lexemes.get(-1),
    );
  }
  // deno-coverage-ignore-stop
  lexemes.next();

  return parameters;
};
