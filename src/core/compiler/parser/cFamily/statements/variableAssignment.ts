import { type IdentifierLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import { type Expression } from "../../definitions/expression.ts";
import makeVariableValue from "../../definitions/expressions/variableValue.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makeVariableAssignment, {
  type VariableAssignment,
} from "../../definitions/statements/variableAssignment.ts";
import { isArray, type Variable } from "../../definitions/variable.ts";

/** Shared by C and Java, which assign in exactly the same way. */
const parseVariableAssignment = (
  variableLexeme: IdentifierLexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
  variable: Variable,
): VariableAssignment => {
  const indexes: Expression[] = [];
  if (lexemes.peek()?.content === "[") {
    if (isArray(variable)) {
      lexemes.advance();
      while (!lexemes.atEnd() && lexemes.peek()?.content !== "]") {
        let exp = parseExpression(lexemes, routine);
        exp = typeCheck(routine.language, exp, "integer");
        indexes.push(exp);
        if (
          lexemes.peek()?.content === "]" &&
          lexemes.peek(1)?.content === "["
        ) {
          lexemes.advance();
          lexemes.advance();
        }
      }
      if (lexemes.atEnd()) {
        throw new CompilerError(
          'Closing bracket "]" needed after array indexes.',
          lexemes.peek(-1),
        );
      }
      lexemes.advance();
    } else if (variable.type === "string") {
      lexemes.advance();
      let exp = parseExpression(lexemes, routine);
      exp = typeCheck(routine.language, exp, "integer");
      indexes.push(exp);
      lexemes.expect(
        "]",
        'Closing bracket "]" missing after string variable index.',
        exp.lexeme,
      );
    } else {
      throw new CompilerError(
        "{lex} is not a string or array variable.",
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
      assignmentLexeme,
    );
  }
  let value = parseExpression(lexemes, routine);
  const variableValue = makeVariableValue(variableLexeme, variable);
  variableValue.indexes.push(...indexes);
  // check against variableValue.type rather than variableAssignment.variable.type
  value = typeCheck(routine.language, value, variableValue.type);

  return makeVariableAssignment(assignmentLexeme, variable, indexes, value);
};

export default parseVariableAssignment;
