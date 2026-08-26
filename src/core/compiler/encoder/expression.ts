import type { Expression } from "../parser/definitions/expression.ts";
import type { VariableValue } from "../parser/definitions/expressions/variableValue.ts";
import type { Program } from "../parser/definitions/routines/program.ts";
import { isArray } from "../parser/definitions/variable.ts";
import type { Options } from "./options.ts";
import castExpression from "./expressions/castExpression.ts";
import colourValue from "./expressions/colourValue.ts";
import compoundExpression from "./expressions/compoundExpression.ts";
import constantValue from "./expressions/constantValue.ts";
import functionValue from "./expressions/functionValue.ts";
import inputValue from "./expressions/inputValue.ts";
import listLiteral from "./expressions/listLiteral.ts";
import queryValue from "./expressions/queryValue.ts";
import literalIntegerValue from "./expressions/literalIntegerValue.ts";
import literalStringValue from "./expressions/literalStringValue.ts";
import variableAddress from "./expressions/variableAddress.ts";
import variableValue from "./expressions/variableValue.ts";

const expression = (
  exp: Expression,
  program: Program,
  options: Options,
  reference = false,
): number[][] => {
  switch (exp.kind) {
    case "integer":
      return [literalIntegerValue(exp, program, options)];
    case "string":
      return [literalStringValue(exp, program, options)];
    case "input":
      return [inputValue(exp, program, options)];
    case "query":
      return [queryValue(exp, program, options)];
    case "colour":
      return [colourValue(exp, program, options)];
    case "constant":
      return constantValue(exp, program, options);
    case "address":
      return variableAddress(exp, program, options);
    case "variable":
      return reference && !referenceVariableAddressIsValue(exp)
        ? variableAddress(exp, program, options)
        : variableValue(exp, program, options);
    // deno-coverage-ignore-start -- unreachable: a NamedArgument is only ever
    // built for Python print's "sep"/"end" (parser/common/arguments.ts), and
    // print's encoder (statements/procedureCall.ts) filters named arguments
    // out of the positional list and calls expression() on their inner
    // .expression directly, so the wrapper itself never arrives here. The
    // case must still exist for this switch to be exhaustive over Expression.
    case "namedArgument":
      return expression(exp.expression, program, options, reference);
    // deno-coverage-ignore-stop
    case "function":
      return functionValue(exp, program, options);
    case "compound":
      return compoundExpression(exp, program, options);
    case "cast":
      return castExpression(exp, program, options);
    case "listLiteral":
      return listLiteral(exp, program, options);
  }
};

export default expression;

const referenceVariableAddressIsValue = (exp: VariableValue): boolean =>
  (isArray(exp.variable) &&
    exp.indexes.length < exp.variable.arrayDimensions.length) ||
  (exp.variable.type === "string" && exp.indexes.length === 0);
