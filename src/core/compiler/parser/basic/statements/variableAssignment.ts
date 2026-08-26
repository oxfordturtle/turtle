import { type IdentifierLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import { type Expression } from "../../definitions/expression.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makeVariableAssignment, {
  type VariableAssignment,
} from "../../definitions/statements/variableAssignment.ts";
import { isArray, type Variable } from "../../definitions/variable.ts";

const parseVariableAssignment = (
  variableLexeme: IdentifierLexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
  variable: Variable,
): VariableAssignment => {
  // array variables permit element indexes at this point
  const indexes: Expression[] = [];
  if (lexemes.peek()?.content === "(") {
    if (isArray(variable)) {
      lexemes.advance();
      while (!lexemes.atEnd() && lexemes.peek()?.content !== ")") {
        let exp = parseExpression(lexemes, routine);
        exp = typeCheck(routine.language, exp, "integer");
        indexes.push(exp);
        if (lexemes.match(",")) {
          if (lexemes.peek()?.content === ")") {
            throw new CompilerError(
              "Trailing comma at the end of array indexes.",
              lexemes.peek(-1),
            );
          }
        }
      }
      if (lexemes.atEnd()) {
        throw new CompilerError(
          'Closing bracket ")" needed after array indexes.',
          lexemes.peek(-1),
        );
      }
      lexemes.advance();
    } else {
      throw new CompilerError(
        "{lex} is not an array variable.",
        variableLexeme,
      );
    }
  }

  if (isArray(variable)) {
    const allowedIndexes =
      variable.type === "string"
        ? variable.arrayDimensions.length + 1 // one more for characters within strings
        : variable.arrayDimensions.length;
    if (indexes.length > allowedIndexes) {
      throw new CompilerError(
        "Too many indexes for array variable {lex}.",
        variableLexeme,
      );
    }
  }

  const assignmentLexeme = lexemes.peek();
  if (!assignmentLexeme) {
    throw new CompilerError(
      'Variable must be followed by assignment operator "=".',
      lexemes.peek(-1),
    );
  }
  if (
    assignmentLexeme.type !== "operator" ||
    assignmentLexeme.content !== "="
  ) {
    throw new CompilerError(
      'Variable must be followed by assignment operator "=".',
      assignmentLexeme,
    );
  }
  lexemes.advance();

  if (lexemes.atEnd()) {
    throw new CompilerError(
      `Variable "${variable.name}" must be assigned a value.`,
      lexemes.peek(-1),
    );
  }
  let value = parseExpression(lexemes, routine);
  value = typeCheck(routine.language, value, variable.type);

  return makeVariableAssignment(assignmentLexeme, variable, indexes, value);
};

export default parseVariableAssignment;
