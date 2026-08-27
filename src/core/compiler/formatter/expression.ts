import type { Expression } from "../parser/definitions/expression.ts";
import type { Language } from "@/core/constants.ts";
import type from "./type.ts";

const expression = (exp: Expression, language: Language): string => {
  switch (exp.kind) {
    case "colour":
    case "constant":
    case "input":
    case "integer":
    case "string":
      return exp.lexeme.content;

    case "address":
      return `&${exp.variable.name}`;

    case "cast":
      if (language === "C" || language === "Java") {
        return `(${type(exp.type, language)}) ${expression(
          exp.expression,
          language,
        )}`;
      }
      return expression(exp.expression, language);

    case "compound":
      if (exp.left) {
        return `(${expression(exp.left, language)} ${exp.lexeme.content} ${expression(
          exp.right,
          language,
        )})`;
      }
      if (exp.lexeme.content.toLowerCase() === "not") {
        return `${exp.lexeme.content} ${expression(exp.right, language)}`;
      }
      return `${exp.lexeme.content}${expression(exp.right, language)}`;

    case "function": {
      const name =
        exp.command.kind === "Command"
          ? (exp.command.names[language] as string)
          : exp.command.name;
      if (
        (language === "BASIC" || language === "Pascal") &&
        exp.arguments.length === 0
      ) {
        return name;
      }
      return `${name}(${exp.arguments
        .map((x) => expression(x, language))
        .join(", ")})`;
    }

    case "variable":
      if (exp.indexes.length > 0) {
        switch (language) {
          case "BASIC":
            return `${exp.lexeme.content}(${exp.indexes
              .map((x) => expression(x, language))
              .join(", ")})`;
          case "Pascal":
            return `${exp.lexeme.content}[${exp.indexes
              .map((x) => expression(x, language))
              .join(", ")}]`;
          default:
            return `${exp.lexeme.content}[${exp.indexes
              .map((x) => expression(x, language))
              .join("][")}]`;
        }
      }
      return exp.lexeme.content;

    case "namedArgument":
      return "TODO";

    case "query":
      return "TODO";

    case "listLiteral":
      return `[${exp.elements.map((x) => expression(x, language)).join(", ")}]`;

    // deno-coverage-ignore-start -- unreachable: the switch above is
    // exhaustive over Expression's variants, as "satisfies never" proves at
    // compile time, so no parsed program can produce a node that reaches
    // this arm.
    default:
      return exp satisfies never;
    // deno-coverage-ignore-stop
  }
};

export default expression;
