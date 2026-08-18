import type { IdentifierLexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Command, Language, Parameter } from "@/core/constants.ts";
import {
  type Expression,
  getListElementKind,
  getType,
  isListExpression,
} from "../definitions/expression.ts";
import type { FunctionCall } from "../definitions/expressions/functionCall.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import {
  getParameters,
  Subroutine,
} from "../definitions/routines/subroutine.ts";
import type { ProcedureCall } from "../definitions/statements/procedureCall.ts";
import { isArray } from "../definitions/variable.ts";
import makeCastExpression from "../definitions/expressions/castExpression.ts";
import parseExpression from "./expression.ts";
import typeCheck, { pinListElementKind } from "./typeCheck.ts";
import { Variable } from "../definitions/variable.ts";
import makeNamedArgument from "../definitions/expressions/namedArgument.ts";
import makeStringValue from "../definitions/expressions/stringValue.ts";
import { stringLexeme } from "../../lexer/lexeme.ts";
import { token } from "../../tokenizer/token.ts";

const parseArguments = (
  lexeme: IdentifierLexeme,
  lexemes: Lexemes,
  routine: Routine,
  commandCall: ProcedureCall | FunctionCall,
): void => {
  const allParameters =
    commandCall.command.__ === "Command"
      ? commandCall.command.parameters
      : getParameters(commandCall.command);
  const isMethod =
    commandCall.command.__ === "Command" &&
    commandCall.command.names[routine.language]?.startsWith(".");
  const parameters = isMethod ? allParameters.slice(1) : allParameters;

  if (parameters.length > 0) {
    if (!lexemes.get() || lexemes.get()?.content !== "(") {
      throw new CompilerError(
        "Opening bracket missing after command {lex}.",
        lexeme,
      );
    }

    lexemes.next();

    parseArgumentList(lexemes, routine, commandCall);
  } // without parameters
  else {
    // command with no parameters in BASIC or Pascal (brackets not allowed)
    if (routine.language === "BASIC" || routine.language === "Pascal") {
      if (lexemes.get() && lexemes.get()?.content === "(") {
        throw new CompilerError(
          "Command {lex} takes no arguments.",
          lexemes.get(-1),
        );
      }
    } // command with no parameters in other languages (brackets obligatory)
    else {
      const openBracket = lexemes.get();
      const closeBracket = lexemes.get(1);
      if (!openBracket || openBracket.content !== "(") {
        throw new CompilerError(
          "Opening bracket missing after command {lex}.",
          lexemes.get(-1),
        );
      }

      if (
        !closeBracket ||
        closeBracket.type === "newline" ||
        closeBracket.content === ";"
      ) {
        throw new CompilerError(
          "Closing bracket missing after command {lex}.",
          lexemes.get(-1),
        );
      }
      if (closeBracket.content !== ")") {
        throw new CompilerError(
          "Command {lex} takes no arguments.",
          lexemes.get(-1),
        );
      }

      lexemes.next();
      lexemes.next();
    }
  }
};

export default parseArguments;

const parseArgumentList = (
  lexemes: Lexemes,
  routine: Routine,
  commandCall: ProcedureCall | FunctionCall,
): void => {
  const commandName =
    commandCall.command.__ === "Command"
      ? commandCall.command.names[routine.language]
      : commandCall.command.name;

  const parameters =
    commandCall.command.__ === "Command"
      ? commandCall.command.parameters
      : getParameters(commandCall.command);

  if (routine.language === "Python" && commandName === "input") {
    // "input" is variadic: a single string argument is allowed, not required
    if (lexemes.get()?.content !== ")") {
      const parameter = parameters[0];
      const argument = parseExpression(lexemes, routine);
      typeCheckArgument(
        routine.language,
        commandCall.command,
        argument,
        parameter,
      );
      commandCall.arguments.push(argument);
    }
    if (commandCall.arguments.length === 0) {
      const lexeme = stringLexeme(token("string", "''", 0, 0), "Python");
      commandCall.arguments.push(makeStringValue(lexeme));
    }
  } else if (routine.language === "Python" && commandName === "print") {
    // "print" is variadic: any number of positional arguments, optionally
    // followed by the named "sep" and "end", neither repeatable
    const parameter = parameters[0];
    const namedSoFar = new Set<string>();
    while (lexemes.get()?.content !== ")") {
      const lexeme = lexemes.get()!;
      if (lexeme.type === "identifier" && lexemes.get(1)?.content === "=") {
        if (lexeme.content !== "end" && lexeme.content !== "sep") {
          throw new CompilerError(
            `Unknown named argument ${lexeme.content}.`,
            lexeme,
          );
        }
        if (namedSoFar.has(lexeme.content)) {
          throw new CompilerError(
            `Repeated named argument ${lexeme.content}.`,
            lexeme,
          );
        }
        namedSoFar.add(lexeme.content);
        lexemes.next();
        lexemes.next();
        let argument = parseExpression(lexemes, routine);
        argument = typeCheckArgument(
          routine.language,
          commandCall.command,
          argument,
          parameter,
        );
        const namedArgument = makeNamedArgument(lexeme, argument);
        commandCall.arguments.push(namedArgument);
        if (lexemes.get()?.content === ",") {
          lexemes.next();
        }
      } else {
        if (namedSoFar.size > 0) {
          throw new CompilerError(
            'Positional argument after named argument in call to command "print".',
            lexeme,
          );
        }
        let argument = parseExpression(lexemes, routine);
        // the possibly cast-wrapped return value, not the original argument
        argument = typeCheckArgument(
          routine.language,
          commandCall.command,
          argument,
          parameter,
        );
        commandCall.arguments.push(argument);
        if (lexemes.get()?.content === ",") {
          lexemes.next();
        }
      }
    }
    if (commandCall.arguments.length === 0) {
      const lexeme = stringLexeme(token("string", "''", 0, 0), "Python");
      commandCall.arguments.push(makeStringValue(lexeme));
    }
  } else {
    while (
      commandCall.arguments.length < parameters.length &&
      lexemes.get()?.content !== ")"
    ) {
      const parameter = parameters[commandCall.arguments.length];
      // for a method call, arguments[0] is already the receiver, so
      // ".append"'s value can be checked against its element kind
      const receiver = commandCall.arguments[0];
      let argument = parseExpression(lexemes, routine);
      argument = typeCheckArgument(
        routine.language,
        commandCall.command,
        argument,
        parameter,
        receiver,
      );
      commandCall.arguments.push(argument);
      if (commandCall.arguments.length < parameters.length) {
        if (!lexemes.get()) {
          throw new CompilerError(
            "Comma needed after parameter.",
            argument.lexeme,
          );
        }
        if (lexemes.get()?.content === ")") {
          throw new CompilerError(
            `Not enough arguments given for command "${commandName}".`,
            commandCall.lexeme,
          );
        }
        if (lexemes.get()?.content !== ",") {
          throw new CompilerError(
            "Comma needed after parameter.",
            argument.lexeme,
          );
        }
        lexemes.next();
      }
    }
  }

  if (commandCall.arguments.length < parameters.length) {
    throw new CompilerError(
      "Too few arguments given for command {lex}.",
      commandCall.lexeme,
    );
  }
  if (lexemes.get()?.content === ",") {
    throw new CompilerError(
      "Too many arguments given for command {lex}.",
      commandCall.lexeme,
    );
  }
  if (lexemes.get()?.content !== ")") {
    throw new CompilerError(
      "Closing bracket missing after command {lex}.",
      commandCall.lexeme,
    );
  }

  lexemes.next();
};

export const typeCheckArgument = (
  language: Language,
  command: Command | Subroutine,
  argument: Expression,
  parameter: Parameter | Variable,
  receiver?: Expression,
): Expression => {
  if (command.__ === "Command") {
    switch (command.names[language]?.toLowerCase()) {
      case "address":
        // a variable passed by reference to the address function may be any type
        return argument;

      case "length":
      case ".length":
      case "len":
      case "strlen":
        // the length command accepts a string, an array or a Python list; every
        // per-language spelling of it is listed, Python's being "len"
        if (
          argument.expressionType === "variable" &&
          isArray(argument.variable)
        ) {
          return argument;
        }
        if (isListExpression(argument)) {
          return argument;
        }
        return typeCheck(language, argument, parameter);

      case "print":
        // Python's print() implicitly stringifies any argument, lists included
        if (isListExpression(argument)) {
          return makeCastExpression(argument.lexeme, "string", argument);
        }
        if (
          getType(argument) === "integer" ||
          getType(argument) === "character"
        ) {
          return makeCastExpression(argument.lexeme, "string", argument);
        }
        return typeCheck(language, argument, parameter);

      default: {
        // A native list-method parameter's `type` is only a scalar placeholder,
        // so it needs its own checks rather than typeCheck's Type ladder. A
        // user subroutine's "List[T]" parameter is a Variable, which typeCheck
        // already handles.
        if (parameter.__ === "Parameter" && parameter.isList) {
          if (!isListExpression(argument)) {
            throw new CompilerError(
              "Type error: a list was expected.",
              argument.lexeme,
            );
          }
          if (receiver) {
            const receiverKind = getListElementKind(receiver);
            const argumentKind = getListElementKind(argument);
            if (
              receiverKind !== undefined &&
              argumentKind !== undefined &&
              receiverKind !== argumentKind
            ) {
              throw new CompilerError(
                `Type error: a list of '${receiverKind}' was expected but a list of '${argumentKind}' was found.`,
                argument.lexeme,
              );
            }
          }
          return argument;
        }
        if (
          parameter.__ === "Parameter" &&
          parameter.matchesListElement &&
          receiver
        ) {
          // an unindexed list-of-lists reference: the element being appended
          // or removed is a whole sublist, not a scalar
          const receiverVariable =
            receiver.expressionType === "variable" &&
            receiver.indexes.length === 0
              ? receiver.variable
              : undefined;

          if (receiverVariable?.isListOfLists) {
            if (!isListExpression(argument)) {
              throw new CompilerError(
                "Type error: a list was expected.",
                argument.lexeme,
              );
            }
            const innerKind = receiverVariable.innerListElementKind;
            const argumentKind = getListElementKind(argument);
            if (
              innerKind !== undefined &&
              argumentKind !== undefined &&
              innerKind !== argumentKind
            ) {
              throw new CompilerError(
                `Type error: a list of '${innerKind}' was expected but a list of '${argumentKind}' was found.`,
                argument.lexeme,
              );
            }
            if (innerKind === undefined) {
              receiverVariable.innerListElementKind = argumentKind;
              receiverVariable.typeIsCertain = argumentKind !== undefined;
            }
            return argument;
          }

          const kind = getListElementKind(receiver);
          if (kind !== undefined) {
            return typeCheck(language, argument, kind);
          }
          // "x=[]" then "x.append(5)": this call is what reveals the kind
          if (receiverVariable) {
            pinListElementKind(receiverVariable, argument);
          }
          return argument;
        }
        return typeCheck(language, argument, parameter);
      }
    }
  } else {
    return typeCheck(language, argument, parameter);
  }
};
