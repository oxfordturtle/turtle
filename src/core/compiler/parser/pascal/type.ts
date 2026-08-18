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

  const arrayDimensions: [number, number][] = [];
  if (lexemes.get()?.content === "array") {
    if (isParameter) {
      while (lexemes.get()?.content === "array") {
        // give dummy array dimensions
        arrayDimensions.push([0, 0]);
        lexemes.next();
        if (!lexemes.get() || lexemes.get()?.content !== "of") {
          throw new CompilerError(
            'Keyword "array" must be followed by "of".',
            lexemes.get(-1),
          );
        }
        lexemes.next();
      }
    } else {
      lexemes.next();
      if (!lexemes.get() || lexemes.get()?.content !== "[") {
        throw new CompilerError(
          'Keyword "array" must be followed by array dimensions.',
          lexemes.get(-1),
        );
      }
      lexemes.next();
      while (lexemes.get() && lexemes.get()?.content !== "]") {
        const startExp = parseExpression(lexemes, routine);
        typeCheck(routine.language, startExp, "integer");
        const start = evaluate(startExp, "Pascal", "array") as number;
        if (!lexemes.get() || lexemes.get()?.content !== "..") {
          throw new CompilerError(
            'Array start index must be followed by ".." then the end index.',
            lexemes.get(-1),
          );
        }
        lexemes.next();
        const endExp = parseExpression(lexemes, routine);
        typeCheck(routine.language, endExp, "integer");
        const end = evaluate(endExp, "Pascal", "array") as number;
        // push the dimensions and move on
        arrayDimensions.push([start, end]);
        if (lexemes.get()?.content === ",") {
          lexemes.next();
        } else if (lexemes.get()?.content !== "]") {
          throw new CompilerError(
            "Comma missing between array dimensions.",
            lexemes.get(-1),
          );
        }
      }
      // check we came out of the previous loop for the right reason
      if (!lexemes.get()) {
        throw new CompilerError(
          'Closing bracket "]" missing after array dimensions specification.',
          lexemes.get(-1),
        );
      }
      lexemes.next(); // move past the closing bracket
      if (!lexemes.get() || lexemes.get()?.content?.toLowerCase() !== "of") {
        throw new CompilerError(
          '"array[...]" must be followed by "of".',
          lexemes.get(-1),
        );
      }
      lexemes.next();
    }
  }

  const typeLexeme = lexemes.get();
  if (!typeLexeme) {
    throw new CompilerError(
      'Expected type definition ("array", "boolean", "char", "integer", or "string").',
      lexemes.get(-1),
    );
  }
  if (typeLexeme.type !== "type") {
    throw new CompilerError(
      '{lex} is not a valid type definition (expected "array", "boolean", "char", "integer", or "string").',
      lexemes.get(),
    );
  }
  const type = typeLexeme.subtype as Type;
  lexemes.next();

  let stringLength = 64;
  if (type === "string") {
    if (lexemes.get()?.content === "[") {
      lexemes.next();
      const stringLengthExp = parseExpression(lexemes, routine);
      typeCheck(routine.language, stringLengthExp, "integer");
      stringLength = evaluate(stringLengthExp, "Pascal", "string") as number;
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
  }

  return [type, stringLength, arrayDimensions];
}
