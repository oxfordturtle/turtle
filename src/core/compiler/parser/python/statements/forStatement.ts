import type { Command } from "@/core/constants.ts";
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
import {
  type Expression,
  getListElementKind,
  isListExpression,
} from "../../definitions/expression.ts";
import makeCompoundExpression from "../../definitions/expressions/compoundExpression.ts";
import makeFunctionCall from "../../definitions/expressions/functionCall.ts";
import makeIntegerValue from "../../definitions/expressions/integerValue.ts";
import makeVariableValue from "../../definitions/expressions/variableValue.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import { type Routine } from "../../definitions/routine.ts";
import makeForStatement, {
  type ForStatement,
} from "../../definitions/statements/forStatement.ts";
import makeVariableAssignment, {
  type VariableAssignment,
} from "../../definitions/statements/variableAssignment.ts";
import makeVariable from "../../definitions/variable.ts";
import parseBlock from "./block.ts";

// names for the hidden index variable the list-iteration desugaring below
// introduces; never user-writable, since a Python identifier can't start with
// "!"
let listIterationCounter = 0;

export default (
  forLexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Routine,
): ForStatement => {
  // whether this turns out to be a "range(...)" loop or a list-iteration
  // loop, determined below)
  const variableLexeme = lexemes.peek();
  if (!variableLexeme) {
    throw new CompilerError(
      '"for" must be followed by an integer variable.',
      lexemes.peek(-1),
    );
  }
  if (variableLexeme.type !== "identifier") {
    throw new CompilerError(
      "{lex} is not a valid variable name.",
      lexemes.peek(),
    );
  }
  // always a binding target, never a mere read - see find.assignmentTarget
  let variable = find.assignmentTarget(
    routine,
    lexemes.peek()?.content as string,
  );
  if (!variable) {
    variable = makeVariable(lexemes.peek()?.content as string, routine);
    routine.variables.push(variable);
  }
  lexemes.advance();

  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"for <variable>" must be followed by "in".',
      lexemes.peek(-1),
    );
  }
  lexemes.expect("in", '"for <variable>" must be followed by "in".');

  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"for <variable> in" must be followed by a range specification or a list.',
      lexemes.peek(-1),
    );
  }

  let initialisation: VariableAssignment;
  let condition: Expression;
  let change: VariableAssignment;
  let prependedStatement: VariableAssignment | null = null;

  const zeroToken = token("decimal", "0", forLexeme.line, -1);
  const zeroLexeme = integerLexeme(zeroToken, 10);
  const zero = makeIntegerValue(zeroLexeme);
  const oneToken = token("decimal", "1", forLexeme.line, -1);
  const oneLexeme = integerLexeme(oneToken, 10);
  const one = makeIntegerValue(oneLexeme);
  const assignmentToken = token("operator", "=", forLexeme.line, -1);
  const assignmentLexeme = operatorLexeme(assignmentToken, "Python");
  const plusToken = token("operator", "+", forLexeme.line, -1);
  const lessToken = token("operator", "<", forLexeme.line, -1);
  const moreToken = token("operator", ">", forLexeme.line, -1);
  const plusLexeme = operatorLexeme(plusToken, "Python");
  const lessLexeme = operatorLexeme(lessToken, "Python");
  const moreLexeme = operatorLexeme(moreToken, "Python");

  if (lexemes.peek()?.content === "range") {
    // "for <variable> in range(...)" - the loop variable must be an integer
    if (!variable.typeIsCertain) {
      variable.type = "integer";
      variable.typeIsCertain = true;
    }
    if (variable.type !== "integer") {
      throw new CompilerError(
        "Loop variable must be an integer.",
        variableLexeme,
      );
    }
    lexemes.advance();

    if (lexemes.atEnd()) {
      throw new CompilerError(
        '"range" must be followed by an opening bracket.',
        lexemes.peek(-1),
      );
    }
    lexemes.expect("(", '"range" must be followed by an opening bracket.');

    if (lexemes.atEnd()) {
      throw new CompilerError(
        'Missing first argument to the "range" function.',
        lexemes.peek(-1),
      );
    }
    const providedValues: [Expression, Expression?, Expression?] = [
      typeCheck(routine.language, parseExpression(lexemes, routine), "integer"),
    ];

    if (lexemes.atEnd()) {
      throw new CompilerError(
        "Argument must be followed by a comma.",
        lexemes.peek(-1),
      );
    }
    if (lexemes.peek()?.content !== ")" && lexemes.peek()?.content !== ",") {
      throw new CompilerError(
        "Argument must be followed by a comma or a closing bracket.",
        lexemes.peek(),
      );
    }

    if (lexemes.match(",")) {
      if (lexemes.atEnd()) {
        throw new CompilerError(
          'Too few arguments for "range" function.',
          lexemes.peek(-1),
        );
      }
      providedValues.push(
        typeCheck(
          routine.language,
          parseExpression(lexemes, routine),
          "integer",
        ),
      );
    }

    if (lexemes.atEnd()) {
      throw new CompilerError(
        "Argument must be followed by a comma.",
        lexemes.peek(-1),
      );
    }
    if (lexemes.peek()?.content !== ")" && lexemes.peek()?.content !== ",") {
      throw new CompilerError(
        "Argument must be followed by a comma or a closing bracket.",
        lexemes.peek(),
      );
    }

    if (lexemes.match(",")) {
      if (lexemes.atEnd()) {
        throw new CompilerError(
          'Too few arguments for "range" function.',
          lexemes.peek(-1),
        );
      }
      providedValues.push(
        typeCheck(
          routine.language,
          parseExpression(lexemes, routine),
          "integer",
        ),
      );
    }

    const left = makeVariableValue(variableLexeme, variable);

    switch (providedValues.length) {
      case 1:
        initialisation = makeVariableAssignment(
          assignmentLexeme,
          variable,
          [],
          zero,
        );
        change = makeVariableAssignment(
          assignmentLexeme,
          variable,
          [],
          makeCompoundExpression(plusLexeme, left, one, "plus"),
        );
        condition = makeCompoundExpression(
          lessLexeme,
          left,
          providedValues[0],
          "less",
        );
        break;
      case 2:
        initialisation = makeVariableAssignment(
          assignmentLexeme,
          variable,
          [],
          providedValues[0],
        );
        change = makeVariableAssignment(
          assignmentLexeme,
          variable,
          [],
          makeCompoundExpression(plusLexeme, left, one, "plus"),
        );
        condition = makeCompoundExpression(
          lessLexeme,
          left,
          providedValues[1]!,
          "less",
        );
        break;
      case 3: {
        initialisation = makeVariableAssignment(
          assignmentLexeme,
          variable,
          [],
          providedValues[0],
        );
        const stepValue = evaluate(
          providedValues[2]!,
          "Python",
          "step",
        ) as number;
        change = makeVariableAssignment(
          assignmentLexeme,
          variable,
          [],
          makeCompoundExpression(plusLexeme, left, providedValues[2]!, "plus"),
        );
        condition =
          stepValue < 0
            ? makeCompoundExpression(
                moreLexeme,
                left,
                providedValues[1]!,
                "more",
              )
            : makeCompoundExpression(
                lessLexeme,
                left,
                providedValues[1]!,
                "less",
              );
        break;
      }
    }

    if (lexemes.atEnd()) {
      throw new CompilerError(
        'Closing bracket needed after "range" function arguments.',
        lexemes.peek(-1),
      );
    }
    if (lexemes.peek()?.content === ",") {
      throw new CompilerError(
        'Too many arguments for "range" function.',
        lexemes.peek(),
      );
    }
    lexemes.expect(
      ")",
      'Closing bracket needed after "range" function arguments.',
    );
  } else {
    // Iterating a list or a string desugars into an index-based loop over a
    // hidden "!indexN", plus a synthesized "<variable> = <subject>[!indexN]"
    // prepended to the body. The two differ only in how the loop variable's
    // type is pinned.
    const listExpression = parseExpression(lexemes, routine);
    const isPlainVariableRef =
      listExpression.kind === "variable" &&
      listExpression.indexes.length === 0 &&
      listExpression.slice === null;
    const isStringVariable =
      isPlainVariableRef &&
      !listExpression.variable.isList &&
      listExpression.variable.type === "string";
    const isListVariable =
      isPlainVariableRef && isListExpression(listExpression);
    if (!isStringVariable && !isListVariable) {
      // only a plain variable, not an expression ("for x in mylist.copy():")
      throw new CompilerError(
        '"for <variable> in" must be followed by a range specification or a list variable.',
        listExpression.lexeme,
      );
    }
    const listVariable = listExpression.variable;

    if (isListVariable) {
      // iterating a list of lists is unsupported: without this check the loop
      // variable would be pinned as "integer", the sublist's opaque pointer
      if (listVariable.isListOfLists) {
        throw new CompilerError(
          "Iterating directly over a list of lists is not supported; use an index-based loop instead.",
          listExpression.lexeme,
        );
      }

      // pin if uncertain, else must match. If the element kind isn't known
      // either, leave the loop variable uncertain: something later may pin it,
      // and checkForUncertainTypes catches it if nothing does.
      const elementKind = getListElementKind(listExpression);
      if (!variable.typeIsCertain) {
        if (elementKind !== undefined) {
          variable.type = elementKind;
          variable.typeIsCertain = true;
        }
      } else if (elementKind !== undefined && variable.type !== elementKind) {
        throw new CompilerError(
          "Loop variable type does not match the list's element type.",
          variableLexeme,
        );
      }
    } else {
      // Python here has no character type, so a string's elements are always
      // single-character strings and no element-kind lookup is needed
      if (!variable.typeIsCertain) {
        variable.type = "string";
        variable.typeIsCertain = true;
      } else if (variable.type !== "string") {
        throw new CompilerError(
          "Loop variable type does not match the list's element type.",
          variableLexeme,
        );
      }
    }

    listIterationCounter += 1;
    const indexVariable = makeVariable(
      `!index${listIterationCounter}`,
      routine,
    );
    indexVariable.type = "integer";
    indexVariable.typeIsCertain = true;
    routine.variables.push(indexVariable);
    const indexValue = makeVariableValue(variableLexeme, indexVariable);

    initialisation = makeVariableAssignment(
      assignmentLexeme,
      indexVariable,
      [],
      zero,
    );

    const lenCommand = find.command(routine, "len") as Command;
    const lenCall = makeFunctionCall(variableLexeme, lenCommand);
    lenCall.arguments.push(listExpression);
    condition = makeCompoundExpression(lessLexeme, indexValue, lenCall, "less");

    change = makeVariableAssignment(
      assignmentLexeme,
      indexVariable,
      [],
      makeCompoundExpression(plusLexeme, indexValue, one, "plus"),
    );

    const elementRead = makeVariableValue(variableLexeme, listVariable);
    elementRead.indexes.push(makeVariableValue(variableLexeme, indexVariable));
    prependedStatement = makeVariableAssignment(
      assignmentLexeme,
      variable,
      [],
      elementRead,
    );
  }

  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"for <variable> in ...:" must be followed by a colon.',
      lexemes.peek(-1),
    );
  }
  lexemes.expect(":", '"for <variable> in ...:" must be followed by a colon.');

  // whileStatement.ts's equivalent check for why)
  lexemes.skipComments();
  if (lexemes.atEnd()) {
    throw new CompilerError(
      'No statements found after "for <variable> in ...:".',
      lexemes.peek(-1),
    );
  }
  if (lexemes.peek()?.type !== "newline") {
    throw new CompilerError(
      'Statements following "for <variable> in ...:" must be on a new line.',
      lexemes.peek(),
    );
  }
  lexemes.advance();

  const forStatement = makeForStatement(
    forLexeme,
    initialisation,
    condition,
    change,
  );
  if (prependedStatement) {
    forStatement.statements.push(prependedStatement);
  }

  if (lexemes.atEnd()) {
    throw new CompilerError(
      'No statements found after "for <variable> in ...:".',
      lexemes.peek(-1),
    );
  }
  if (lexemes.peek()?.type !== "indent") {
    throw new CompilerError(
      'Statements following "for <variable> in ...:" must be indented.',
      lexemes.peek(),
    );
  }
  lexemes.advance();

  if (lexemes.atEnd()) {
    throw new CompilerError(
      'No statements found after "for <variable> in ...:',
      lexemes.peek(-1),
    );
  }
  routine.loopDepth += 1;
  forStatement.statements.push(...parseBlock(lexemes, routine));
  routine.loopDepth -= 1;

  return forStatement;
};
