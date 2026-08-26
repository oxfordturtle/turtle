import type { Type } from "../../lexer/types.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import evaluate from "../common/evaluate.ts";
import parseExpression from "../common/expression.ts";
import typeCheck from "../common/typeCheck.ts";

export default function type(
  lexemes: Lexemes,
  routine: Routine,
): [Type | null, number, [number, number][]] {
  if (lexemes.atEnd()) {
    throw new CompilerError(
      'Expected type specification (": <type>").',
      lexemes.peek(-1),
    );
  }
  lexemes.expect(":", 'Expected type specification (": <type>").');

  const typeLexeme = lexemes.peek();
  if (!typeLexeme) {
    throw new CompilerError(
      'Expected type definition ("boolean", "number", "string", or "void").',
      lexemes.peek(-1),
    );
  }
  if (typeLexeme.type !== "type") {
    throw new CompilerError(
      '{lex} is not a valid type definition (expected "boolean", "number", "string", or "void").',
      typeLexeme,
    );
  }
  const type = typeLexeme.subtype;
  lexemes.advance();

  let stringLength = 64;
  if (type === "string") {
    if (lexemes.match("(")) {
      const integer = lexemes.peek();
      if (!integer) {
        throw new CompilerError(
          "Expected string size specification.",
          lexemes.peek(-1),
        );
      }
      if (integer.type !== "literal" || integer.subtype !== "integer") {
        throw new CompilerError("String size must be an integer.", integer);
      }
      if (integer.value <= 0) {
        throw new CompilerError(
          "String size must be greater than zero.",
          lexemes.peek(),
        );
      }
      stringLength = integer.value;
      lexemes.advance();
      if (lexemes.atEnd()) {
        throw new CompilerError(
          'Closing bracket ")" missing after string size specification.',
          lexemes.peek(-1),
        );
      }
      lexemes.expect(
        ")",
        'Closing bracket ")" missing after string size specification.',
      );
    }
  }

  const arrayDimensions: [number, number][] = [];
  while (lexemes.peek()?.content === "[") {
    lexemes.advance();

    if (lexemes.atEnd()) {
      throw new CompilerError(
        'Opening bracket "[" must be followed by an array size.',
        lexemes.peek(-1),
      );
    }
    const exp = parseExpression(lexemes, routine);
    typeCheck(routine.language, exp, "integer");
    const value = evaluate(exp, "TypeScript", "array");
    // deno-coverage-ignore-start -- unreachable: getting here requires an
    // expression that passes typeCheck(..., "integer") yet evaluates to a
    // string; the only such expressions are "character"-typed (an indexed
    // string constant), and getType() only reports "character" for languages
    // in languagesWithCharacterType, which excludes TypeScript - a TypeScript
    // string index is typed "string" and fails the typeCheck above first
    if (typeof value === "string") {
      throw new CompilerError("Array size must be an integer.", lexemes.peek());
    }
    // deno-coverage-ignore-stop
    if (value <= 0) {
      throw new CompilerError("Array size must be positive.", lexemes.peek());
    }
    arrayDimensions.push([0, value - 1]); // -1 because arrays are indexed from zero

    if (lexemes.atEnd()) {
      throw new CompilerError(
        'Array size specification must be followed by closing bracket "]".',
        lexemes.peek(-1),
      );
    }
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
