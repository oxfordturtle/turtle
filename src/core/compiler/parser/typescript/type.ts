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
  if (!lexemes.get()) {
    throw new CompilerError(
      'Expected type specification (": <type>").',
      lexemes.get(-1),
    );
  }
  if (lexemes.get()?.content !== ":") {
    throw new CompilerError(
      'Expected type specification (": <type>").',
      lexemes.get(),
    );
  }
  lexemes.next();

  const typeLexeme = lexemes.get();
  if (!typeLexeme) {
    throw new CompilerError(
      'Expected type definition ("boolean", "number", "string", or "void").',
      lexemes.get(-1),
    );
  }
  if (typeLexeme.type !== "type") {
    throw new CompilerError(
      '{lex} is not a valid type definition (expected "boolean", "number", "string", or "void").',
      typeLexeme,
    );
  }
  const type = typeLexeme.subtype;
  lexemes.next();

  let stringLength = 64;
  if (type === "string") {
    if (lexemes.get()?.content === "(") {
      lexemes.next();
      const integer = lexemes.get();
      if (!integer) {
        throw new CompilerError(
          "Expected string size specification.",
          lexemes.get(-1),
        );
      }
      if (integer.type !== "literal" || integer.subtype !== "integer") {
        throw new CompilerError("String size must be an integer.", integer);
      }
      if (integer.value <= 0) {
        throw new CompilerError(
          "String size must be greater than zero.",
          lexemes.get(),
        );
      }
      stringLength = integer.value;
      lexemes.next();
      if (!lexemes.get()) {
        throw new CompilerError(
          'Closing bracket ")" missing after string size specification.',
          lexemes.get(-1),
        );
      }
      if (lexemes.get()?.content !== ")") {
        throw new CompilerError(
          'Closing bracket ")" missing after string size specification.',
          lexemes.get(),
        );
      }
      lexemes.next();
    }
  }

  const arrayDimensions: [number, number][] = [];
  while (lexemes.get()?.content === "[") {
    lexemes.next();

    if (!lexemes.get()) {
      throw new CompilerError(
        'Opening bracket "[" must be followed by an array size.',
        lexemes.get(-1),
      );
    }
    const exp = parseExpression(lexemes, routine);
    typeCheck(routine.language, exp, "integer");
    const value = evaluate(exp, "TypeScript", "array");
    if (typeof value === "string") {
      throw new CompilerError("Array size must be an integer.", lexemes.get());
    }
    if (value <= 0) {
      throw new CompilerError("Array size must be positive.", lexemes.get());
    }
    arrayDimensions.push([0, value - 1]); // -1 because arrays are indexed from zero

    if (!lexemes.get()) {
      throw new CompilerError(
        'Array size specification must be followed by closing bracket "]".',
        lexemes.get(-1),
      );
    }
    if (lexemes.get()?.content !== "]") {
      throw new CompilerError(
        'Array size specification must be followed by closing bracket "]".',
        lexemes.get(),
      );
    }
    lexemes.next();
  }

  if (type === null && arrayDimensions.length > 0) {
    throw new CompilerError("Array of void is not allowed.", typeLexeme);
  }

  return [type, stringLength, arrayDimensions];
}
