import { type IdentifierLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck, { pinListElementKind } from "../../common/typeCheck.ts";
import {
  type Expression,
  getListElementKind,
  getType,
  isListExpression,
} from "../../definitions/expression.ts";
import makeVariableValue from "../../definitions/expressions/variableValue.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import { type Routine } from "../../definitions/routine.ts";
import type { PassStatement } from "../../definitions/statements/passStatement.ts";
import makeVariableAssignment, {
  type VariableAssignment,
} from "../../definitions/statements/variableAssignment.ts";
import { isArray, type Variable } from "../../definitions/variable.ts";

export default (
  variableLexeme: IdentifierLexeme,
  lexemes: Lexemes,
  routine: Routine,
  variable: Variable,
): VariableAssignment | PassStatement => {
  const indexes: Expression[] = [];
  if (lexemes.get()?.content === "[") {
    if (isArray(variable)) {
      lexemes.next();
      while (lexemes.get() && lexemes.get()?.content !== "]") {
        let exp = parseExpression(lexemes, routine);
        exp = typeCheck(routine.language, exp, variable);
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
    } else if (variable.isList) {
      lexemes.next();
      let exp = parseExpression(lexemes, routine);
      exp = typeCheck(routine.language, exp, "integer");
      indexes.push(exp);
      if (!lexemes.get() || lexemes.get()?.content !== "]") {
        throw new CompilerError(
          'Closing bracket "]" missing after list variable index.',
          exp.lexeme,
        );
      }
      lexemes.next();
      if (variable.isListOfLists && lexemes.get()?.content === "[") {
        lexemes.next();
        let exp2 = parseExpression(lexemes, routine);
        exp2 = typeCheck(routine.language, exp2, "integer");
        indexes.push(exp2);
        if (!lexemes.get() || lexemes.get()?.content !== "]") {
          throw new CompilerError(
            'Closing bracket "]" missing after list variable index.',
            exp2.lexeme,
          );
        }
        lexemes.next();
      }
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
  if (assignmentLexeme.content === ":") {
    if (variable.turtle) {
      throw new CompilerError(
        "{lex} is the name of a predefined Turtle attribute, and cannot be given a type hit.",
        lexemes.get(-1),
      );
    }
    throw new CompilerError(
      "Type of variable {lex} has already been given.",
      lexemes.get(-1),
    );
  }
  if (assignmentLexeme.content === "[") {
    throw new CompilerError(
      "{lex} is not a string or list variable.",
      lexemes.get(-1),
    );
  }
  if (
    assignmentLexeme.type !== "operator" ||
    assignmentLexeme.subtype !== "asgn"
  ) {
    throw new CompilerError(
      'Variable must be followed by assignment operator "=".',
      lexemes.get(),
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

  if (variable.isList && variable.isListOfLists && indexes.length === 1) {
    // "wins[i] = somesublist" writes a whole sublist, not a scalar
    if (!isListExpression(value)) {
      throw new CompilerError("Type error: a list was expected.", value.lexeme);
    }
    if (variable.innerListElementKind === undefined) {
      const kind = getListElementKind(value);
      variable.innerListElementKind = kind;
      variable.typeIsCertain = kind !== undefined;
    } else {
      const foundKind = getListElementKind(value);
      if (
        foundKind !== undefined &&
        foundKind !== variable.innerListElementKind
      ) {
        throw new CompilerError(
          `Type error: a list of '${variable.innerListElementKind}' was expected but a list of '${foundKind}' was found.`,
          value.lexeme,
        );
      }
    }
  } else if (variable.isList && indexes.length > 0) {
    // a scalar element write: checked against the list's element kind, or
    // pinning it if this is the first write that reveals it
    const isNested = variable.isListOfLists && indexes.length === 2;
    const knownKind = isNested
      ? variable.innerListElementKind
      : variable.listElementKind;
    if (knownKind === undefined) {
      if (isNested) {
        const kind = getType(value);
        variable.innerListElementKind =
          kind === "string" ? "string" : "integer";
        variable.typeIsCertain = true;
      } else {
        pinListElementKind(variable, value);
      }
    } else {
      value = typeCheck(routine.language, value, knownKind);
    }
  } else {
    value = typeCheck(routine.language, value, variable);
  }

  return makeVariableAssignment(assignmentLexeme, variable, indexes, value);
};
