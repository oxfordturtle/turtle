import {
  integerLexeme,
  type KeywordLexeme,
  operatorLexeme,
} from "../../../lexer/lexeme.ts";
import { token } from "../../../tokenizer/token.ts";
import { CompilerError } from "../../../tools/error.ts";
import evaluate from "../../common/evaluate.ts";
import parseExpression from "../../common/expression.ts";
import * as find from "../../common/find.ts";
import typeCheck from "../../common/typeCheck.ts";
import makeCompoundExpression from "../../definitions/expressions/compoundExpression.ts";
import makeIntegerValue from "../../definitions/expressions/integerValue.ts";
import makeVariableValue from "../../definitions/expressions/variableValue.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import {
  getProgram,
  type Subroutine,
} from "../../definitions/routines/subroutine.ts";
import makeForStatement, {
  type ForStatement,
} from "../../definitions/statements/forStatement.ts";
import makeVariableAssignment from "../../definitions/statements/variableAssignment.ts";
import type { Variable } from "../../definitions/variable.ts";
import { variable } from "../variable.ts";
import parseBlock from "./block.ts";
import parseVariableAssignment from "./variableAssignment.ts";

const parseForStatement = (
  lexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
): ForStatement => {
  const variableLexeme = lexemes.peek();
  if (!variableLexeme) {
    throw new CompilerError(
      '"FOR" must be followed by an integer variable.',
      lexeme,
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
  let foo: Variable;
  const existing = find.variable(routine, variableLexeme.content);
  if (!existing) {
    const program = routine.kind === "Program" ? routine : getProgram(routine);
    foo = variable(lexemes, program);
    program.variables.push(foo);
  } else {
    foo = existing;
    lexemes.advance();
  }
  if (foo.type !== "integer" && foo.type !== "boolint") {
    throw new CompilerError(
      "{lex} is not an integer variable.",
      lexemes.peek(),
    );
  }

  const initialisation = parseVariableAssignment(
    variableLexeme,
    lexemes,
    routine,
    foo,
  );

  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"FOR" loop initialisation must be followed by "TO".',
      lexemes.peek(-1),
    );
  }
  lexemes.expect("TO", '"FOR" loop initialisation must be followed by "TO".');

  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"TO" must be followed by an integer (or integer constant).',
      lexemes.peek(-1),
    );
  }
  let finalValue = parseExpression(lexemes, routine);
  finalValue = typeCheck(routine.language, finalValue, "integer");

  // create some dummy lexemes for the condition and step change
  const oneToken = token("decimal", "1", lexeme.line, -1);
  const assignmentToken = token("operator", "=", lexeme.line, -1);
  const plusToken = token("operator", "+", lexeme.line, -1);
  const lseqToken = token("operator", "<=", lexeme.line, -1);
  const mreqToken = token("operator", ">=", lexeme.line, -1);
  const oneLexeme = integerLexeme(oneToken, 10);
  const assignmentLexeme = operatorLexeme(assignmentToken, "BASIC");
  const plusLexeme = operatorLexeme(plusToken, "BASIC");
  const lseqLexeme = operatorLexeme(lseqToken, "BASIC");
  const mreqLexeme = operatorLexeme(mreqToken, "BASIC");

  // define default condition and step change
  const left = makeVariableValue(variableLexeme, foo);
  const right = makeIntegerValue(oneLexeme);
  let change = makeVariableAssignment(
    assignmentLexeme,
    foo,
    [],
    makeCompoundExpression(plusLexeme, left, right, "plus"),
  );
  let condition = makeCompoundExpression(lseqLexeme, left, finalValue, "lseq");

  // "STEP" permissible here
  if (lexemes.peek()?.content === "STEP") {
    lexemes.advance();
    if (lexemes.atEnd()) {
      throw new CompilerError(
        '"STEP" instruction must be followed by an integer value.',
        lexemes.peek(-1),
      );
    }
    const stepValue = typeCheck(
      routine.language,
      parseExpression(lexemes, routine),
      "integer",
    );
    const evaluatedStepValue = evaluate(stepValue, "BASIC", "step") as number;
    if (evaluatedStepValue === 0) {
      throw new CompilerError("Step value cannot be zero.", stepValue.lexeme);
    }
    change = makeVariableAssignment(
      assignmentLexeme,
      foo,
      [],
      makeCompoundExpression(plusLexeme, left, stepValue, "plus"),
    );
    if (evaluatedStepValue < 0) {
      condition = makeCompoundExpression(mreqLexeme, left, finalValue, "mreq");
    } else {
      condition = makeCompoundExpression(lseqLexeme, left, finalValue, "lseq");
    }
  }

  const forStatement = makeForStatement(
    lexeme,
    initialisation,
    condition,
    change,
  );

  lexemes.skipComments();
  if (lexemes.atEnd()) {
    throw new CompilerError(
      'No statements found after "FOR" loop initialisation.',
      lexeme,
    );
  }
  // the body can start on the "FOR"'s own line or on the next one; either
  // way it runs to the matching "NEXT", and parseBlock copes with both
  // (parseStatement eats whichever separator - colon or line break - comes
  // after each statement)
  while (lexemes.peek()?.type === "newline") {
    lexemes.advance();
  }
  forStatement.statements.push(...parseBlock(lexemes, routine, "FOR"));

  return forStatement;
};

export default parseForStatement;
