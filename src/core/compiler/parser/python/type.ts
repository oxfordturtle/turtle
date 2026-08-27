import type { Type } from "../../lexer/types.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";

// [isConstant, elementOrScalarType, stringLength, arrayDimensions, isList].
// arrayDimensions and isList are mutually exclusive: a "List[T]" hint sets
// isList and leaves arrayDimensions empty.
type TypeInformation = [boolean, Type, number, [number, number][], boolean];

const type = (lexemes: Lexemes, routine: Routine): TypeInformation => {
  const lexeme = lexemes.peek();
  let stringLength = 64;

  if (!lexeme) {
    throw new CompilerError("Expecting type specification.", lexemes.peek(-1));
  }
  switch (lexeme.content) {
    case "bool":
      lexemes.advance();
      return [false, "boolean", stringLength, [], false];

    case "int":
      lexemes.advance();
      return [false, "integer", stringLength, [], false];

    case "str":
      lexemes.advance();
      if (lexemes.match("[")) {
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
            integer,
          );
        }
        stringLength = integer.value;
        lexemes.advance();
        if (lexemes.atEnd()) {
          throw new CompilerError(
            'Closing bracket "]" missing after string size specification.',
            lexemes.peek(-1),
          );
        }
        lexemes.expect(
          "]",
          'Closing bracket "]" missing after string size specification.',
        );
      }
      return [false, "string", stringLength, [], false];

    case "final":
      throw new CompilerError(
        '"Final" must be written with a capital "F".',
        lexeme,
      );

    case "Final":
      lexemes.advance();
      return [true, "boolint", stringLength, [], false];

    case "list":
      throw new CompilerError(
        '"List" must be written with a capital "L".',
        lexeme,
      );

    // "List[T]" - a growable list of element type T. There is no fixed-length
    // "List[T, N]" form: lists reallocate as they grow.
    case "List": {
      lexemes.advance();

      if (lexemes.atEnd()) {
        throw new CompilerError(
          '"List" must be followed by a type in square brackets.',
          lexeme,
        );
      }
      lexemes.expect(
        "[",
        '"List" must be followed by a type in square brackets.',
      );

      const elementType = type(lexemes, routine);

      if (elementType[0]) {
        throw new CompilerError(
          "List type cannot be constant.",
          lexemes.peek(),
        );
      }

      if (lexemes.peek()?.content === ",") {
        throw new CompilerError(
          'Lists no longer have a fixed size - write "List[T]" without a length.',
          lexemes.peek(),
        );
      }

      if (lexemes.atEnd()) {
        throw new CompilerError(
          '"List" must be followed by closing square brackets.',
          lexemes.peek(-1),
        );
      }
      lexemes.expect(
        "]",
        '"List" must be followed by closing square brackets.',
      );

      return [false, elementType[1], elementType[2], [], true];
    }

    default:
      throw new CompilerError(
        '{lex} is not a valid type specification (expected "bool", "int", or "str")',
        lexemes.peek(),
      );
  }
};

export default type;
