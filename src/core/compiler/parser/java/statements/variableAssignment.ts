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
  if (lexemes.get()?.content === "[") {
    if (isArray(variable)) {
      lexemes.next();
      while (lexemes.get() && lexemes.get()?.content !== "]") {
        let exp = parseExpression(lexemes, routine);
        exp = typeCheck(routine.language, exp, "integer");
        indexes.push(exp);
        if (lexemes.get()?.content === "]" && lexemes.get(1)?.content === "[") {
          lexemes.next();
          lexemes.next();
        }
      }
      if (!lexemes.get()) {
        throw new CompilerError(
          'Closing bracket "]" needed after array indexes.',
          lexemes.get(-1),
        );
      }
      lexemes.next();
    } else if (variable.type === "string") {
      lexemes.next();
      let exp = parseExpression(lexemes, routine);
      exp = typeCheck(routine.language, exp, "integer");
      indexes.push(exp);
      if (!lexemes.get() || lexemes.get()?.content !== "]") {
        throw new CompilerError(
          'Closing bracket "]" missing after string variable index.',
          exp.lexeme,
        );
      }
      lexemes.next();
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

  const assignmentLexeme = lexemes.get();
  if (!assignmentLexeme) {
    throw new CompilerError(
      'Variable must be followed by assignment operator "=".',
      lexemes.get(-1),
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
  lexemes.next();

  if (!lexemes.get()) {
    throw new CompilerError(
      `Variable "${variable.name}" must be assigned a value.`,
      lexemes.get(-1),
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
