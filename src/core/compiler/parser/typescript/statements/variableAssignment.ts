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

  const assignmentOperator = lexemes.peek();
  if (!assignmentOperator) {
    throw new CompilerError(
      'Variable must be followed by assignment operator "=".',
      lexemes.peek(-1),
    );
  }
  if (assignmentOperator.content === ":") {
    throw new CompilerError(
      "Type of variable {lex} has already been given.",
      assignmentOperator,
    );
  }
  if (assignmentOperator.content === "[") {
    throw new CompilerError(
      "{lex} is not a string or array variable.",
      assignmentOperator,
    );
  }
  if (
    assignmentOperator.type !== "operator" ||
    assignmentOperator.subtype !== "asgn"
  ) {
    throw new CompilerError(
      'Variable must be followed by assignment operator "=".',
      assignmentOperator,
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
  const variableValue = makeVariableValue(variableLexeme, variable);
  variableValue.indexes.push(...indexes);
  value = typeCheck(routine.language, value, variableValue.type);

  return makeVariableAssignment(assignmentOperator, variable, indexes, value);
};

export default parseVariableAssignment;
