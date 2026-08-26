import type { KeywordLexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import * as find from "../common/find.ts";
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

  const program = parent.kind === "Program" ? parent : getProgram(parent);
  const subroutine = makeSubroutine(lexeme, parent, name);
  subroutine.index = getAllSubroutines(program).length + 1;

  subroutine.variables.push(...parameters(lexemes, subroutine));

  if (lexemes.match("->")) {
    const [isConstant, returnType, stringLength, arrayDimensions, isList] =
      type(lexemes, parent);

    if (isConstant) {
      throw new CompilerError(
        "Functions cannot return constant values.",
        lexemes.peek(),
      );
    }

    // deno-coverage-ignore-start -- unreachable: python/type.ts returns empty
    // arrayDimensions on every path (Python has no array type syntax; the
    // tuple slot only exists for signature parity with the other languages'
    // type parsers), so this guard can never fire
    if (arrayDimensions.length > 0) {
      throw new CompilerError(
        "Functions cannot return arrays.",
        lexemes.peek(-1),
      );
    }
    // deno-coverage-ignore-stop

    if (isList) {
      throw new CompilerError(
        "Functions cannot return lists.",
        lexemes.peek(-1),
      );
    }

    const variable = makeVariable("!result", subroutine);
    variable.type = returnType;
    variable.typeIsCertain = true;
    variable.stringLength = stringLength;
    subroutine.variables.unshift(variable);
    subroutine.typeIsCertain = true;
  }

  if (lexemes.atEnd()) {
    throw new CompilerError(
      'Subroutine declaration must be followed by a colon ":".',
      lexemes.peek(-1),
    );
  }
  lexemes.expect(
    ":",
    'Subroutine declaration must be followed by a colon ":".',
  );

  // first - see python/statements/whileStatement.ts's equivalent check for
  // why)
  lexemes.skipComments();
  if (lexemes.atEnd()) {
    throw new CompilerError(
      "No statements found after subroutine definition.",
      lexemes.peek(-1),
    );
  }
  if (lexemes.peek()?.type !== "newline") {
    throw new CompilerError(
      "Subroutine definition must be followed by a line break.",
      lexemes.peek(),
    );
  }
  lexemes.advance();
  if (lexemes.atEnd()) {
    throw new CompilerError(
      "No statements found after subroutine definition.",
      lexemes.peek(-1),
    );
  }
  if (lexemes.peek()?.type !== "indent") {
    throw new CompilerError(
      "Indent needed after subroutine definition.",
      lexemes.peek(),
    );
  }
  subroutine.indent = baseIndent + 1;
  lexemes.advance();

  subroutine.start = lexemes.mark();

  // move past the subroutine's lexemes, hoisting any undefined globals
  let indents = 0;
  while (!lexemes.atEnd() && indents >= 0) {
    const lexeme = lexemes.peek()!;
    switch (lexeme.type) {
      case "indent":
        indents += 1;
        break;
      case "dedent":
        indents -= 1;
        break;
      case "keyword":
        if (lexeme.subtype === "global") {
          lexemes.advance();
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
    lexemes.advance();
  }

  subroutine.end = lexemes.mark() - 1;

  return subroutine;
};

const parameters = (lexemes: Lexemes, routine: Subroutine): Variable[] => {
  if (lexemes.atEnd()) {
    throw new CompilerError(
      'Opening bracket "(" missing after function name.',
      lexemes.peek(-1),
    );
  }
  lexemes.expect("(", 'Opening bracket "(" missing after function name.');

  const parameters: Variable[] = [];
  while (lexemes.peek()?.content !== ")") {
    const parameter = variable(lexemes, routine);
    if (parameter.kind === "constant") {
      throw new CompilerError(
        "Subroutine parameters cannot be constants.",
        lexemes.peek(-1),
      );
    }
    parameter.isParameter = true;
    parameters.push(parameter);
    lexemes.match(",");
  }

  // deno-coverage-ignore-start -- unreachable: the loop above only exits when
  // the current lexeme is ")" - if the lexemes run dry first, variable() ->
  // identifier() throws '"..." must be followed by an identifier.' inside the
  // loop body instead
  if (lexemes.peek()?.content !== ")") {
    throw new CompilerError(
      "Closing bracket missing after function parameters.",
      lexemes.peek(-1),
    );
  }
  // deno-coverage-ignore-stop
  lexemes.advance();

  return parameters;
};
