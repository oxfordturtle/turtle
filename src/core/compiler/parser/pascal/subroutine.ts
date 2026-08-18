import type { KeywordLexeme, Lexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import { getAllSubroutines } from "../definitions/routine.ts";
import type { Program } from "../definitions/routines/program.ts";
import makeSubroutine, {
  getSubroutineType,
  type Subroutine,
} from "../definitions/routines/subroutine.ts";
import makeVariable, { type Variable } from "../definitions/variable.ts";
import identifier from "./identifier.ts";
import parseStatement from "./statement.ts";
import parseSemicolon from "./statements/semicolon.ts";
import type from "./type.ts";
import { variables } from "./variable.ts";

export default function subroutine(
  lexeme: KeywordLexeme,
  lexemes: Lexemes,
  parent: Program | Subroutine,
): Subroutine {
  const isFunction = lexeme.subtype === "function";

  const name = identifier(lexemes, parent);

  const sub = makeSubroutine(lexeme, parent, name);
  sub.index = subroutineIndex(sub);

  if (lexemes.get()?.content === "(") {
    lexemes.next();
    sub.variables.push(...parameters(lexemes, sub));
  }

  if (isFunction) {
    const [returnType, stringLength, arrayDimensions] = type(
      lexemes,
      sub,
      false,
    );
    if (arrayDimensions.length > 0) {
      throw new CompilerError(
        "Functions cannot return arrays.",
        lexemes.get(-1),
      );
    }
    const foo = makeVariable("result", sub);
    foo.type = returnType;
    foo.stringLength = stringLength;
    sub.variables.unshift(foo);
  }

  parseSemicolon(lexemes, true, `${getSubroutineType(sub)} definition`);

  let begun = false;
  while (lexemes.get() && lexemes.get()?.content?.toLowerCase() !== "end") {
    const lexeme = lexemes.get() as Lexeme;
    switch (lexeme.type) {
      // comments can appear between declarations (e.g. documenting a nested
      // subroutine right above its definition), not just inside a statement
      // body - mirrors the same skip in the top-level PROGRAM parser (see
      // parser.ts)
      case "comment":
        lexemes.next();
        break;

      case "keyword":
        switch (lexeme.subtype) {
          case "var":
            lexemes.next();
            sub.variables.push(...variables(lexemes, sub));
            break;

          case "procedure": // fallthrough
          case "function":
            lexemes.next();
            sub.subroutines.push(subroutine(lexeme, lexemes, sub));
            break;

          // start of subroutine statements
          case "begin":
            begun = true;
            lexemes.next();
            while (
              lexemes.get() &&
              lexemes.get()?.content?.toLowerCase() !== "end"
            ) {
              const lexeme = lexemes.get() as Lexeme;
              sub.statements.push(parseStatement(lexeme, lexemes, sub));
            }
            break;

          default:
            if (!begun) {
              throw new CompilerError(
                `Keyword "begin" missing for ${getSubroutineType(
                  sub,
                )} ${sub.name}.`,
                lexemes.get(),
              );
            }
            throw new CompilerError(
              "{lex} makes no sense here.",
              lexemes.get(),
            );
        }
        break;

      default:
        if (!begun) {
          throw new CompilerError(
            `Keyword "begin" missing for ${getSubroutineType(
              sub,
            )} ${sub.name}.`,
            lexemes.get(),
          );
        }
        throw new CompilerError("{lex} makes no sense here.", lexemes.get());
    }
  }

  if (!begun) {
    throw new CompilerError(
      `Keyword "begin" missing for ${getSubroutineType(sub)} ${sub.name}.`,
      lexemes.get(-1),
    );
  }
  if (!lexemes.get()) {
    throw new CompilerError(
      `Keyword "end" missing for ${getSubroutineType(sub)} ${sub.name}.`,
      lexemes.get(-1),
    );
  }
  lexemes.next();
  parseSemicolon(lexemes, true, `${getSubroutineType(sub)} end`);

  return sub;
}

/** calculates the index of a subroutine (before it and its parents have been added to the program) */
function subroutineIndex(subroutine: Subroutine): number {
  return subroutine.parent.__ === "Program"
    ? getAllSubroutines(subroutine.parent).length + 1
    : subroutineIndex(subroutine.parent) +
        getAllSubroutines(subroutine.parent).length +
        1;
}

function parameters(lexemes: Lexemes, subroutine: Subroutine): Variable[] {
  const parameters: Variable[] = [];

  while (lexemes.get() && lexemes.get()?.content !== ")") {
    subroutine.variables.push(...parameterSet(lexemes, subroutine));
    // move past semicolon
    if (lexemes.get() && lexemes.get()?.content === ";") {
      lexemes.next();
      // throw error for trailing semicolons
      if (lexemes.get()?.content === ")") {
        throw new CompilerError(
          "Trailing semicolon at end of parameter list.",
          lexemes.get(),
        );
      }
    } else if (lexemes.get()?.type === "identifier") {
      throw new CompilerError(
        "Semicolon missing between parameters.",
        lexemes.get(),
      );
    }
  }

  if (lexemes.get()?.content !== ")") {
    throw new CompilerError(
      `Closing bracket missing after ${getSubroutineType(
        subroutine,
      )} parameters.`,
      lexemes.get(-1),
    );
  }
  lexemes.next();

  return parameters;
}

function parameterSet(lexemes: Lexemes, subroutine: Subroutine): Variable[] {
  const parameters: Variable[] = [];

  // "var" is permissible here (for reference parameters)
  let isReferenceParameter = false;
  if (lexemes.get()?.content === "var") {
    isReferenceParameter = true;
    lexemes.next();
  }

  while (lexemes.get() && lexemes.get()?.content !== ":") {
    const name = identifier(lexemes, subroutine);
    parameters.push(makeVariable(name, subroutine));
    if (lexemes.get()?.content === ",") {
      lexemes.next();
    } else if (lexemes.get()?.type === "identifier") {
      throw new CompilerError(
        "Comma missing between parameter names.",
        lexemes.get(),
      );
    }
  }

  const [parameterType, stringLength, arrayDimensions] = type(
    lexemes,
    subroutine,
    true,
  );
  for (const foo of parameters) {
    foo.type = parameterType;
    foo.stringLength = stringLength;
    foo.arrayDimensions = arrayDimensions;
    foo.isParameter = true;
    foo.isReferenceParameter = isReferenceParameter;
  }

  return parameters;
}
