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

  if (lexemes.match("(")) {
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
        lexemes.peek(-1),
      );
    }
    const foo = makeVariable("result", sub);
    foo.type = returnType;
    foo.stringLength = stringLength;
    sub.variables.unshift(foo);
  }

  parseSemicolon(lexemes, true, `${getSubroutineType(sub)} definition`);

  let begun = false;
  while (!lexemes.atEnd() && lexemes.peek()?.content?.toLowerCase() !== "end") {
    const lexeme = lexemes.peek() as Lexeme;
    switch (lexeme.type) {
      // comments can appear between declarations (e.g. documenting a nested
      // subroutine right above its definition), not just inside a statement
      // body - mirrors the same skip in the top-level PROGRAM parser (see
      // parser.ts)
      case "comment":
        lexemes.advance();
        break;

      case "keyword":
        switch (lexeme.subtype) {
          case "var":
            lexemes.advance();
            sub.variables.push(...variables(lexemes, sub));
            break;

          case "procedure": // fallthrough
          case "function":
            lexemes.advance();
            sub.subroutines.push(subroutine(lexeme, lexemes, sub));
            break;

          // start of subroutine statements
          case "begin":
            begun = true;
            lexemes.advance();
            while (
              lexemes.peek() &&
              lexemes.peek()?.content?.toLowerCase() !== "end"
            ) {
              const lexeme = lexemes.peek() as Lexeme;
              sub.statements.push(parseStatement(lexeme, lexemes, sub));
            }
            break;

          default:
            if (!begun) {
              throw new CompilerError(
                `Keyword "begin" missing for ${getSubroutineType(
                  sub,
                )} ${sub.name}.`,
                lexemes.peek(),
              );
              // deno-coverage-ignore-start -- everything from here to the
              // stop marker is unreachable: begun only becomes true in the
              // "begin" case above, whose statements loop runs until "end" or
              // the lexemes run dry - the very condition that also ends this
              // outer declarations loop - so the switch never runs again with
              // begun === true (the marker sits inside the if because the
              // never-taken else-branch is recorded on its closing brace)
            }
            throw new CompilerError(
              "{lex} makes no sense here.",
              lexemes.peek(),
            );
          // deno-coverage-ignore-stop
        }
        break;

      default:
        if (!begun) {
          throw new CompilerError(
            `Keyword "begin" missing for ${getSubroutineType(
              sub,
            )} ${sub.name}.`,
            lexemes.peek(),
          );
          // deno-coverage-ignore-start -- everything from here to the stop
          // marker is unreachable: begun only becomes true in the "begin"
          // case above, whose statements loop runs until "end" or the lexemes
          // run dry - the very condition that also ends this outer
          // declarations loop - so the switch never runs again with begun ===
          // true (the marker sits inside the if because the never-taken
          // else-branch is recorded on its closing brace)
        }
        throw new CompilerError("{lex} makes no sense here.", lexemes.peek());
      // deno-coverage-ignore-stop
    }
  }

  if (!begun) {
    throw new CompilerError(
      `Keyword "begin" missing for ${getSubroutineType(sub)} ${sub.name}.`,
      lexemes.peek(-1),
    );
  }
  if (lexemes.atEnd()) {
    throw new CompilerError(
      `Keyword "end" missing for ${getSubroutineType(sub)} ${sub.name}.`,
      lexemes.peek(-1),
    );
  }
  lexemes.advance();
  parseSemicolon(lexemes, true, `${getSubroutineType(sub)} end`);

  return sub;
}

/** calculates the index of a subroutine (before it and its parents have been added to the program) */
function subroutineIndex(subroutine: Subroutine): number {
  return subroutine.parent.kind === "Program"
    ? getAllSubroutines(subroutine.parent).length + 1
    : subroutineIndex(subroutine.parent) +
        getAllSubroutines(subroutine.parent).length +
        1;
}

function parameters(lexemes: Lexemes, subroutine: Subroutine): Variable[] {
  const parameters: Variable[] = [];

  while (!lexemes.atEnd() && lexemes.peek()?.content !== ")") {
    subroutine.variables.push(...parameterSet(lexemes, subroutine));
    // move past semicolon
    if (lexemes.peek()?.content === ";") {
      lexemes.advance();
      // throw error for trailing semicolons
      if (lexemes.peek()?.content === ")") {
        throw new CompilerError(
          "Trailing semicolon at end of parameter list.",
          lexemes.peek(),
        );
      }
    } else if (lexemes.peek()?.type === "identifier") {
      throw new CompilerError(
        "Semicolon missing between parameters.",
        lexemes.peek(),
      );
    }
  }

  lexemes.expectAfter(
    ")",
    `Closing bracket missing after ${getSubroutineType(
      subroutine,
    )} parameters.`,
  );

  return parameters;
}

function parameterSet(lexemes: Lexemes, subroutine: Subroutine): Variable[] {
  const parameters: Variable[] = [];

  // "var" is permissible here (for reference parameters)
  let isReferenceParameter = false;
  if (lexemes.peek()?.content === "var") {
    isReferenceParameter = true;
    lexemes.advance();
  }

  while (!lexemes.atEnd() && lexemes.peek()?.content !== ":") {
    const name = identifier(lexemes, subroutine);
    parameters.push(makeVariable(name, subroutine));
    if (!lexemes.match(",") && lexemes.peek()?.type === "identifier") {
      throw new CompilerError(
        "Comma missing between parameter names.",
        lexemes.peek(),
      );
    }
  }

  const [parameterType, stringLength, arrayDimensions] = type(
    lexemes,
    subroutine,
    isReferenceParameter,
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
