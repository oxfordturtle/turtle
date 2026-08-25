import { type Language, trueValue } from "@/core/constants.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Expression } from "../definitions/expression.ts";

const evaluate = (
  expression: Expression,
  language: Language,
  context: "constant" | "string" | "array" | "step",
): number | string => {
  const True = trueValue[language];
  const False = 0;

  switch (expression.expressionType) {
    case "address":
    case "variable":
    case "namedArgument":
      if (context === "constant") {
        throw new CompilerError(
          "Constant value cannot refer to any variables.",
          expression.lexeme,
        );
      } else if (context === "string") {
        throw new CompilerError(
          "String size specification cannot refer to any variables.",
          expression.lexeme,
        );
      } else if (context === "array") {
        throw new CompilerError(
          "Array size specification cannot refer to any variables.",
          expression.lexeme,
        );
      } else {
        throw new CompilerError(
          "FOR loop step change specification cannot refer to any variables.",
          expression.lexeme,
        );
      }

    case "function":
      if (context === "constant") {
        throw new CompilerError(
          "Constant value cannot invoke any functions.",
          expression.lexeme,
        );
      } else if (context === "string") {
        throw new CompilerError(
          "String size specification cannot invoke any functions.",
          expression.lexeme,
        );
      } else if (context === "array") {
        throw new CompilerError(
          "Array size specification cannot invoke any functions.",
          expression.lexeme,
        );
      } else {
        throw new CompilerError(
          "FOR loop step change specification cannot invoke any functions.",
          expression.lexeme,
        );
      }

    case "constant":
      return expression.constant.value;

    case "query":
      return expression.input.value;

    case "integer":
    case "string":
      return expression.value;

    case "input":
      return expression.input.value;

    case "colour":
      return expression.colour.value;

    case "cast":
      return evaluate(expression.expression, language, context);

    case "compound": {
      const left = expression.left
        ? evaluate(expression.left, language, context)
        : null;
      const right = evaluate(expression.right, language, context);
      switch (expression.operator) {
        case "eqal":
        case "seql":
          return (left as number | string) === right ? True : False;

        case "less":
        case "sles":
          return (left as number | string) < right ? True : False;

        case "lseq":
        case "sleq":
          return (left as number | string) <= right ? True : False;

        case "more":
        case "smor":
          return (left as number | string) > right ? True : False;

        case "mreq":
        case "smeq":
          return (left as number | string) >= right ? True : False;

        case "noeq":
        case "sneq":
          return (left as number | string) !== right ? True : False;

        case "plus":
          return (left as number) + (right as number);

        case "scat":
          return (left as string) + (right as string);

        case "subt":
          return left
            ? (left as number) - (right as number)
            : -(right as number);

        case "neg":
          return -(right as number);

        case "not":
          return right === 0 ? True : False;

        case "or":
          return (left as number) | (right as number);

        case "orl":
          return (left as number) || (right as number);

        case "xor":
          return (left as number) ^ (right as number);

        case "and":
          return (left as number) & (right as number);

        case "andl":
          return (left as number) && (right as number);

        case "div":
          return Math.floor((left as number) / (right as number));

        case "divr":
          return Math.round((left as number) / (right as number));

        case "mod":
          return (left as number) % (right as number);

        case "mult":
          return (left as number) * (right as number);

        // deno-coverage-ignore-start -- unreachable: an "lmul" compound's
        // left operand is always a list expression (common/expression.ts only
        // reroutes "mult" to "lmul" when isListExpression(left) holds), and
        // evaluating any list operand throws before the operator switch is
        // reached - a list literal hits the "listLiteral" case below, a list
        // variable or function call hits the "variable"/"function" cases
        // above, and a nested "lmul" recurses to the same dead end - so this
        // arm, and the two breaks that fall through to the final throw below,
        // can never run. Lists are never compile-time constants.
        case "lmul":
          break;
      }
      break;
    }
    // deno-coverage-ignore-stop

    case "listLiteral":
      if (context === "constant") {
        throw new CompilerError(
          "Constant value cannot be a list.",
          expression.lexeme,
        );
        // deno-coverage-ignore-start -- unreachable: list literals are
        // Python-only syntax (common/factor.ts), and "constant" is the only
        // one of the four evaluate contexts Python reaches - it has no
        // string-size or array-size specification, and its FOR-step (the
        // third "range" argument, python/statements/forStatement.ts) is
        // type-checked as an integer, which rejects a list, before evaluate
        // is ever called
      } else if (context === "string") {
        throw new CompilerError(
          "String size specification cannot be a list.",
          expression.lexeme,
        );
      } else if (context === "array") {
        throw new CompilerError(
          "Array size specification cannot be a list.",
          expression.lexeme,
        );
      } else {
        throw new CompilerError(
          "FOR loop step change specification cannot be a list.",
          expression.lexeme,
        );
      }
    // deno-coverage-ignore-stop

    // deno-coverage-ignore-start -- unreachable: exhaustiveness guard, dead by
    // TypeScript's own check ("satisfies never" would not compile if any
    // Expression variant were missing above)
    default:
      return expression satisfies never;
  }
  // deno-coverage-ignore-stop

  // deno-coverage-ignore-start -- unreachable: only the "lmul" breaks above
  // fall through to here, and those are themselves unreachable (see the
  // justification on the "lmul" arm)
  throw new CompilerError(
    "This expression cannot be evaluated as a constant.",
    expression.lexeme,
  );
  // deno-coverage-ignore-stop
};

export default evaluate;
