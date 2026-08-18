import {
  type IdentifierLexeme,
  operatorLexeme,
} from "../../../lexer/lexeme.ts";
import { token } from "../../../tokenizer/token.ts";
import { CompilerError } from "../../../tools/error.ts";
import evaluate from "../../common/evaluate.ts";
import parseExpression from "../../common/expression.ts";
import constant from "../../definitions/constant.ts";
import makeListLiteral from "../../definitions/expressions/listLiteral.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import { type Routine } from "../../definitions/routine.ts";
import makePassStatement, {
  type PassStatement,
} from "../../definitions/statements/passStatement.ts";
import makeVariableAssignment, {
  type VariableAssignment,
} from "../../definitions/statements/variableAssignment.ts";
import variable from "../variable.ts";
import parseVariableAssignment from "./variableAssignment.ts";

export default (
  variableLexeme: IdentifierLexeme,
  lexemes: Lexemes,
  routine: Routine,
): VariableAssignment | PassStatement => {
  const foo = variable(lexemes, routine);

  if (foo.__ === "constant") {
    if (!lexemes.get()) {
      throw new CompilerError(
        "Constant must be assigned a value.",
        lexemes.get(-1),
      );
    }
    if (lexemes.get()?.content !== "=") {
      throw new CompilerError(
        "Constant must be assigned a value.",
        lexemes.get(),
      );
    }
    lexemes.next();

    const exp = parseExpression(lexemes, routine);
    const value = evaluate(exp, "Python", "constant");

    const bar = constant(routine.language, foo.name, value);
    routine.constants.push(bar);

    return makePassStatement();
  }

  routine.variables.push(foo);

  if (lexemes.get()?.content === "=") {
    return parseVariableAssignment(variableLexeme, lexemes, routine, foo);
  }

  // A hint-only list declaration ("x: List[int]", no "= []") still needs an
  // implicit empty-list initialisation: unlike a scalar, which is just an
  // uninitialised cell defaulting to 0, a list needs a real heap block to exist
  // before anything indexes or appends to it.
  if (foo.isList) {
    const assignmentToken = token("operator", "=", variableLexeme.line, -1);
    const assignmentLexeme = operatorLexeme(assignmentToken, "Python");
    const emptyList = makeListLiteral(variableLexeme, [], foo.listElementKind);
    return makeVariableAssignment(assignmentLexeme, foo, [], emptyList);
  }

  return makePassStatement();
};
