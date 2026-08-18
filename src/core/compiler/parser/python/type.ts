import type { Type } from "../../lexer/types.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";

// [isConstant, elementOrScalarType, stringLength, arrayDimensions, isList].
// arrayDimensions and isList are mutually exclusive: a "List[T]" hint sets
// isList and leaves arrayDimensions empty.
type TypeInformation = [boolean, Type, number, [number, number][], boolean];

const type = (lexemes: Lexemes, routine: Routine): TypeInformation => {
  const lexeme = lexemes.get();
  let stringLength = 64;

  if (!lexeme) {
    throw new CompilerError("Expecting type specification.", lexemes.get(-1));
  }
  switch (lexeme.content) {
    case "bool":
      lexemes.next();
      return [false, "boolean", stringLength, [], false];

    case "int":
      lexemes.next();
      return [false, "integer", stringLength, [], false];

    case "str":
      lexemes.next();
      if (lexemes.get()?.content === "[") {
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
            integer,
          );
        }
        stringLength = integer.value;
        lexemes.next();
        if (!lexemes.get()) {
          throw new CompilerError(
            'Closing bracket "]" missing after string size specification.',
            lexemes.get(-1),
          );
        }
        if (lexemes.get()?.content !== "]") {
          throw new CompilerError(
            'Closing bracket "]" missing after string size specification.',
            lexemes.get(),
          );
        }
        lexemes.next();
      }
      return [false, "string", stringLength, [], false];

    case "final":
      throw new CompilerError(
        '"Final" must be written with a capital "F".',
        lexeme,
      );

    case "Final":
      lexemes.next();
      return [true, "boolint", stringLength, [], false];

    case "list":
      throw new CompilerError(
        '"List" must be written with a capital "L".',
        lexeme,
      );

    // "List[T]" - a growable list of element type T. There is no fixed-length
    // "List[T, N]" form: lists reallocate as they grow.
    case "List": {
      lexemes.next();

      if (!lexemes.get()) {
        throw new CompilerError(
          '"List" must be followed by a type in square brackets.',
          lexeme,
        );
      }
      if (lexemes.get()?.content !== "[") {
        throw new CompilerError(
          '"List" must be followed by a type in square brackets.',
          lexemes.get(),
        );
      }
      lexemes.next();

      const elementType = type(lexemes, routine);

      if (elementType[0]) {
        throw new CompilerError("List type cannot be constant.", lexemes.get());
      }

      if (lexemes.get()?.content === ",") {
        throw new CompilerError(
          'Lists no longer have a fixed size - write "List[T]" without a length.',
          lexemes.get(),
        );
      }

      if (!lexemes.get()) {
        throw new CompilerError(
          '"List" must be followed by closing square brackets.',
          lexemes.get(-1),
        );
      }
      if (lexemes.get()?.content !== "]") {
        throw new CompilerError(
          '"List" must be followed by closing square brackets.',
          lexemes.get(),
        );
      }
      lexemes.next();

      return [false, elementType[1], elementType[2], [], true];
    }

    default:
      throw new CompilerError(
        '{lex} is not a valid type specification (expected "bool", "int", or "str")',
        lexemes.get(),
      );
  }
};

export default type;
