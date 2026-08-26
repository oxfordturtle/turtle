import type { Type } from "../../lexer/types.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";

export default function type(lexemes: Lexemes): [Type | null, number] {
  const typeLexeme = lexemes.peek();

  if (!typeLexeme) {
    throw new CompilerError(
      'Expected type definition ("bool", "char", "int", "string", or "void").',
      lexemes.peek(-1),
    );
  }
  if (typeLexeme.type !== "type") {
    throw new CompilerError(
      '{lex} is not a valid type definition (expected "bool", "char", "int", "string", or "void").',
      typeLexeme,
    );
  }
  const type = typeLexeme.subtype;
  lexemes.advance();

  let stringLength = 64;
  if (lexemes.match("[")) {
    const integerLexeme = lexemes.peek();
    if (!integerLexeme) {
      throw new CompilerError(
        "Expecting string size specification.",
        lexemes.peek(-1),
      );
    }
    if (
      integerLexeme.type !== "literal" ||
      integerLexeme.subtype !== "integer"
    ) {
      throw new CompilerError(
        "String size must be an integer.",
        lexemes.peek(),
      );
    }
    if (integerLexeme.value <= 0) {
      throw new CompilerError(
        "String size must be greater than zero.",
        lexemes.peek(),
      );
    }
    stringLength = integerLexeme.value;
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

  return [type, stringLength];
}
