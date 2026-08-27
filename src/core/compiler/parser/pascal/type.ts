import type { Type } from "../../lexer/types.ts";
import { CompilerError } from "../../tools/error.ts";
import evaluate from "../common/evaluate.ts";
import parseExpression from "../common/expression.ts";
import typeCheck from "../common/typeCheck.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Program } from "../definitions/routines/program.ts";
import type { Subroutine } from "../definitions/routines/subroutine.ts";

export default function type(
  lexemes: Lexemes,
  routine: Program | Subroutine,
  isParameter: boolean,
): [Type, number, [number, number][]] {
  if (lexemes.atEnd()) {
    throw new CompilerError(
      'Expected type specification (": <type>").',
      lexemes.peek(-1),
    );
  }
  lexemes.expect(":", 'Expected type specification (": <type>").');

  const arrayDimensions: [number, number][] = [];
  if (lexemes.peek()?.content === "array") {
    if (isParameter) {
      while (lexemes.peek()?.content === "array") {
        // give dummy array dimensions
        arrayDimensions.push([0, 0]);
        lexemes.advance();
        lexemes.expectAfter("of", 'Keyword "array" must be followed by "of".');
      }
    } else {
      lexemes.advance();
      lexemes.expectAfter(
        "[",
        'Keyword "array" must be followed by array dimensions.',
      );
      while (!lexemes.atEnd() && lexemes.peek()?.content !== "]") {
        const startExp = parseExpression(lexemes, routine);
        typeCheck(routine.language, startExp, "integer");
        const start = evaluate(startExp, "Pascal", "array") as number;
        lexemes.expectAfter(
          "..",
          'Array start index must be followed by ".." then the end index.',
        );
        const endExp = parseExpression(lexemes, routine);
        typeCheck(routine.language, endExp, "integer");
        const end = evaluate(endExp, "Pascal", "array") as number;
        // push the dimensions and move on
        arrayDimensions.push([start, end]);
        if (!lexemes.match(",") && lexemes.peek()?.content !== "]") {
          throw new CompilerError(
            "Comma missing between array dimensions.",
            lexemes.peek(-1),
          );
        }
      }
      // check we came out of the previous loop for the right reason
      if (lexemes.atEnd()) {
        throw new CompilerError(
          'Closing bracket "]" missing after array dimensions specification.',
          lexemes.peek(-1),
        );
      }
      lexemes.advance(); // move past the closing bracket
      if (lexemes.peek()?.content?.toLowerCase() !== "of") {
        throw new CompilerError(
          '"array[...]" must be followed by "of".',
          lexemes.peek(-1),
        );
      }
      lexemes.advance();
    }
  }

  const typeLexeme = lexemes.peek();
  if (!typeLexeme) {
    throw new CompilerError(
      'Expected type definition ("array", "boolean", "char", "integer", or "string").',
      lexemes.peek(-1),
    );
  }
  if (typeLexeme.type !== "type") {
    throw new CompilerError(
      '{lex} is not a valid type definition (expected "array", "boolean", "char", "integer", or "string").',
      lexemes.peek(),
    );
  }
  const type = typeLexeme.subtype as Type;
  lexemes.advance();

  let stringLength = 64;
  if (type === "string") {
    if (lexemes.match("[")) {
      const stringLengthExp = parseExpression(lexemes, routine);
      typeCheck(routine.language, stringLengthExp, "integer");
      stringLength = evaluate(stringLengthExp, "Pascal", "string") as number;
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
  }

  return [type, stringLength, arrayDimensions];
}
