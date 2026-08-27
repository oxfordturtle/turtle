import type { Type } from "../../lexer/types.ts";
import { CompilerError } from "../../tools/error.ts";
import evaluate from "../common/evaluate.ts";
import parseExpression from "../common/expression.ts";
import typeCheck from "../common/typeCheck.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";

export default function type(
  lexemes: Lexemes,
  routine: Routine,
): [Type | null, number, [number, number][]] {
  const typeLexeme = lexemes.peek();

  // deno-coverage-ignore-start -- unreachable: every call site guarantees a
  // lexeme is waiting -- parser.ts and subroutine.ts call type() with the
  // index at a type lexeme they have already seen, constant.ts calls it right
  // after consuming "final", and variable.ts is reached either the same way
  // or from subroutine.ts's parameter loop, whose last consumed lexeme is
  // "(", ",", or a parameter's identifier -- and none of those can be the
  // program's final lexeme (program.ts guarantees that's "}")
  if (!typeLexeme) {
    throw new CompilerError(
      'Expected type definition ("boolean", "char", "int", "String", or "void").',
      lexemes.peek(-1),
    );
  }
  // deno-coverage-ignore-stop
  if (typeLexeme.type !== "type") {
    throw new CompilerError(
      '{lex} is not a valid type definition (expected "boolean", "char", "int", "String", or "void").',
      lexemes.peek(-1),
    );
  }
  const type = typeLexeme.subtype;
  lexemes.advance();

  let stringLength = 64;
  if (type === "string") {
    if (lexemes.match("(")) {
      const integer = lexemes.peek();
      // deno-coverage-ignore-start -- unreachable: the last consumed lexeme
      // is "(", which can never be the program's final lexeme (program.ts
      // guarantees that's "}"), so the stream cannot be dry here
      if (!integer) {
        throw new CompilerError(
          "Expected string size specification.",
          lexemes.peek(-1),
        );
      }
      // deno-coverage-ignore-stop
      if (integer.type !== "literal" || integer.subtype !== "integer") {
        throw new CompilerError("String size must be an integer.", integer);
      }
      if (integer.value <= 0) {
        throw new CompilerError(
          "String size must be greater than zero.",
          integer,
        );
      }
      stringLength = integer.value;
      lexemes.advance();
      // deno-coverage-ignore-start -- unreachable: the last consumed lexeme
      // is the string size literal, which can never be the program's final
      // lexeme (program.ts guarantees that's "}"), so the stream cannot be
      // dry here
      if (lexemes.atEnd()) {
        throw new CompilerError(
          'Closing bracket ")" missing after string size specification.',
          lexemes.peek(-1),
        );
      }
      // deno-coverage-ignore-stop
      lexemes.expect(
        ")",
        'Closing bracket ")" missing after string size specification.',
      );
    }
  }

  const arrayDimensions: [number, number][] = [];
  while (lexemes.peek()?.content === "[") {
    lexemes.advance();

    // deno-coverage-ignore-start -- unreachable: the last consumed lexeme is
    // "[", which can never be the program's final lexeme (program.ts
    // guarantees that's "}"), so the stream cannot be dry here
    if (lexemes.atEnd()) {
      throw new CompilerError(
        'Opening bracket "[" must be followed by an array size.',
        lexemes.peek(-1),
      );
    }
    // deno-coverage-ignore-stop
    const exp = parseExpression(lexemes, routine);
    typeCheck(routine.language, exp, "integer");
    const value = evaluate(exp, "Java", "array");
    if (typeof value === "string") {
      throw new CompilerError("Array size must be an integer.", lexemes.peek());
    }
    if (value <= 0) {
      throw new CompilerError("Array size must be positive.", lexemes.peek());
    }
    arrayDimensions.push([0, value - 1]); // -1 because arrays are indexed from zero

    // deno-coverage-ignore-start -- unreachable: a dry stream here would
    // require the array size expression to have consumed the program's final
    // "}" -- but parseExpression() can never consume a "}" (it always throws
    // on one), and program.ts guarantees that final "}" is there
    if (lexemes.atEnd()) {
      throw new CompilerError(
        'Array size specification must be followed by closing bracket "]".',
        lexemes.peek(-1),
      );
    }
    // deno-coverage-ignore-stop
    lexemes.expect(
      "]",
      'Array size specification must be followed by closing bracket "]".',
    );
  }

  if (type === null && arrayDimensions.length > 0) {
    throw new CompilerError("Array of void is not allowed.", typeLexeme);
  }

  return [type, stringLength, arrayDimensions];
}
