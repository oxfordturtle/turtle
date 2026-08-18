import {
  integerLexeme,
  type KeywordLexeme,
  operatorLexeme,
} from "../../../lexer/lexeme.ts";
import { token } from "../../../tokenizer/token.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import * as find from "../../common/find.ts";
import skipComments from "../../common/skipComments.ts";
import typeCheck from "../../common/typeCheck.ts";
import makeCompoundExpression from "../../definitions/expressions/compoundExpression.ts";
import makeIntegerValue from "../../definitions/expressions/integerValue.ts";
import makeVariableValue from "../../definitions/expressions/variableValue.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import type { Subroutine } from "../../definitions/routines/subroutine.ts";
import makeForStatement, {
  type ForStatement,
} from "../../definitions/statements/forStatement.ts";
import makeVariableAssignment from "../../definitions/statements/variableAssignment.ts";
import { isArray } from "../../definitions/variable.ts";
import parseStatement from "../statement.ts";
import parseBlock from "./block.ts";
import parseVariableAssignment from "./variableAssignment.ts";

const parseForStatement = (
  forLexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
): ForStatement => {
  const variableLexeme = lexemes.get();
  if (!variableLexeme) {
    throw new CompilerError(
      '"FOR" must be followed by an integer variable.',
      forLexeme,
    );
  }
  if (variableLexeme.type !== "identifier") {
    throw new CompilerError(
      '"FOR" must be followed by an integer variable.',
      variableLexeme,
    );
  }
  if (variableLexeme.subtype === "turtle") {
    throw new CompilerError(
      'Turtle attribute cannot be used as a "FOR" variable.',
      variableLexeme,
    );
  }
  const variable = find.variable(routine, variableLexeme.value);
  if (!variable) {
    throw new CompilerError(
      "Variable {lex} has not been declared.",
      variableLexeme,
    );
  }
  if (variable.type !== "integer" && variable.type !== "boolint") {
    throw new CompilerError(
      "{lex} is not an integer variable.",
      variableLexeme,
    );
  }
  if (isArray(variable)) {
    throw new CompilerError(
      "FOR variable cannot be an array or array element.",
      variableLexeme,
    );
  }
  lexemes.next();

  const initialisation = parseVariableAssignment(
    variableLexeme,
    lexemes,
    routine,
    variable,
  );

  const toLexeme = lexemes.get();
  const toOrDownTo = toLexeme?.content?.toLowerCase();
  if (!toLexeme || (toOrDownTo !== "to" && toOrDownTo !== "downto")) {
    throw new CompilerError(
      '"FOR ... := ..." must be followed by "TO" or "DOWNTO".',
      initialisation.lexeme,
    );
  }
  const oneToken = token("decimal", "1", forLexeme.line, -1);
  const assignmentToken = token("operator", "=", forLexeme.line, -1);
  const operatorToken = token(
    "operator",
    toOrDownTo === "to" ? "+" : "-",
    forLexeme.line,
    -1,
  );
  const oneLexeme = integerLexeme(oneToken, 10);
  const assignmentLexeme = operatorLexeme(assignmentToken, "Pascal");
  const plusLexeme = operatorLexeme(operatorToken, "Pascal");
  const left = makeVariableValue(variableLexeme, variable);
  const right = makeIntegerValue(oneLexeme);
  const changeOperator = toOrDownTo === "to" ? "plus" : "subt";
  const value = makeCompoundExpression(plusLexeme, left, right, changeOperator);
  const change = makeVariableAssignment(assignmentLexeme, variable, [], value);
  lexemes.next();

  if (!lexemes.get()) {
    throw new CompilerError(
      `"${toOrDownTo.toUpperCase()}" must be followed by an integer (or integer constant).`,
      toLexeme,
    );
  }
  let finalValue = parseExpression(lexemes, routine);
  finalValue = typeCheck(routine.language, finalValue, "integer");
  const comparisonToken = token(
    "operator",
    toOrDownTo === "to" ? "<=" : ">=",
    forLexeme.line,
    -1,
  );
  const comparisonLexeme = operatorLexeme(comparisonToken, "Pascal");
  const comparisonOperator = toOrDownTo === "to" ? "lseq" : "mreq";
  const condition = makeCompoundExpression(
    comparisonLexeme,
    left,
    finalValue,
    comparisonOperator,
  );

  const forStatement = makeForStatement(
    forLexeme,
    initialisation,
    condition,
    change,
  );

  const doLexeme = lexemes.get();
  if (!doLexeme) {
    throw new CompilerError(
      '"FOR" loop range must be followed by "DO".',
      lexemes.get(-1),
    );
  }
  lexemes.next();

  skipComments(lexemes);
  const firstSubLexeme = lexemes.get();
  if (!firstSubLexeme) {
    throw new CompilerError(
      'No commands found after "FOR" loop initialisation.',
      doLexeme,
    );
  }
  if (firstSubLexeme.content?.toLowerCase() === "begin") {
    lexemes.next();
    forStatement.statements.push(...parseBlock(lexemes, routine, "begin"));
  } else {
    forStatement.statements.push(
      parseStatement(firstSubLexeme, lexemes, routine),
    );
  }

  return forStatement;
};

export default parseForStatement;
