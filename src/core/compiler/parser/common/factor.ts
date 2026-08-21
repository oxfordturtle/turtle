import type {
  IdentifierLexeme,
  Lexeme,
  TypeLexeme,
} from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import parseFunctionCall, { parseMethodFunctionCall } from "./functionCall.ts";
import {
  type Expression,
  getListElementKind,
  getType,
  isListExpression,
} from "../definitions/expression.ts";
import makeCastExpression from "../definitions/expressions/castExpression.ts";
import makeColourValue from "../definitions/expressions/colourValue.ts";
import makeCompoundExpression from "../definitions/expressions/compoundExpression.ts";
import makeConstantValue from "../definitions/expressions/constantValue.ts";
import makeInputValue from "../definitions/expressions/inputValue.ts";
import makeListLiteral from "../definitions/expressions/listLiteral.ts";
import makeQueryValue from "../definitions/expressions/queryValue.ts";
import makeIntegerValue from "../definitions/expressions/integerValue.ts";
import makeStringValue from "../definitions/expressions/stringValue.ts";
import makeVariableAddress from "../definitions/expressions/variableAddress.ts";
import makeVariableValue from "../definitions/expressions/variableValue.ts";
import { type Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import { isArray } from "../definitions/variable.ts";
import parseExpression from "./expression.ts";
import * as find from "./find.ts";
import typeCheck from "./typeCheck.ts";
import makeVariable from "../definitions/variable.ts";

/**
 * The bound after a ":" in a Python string slice; null when omitted. Step
 * slices ("s[::2]") are unsupported, and named here rather than left to
 * parseExpression's generic "Expression cannot begin with ':'".
 */
const parseSliceBound = (
  lexemes: Lexemes,
  routine: Routine,
  close: string,
  fallbackLexeme: Lexeme,
): Expression | null => {
  if (lexemes.get()?.content === ":") {
    throw new CompilerError(
      'Slices with a step ("s[a:b:c]") are not supported.',
      lexemes.get(),
    );
  }
  if (!lexemes.get()) {
    throw new CompilerError(
      `Closing bracket "${close}" missing after string variable index.`,
      fallbackLexeme,
    );
  }
  if (lexemes.get()?.content === close) {
    return null;
  }
  return typeCheck(
    routine.language,
    parseExpression(lexemes, routine),
    "integer",
  );
};

/**
 * A subscript applied to a string: a character index in any language, or a
 * Python slice. Exactly one of the two returned fields is non-null. Shared by
 * the two receivers that can carry one, a plain string variable and a string
 * element of a list ("p[0][1:3]").
 */
const parseStringSubscript = (
  lexemes: Lexemes,
  routine: Routine,
  close: string,
  fallbackLexeme: Lexeme,
): {
  index: Expression | null;
  slice: [Expression | null, Expression | null] | null;
} => {
  let index: Expression | null = null;
  let slice: [Expression | null, Expression | null] | null = null;

  // checked before parsing anything: with the start bound omitted there is no
  // first expression whose trailing ":" would give the slice away
  if (routine.language === "Python" && lexemes.get()?.content === ":") {
    lexemes.next();
    slice = [null, parseSliceBound(lexemes, routine, close, fallbackLexeme)];
  } else {
    const exp = typeCheck(
      routine.language,
      parseExpression(lexemes, routine),
      "integer",
    );
    if (routine.language === "Python" && lexemes.get()?.content === ":") {
      lexemes.next();
      slice = [exp, parseSliceBound(lexemes, routine, close, fallbackLexeme)];
    } else {
      index = exp;
    }
  }

  if (!lexemes.get() || lexemes.get()?.content !== close) {
    // a step slice, worth naming rather than reporting as a missing bracket
    if (slice !== null && lexemes.get()?.content === ":") {
      throw new CompilerError(
        'Slices with a step ("s[a:b:c]") are not supported.',
        lexemes.get(),
      );
    }
    // the previous lexeme rather than the bound's own: with the start omitted
    // there may not be one
    throw new CompilerError(
      `Closing bracket "${close}" missing after string variable index.`,
      lexemes.get(-1),
    );
  }
  lexemes.next();

  return { index, slice };
};

const parseFactor = (lexemes: Lexemes, routine: Routine): Expression => {
  // an expression can legitimately end a program (a BASIC function's closing
  // "=<expression>" line), so the lexemes really can run out here; without
  // this the cast below turns that into a raw TypeError
  if (!lexemes.get()) {
    throw new CompilerError("Expression expected.", lexemes.get(-1));
  }
  const lexeme = lexemes.get() as Lexeme;
  let exp: Expression;

  switch (lexeme.type) {
    case "operator":
      switch (lexeme.subtype) {
        case "subt":
          lexemes.next();
          exp = parseFactor(lexemes, routine);
          exp = typeCheck(routine.language, exp, "integer");
          return makeCompoundExpression(lexeme, null, exp, "neg");

        case "not":
          lexemes.next();
          exp = parseFactor(lexemes, routine);
          exp = typeCheck(routine.language, exp, "boolint");
          return makeCompoundExpression(lexeme, null, exp, "not");

        case "and": {
          if (routine.language !== "C") {
            throw new CompilerError(
              "Expression cannot begin with {lex}.",
              lexemes.get(),
            );
          }
          lexemes.next();
          exp = parseFactor(lexemes, routine);
          if (exp.expressionType !== "variable") {
            throw new CompilerError(
              'Address operator "&" must be followed by a variable.',
              lexeme,
            );
          }
          const variableAddress = makeVariableAddress(exp.lexeme, exp.variable);
          variableAddress.indexes.push(...exp.indexes);
          return variableAddress;
        }

        default:
          throw new CompilerError(
            "Expression cannot begin with {lex}.",
            lexeme,
          );
      }

    case "literal":
      lexemes.next();
      return lexeme.subtype === "string"
        ? makeStringValue(lexeme)
        : makeIntegerValue(lexeme);

    case "input": {
      const input = find.input(routine, lexeme.value);
      if (input) {
        lexemes.next();
        return makeInputValue(lexeme, input);
        // deno-coverage-ignore-start -- the throw is unreachable: the
        // tokenizer only makes an "inputCode" token for names on the same
        // `inputs` list find.input searches (anything else becomes a
        // "badInputCode", which lexify.ts rejects with "Unrecognised input
        // code." before the parser ever runs), and lexer/lexeme.ts applies
        // the same Pascal lower-casing find.input does, so the lookup cannot
        // fail
      }
      throw new CompilerError("{lex} is not a valid input code.", lexeme);
    }
    // deno-coverage-ignore-stop

    case "query": {
      const query = find.query(routine, lexeme.value);
      if (query) {
        lexemes.next();
        return makeQueryValue(lexeme, query);
        // deno-coverage-ignore-start -- the throw is unreachable, for the
        // same reason as the input case above: only names find.query itself
        // accepts ever become "queryCode" tokens ("badQueryCode" is rejected
        // by lexify.ts with "Unrecognised input query." first)
      }
      throw new CompilerError("{lex} is not a valid query code.", lexeme);
    }
    // deno-coverage-ignore-stop

    case "identifier": {
      const constant = find.constant(routine, lexeme.value);
      if (constant) {
        const constantValue = makeConstantValue(lexeme, constant);
        lexemes.next();
        const open = routine.language === "BASIC" ? "(" : "[";
        const close = routine.language === "BASIC" ? ")" : "]";
        if (lexemes.get() && lexemes.get()?.content === open) {
          if (constant.type === "string") {
            lexemes.next();
            let exp = parseExpression(lexemes, routine);
            exp = typeCheck(routine.language, exp, "integer");
            constantValue.indexes.push(exp);
            if (!lexemes.get() || lexemes.get()?.content !== close) {
              throw new CompilerError(
                `Closing bracket "${close}" missing after string variable index.`,
                exp.lexeme,
              );
            }
            lexemes.next();
          } else {
            throw new CompilerError("{lex} is not a string constant.", lexeme);
          }
        }
        return constantValue;
      }

      const variable = find.variable(routine, lexeme.value);
      if (variable) {
        const variableValue = makeVariableValue(lexeme, variable);
        lexemes.next();
        const open = routine.language === "BASIC" ? "(" : "[";
        const close = routine.language === "BASIC" ? ")" : "]";
        if (lexemes.get() && lexemes.get()?.content === open) {
          if (isArray(variable)) {
            lexemes.next();
            while (lexemes.get() && lexemes.get()?.content !== close) {
              let exp = parseExpression(lexemes, routine);
              exp = typeCheck(routine.language, exp, "integer");
              variableValue.indexes.push(exp);
              if (
                routine.language === "BASIC" ||
                routine.language === "Pascal"
              ) {
                if (lexemes.get()?.content === ",") {
                  lexemes.next();
                  if (lexemes.get()?.content === close) {
                    throw new CompilerError(
                      "Trailing comma at the end of array indexes.",
                      lexemes.get(-1),
                    );
                  }
                }
              } else {
                if (
                  lexemes.get()?.content === close &&
                  lexemes.get(1)?.content === open
                ) {
                  lexemes.next();
                  lexemes.next();
                }
              }
            }
            if (!lexemes.get()) {
              throw new CompilerError(
                `Closing bracket "${close}" needed after array indexes.`,
                lexemes.get(-1),
              );
            }
            lexemes.next();
          } else if (variable.type === "string") {
            lexemes.next();
            const subscript = parseStringSubscript(
              lexemes,
              routine,
              close,
              lexeme,
            );
            if (subscript.slice !== null) {
              variableValue.slice = subscript.slice;
            } else {
              variableValue.indexes.push(subscript.index as Expression);
            }
          } else if (variable.isList) {
            // two levels only, matching Variable.isListOfLists's own scope
            lexemes.next();
            exp = parseExpression(lexemes, routine);
            exp = typeCheck(routine.language, exp, "integer");
            variableValue.indexes.push(exp);
            if (!lexemes.get() || lexemes.get()?.content !== close) {
              throw new CompilerError(
                `Closing bracket "${close}" missing after list variable index.`,
                exp.lexeme,
              );
            }
            lexemes.next();
            if (variable.isListOfLists && lexemes.get()?.content === open) {
              lexemes.next();
              let exp2 = parseExpression(lexemes, routine);
              exp2 = typeCheck(routine.language, exp2, "integer");
              variableValue.indexes.push(exp2);
              if (!lexemes.get() || lexemes.get()?.content !== close) {
                throw new CompilerError(
                  `Closing bracket "${close}" missing after list variable index.`,
                  exp2.lexeme,
                );
              }
              lexemes.next();
            }
            // once the list indexes are exhausted, a further "[...]" indexes
            // into the *element*. getType() reports the element's own kind
            // only because every list level has been consumed; while any
            // remain it reports "boolint", so a sublist can't be read as a
            // string.
            if (lexemes.get()?.content === open) {
              if (getType(variableValue) !== "string") {
                throw new CompilerError(
                  "{lex} is not a list of strings, so its elements cannot be indexed or sliced.",
                  lexeme,
                );
              }
              lexemes.next();
              const subscript = parseStringSubscript(
                lexemes,
                routine,
                close,
                lexeme,
              );
              variableValue.slice = subscript.slice;
              variableValue.stringIndex = subscript.index;
            }
          } else {
            throw new CompilerError(
              "{lex} is not a string or array variable.",
              lexeme,
            );
          }
        }
        if (isArray(variable)) {
          const allowedIndexes =
            variable.type === "string"
              ? variable.arrayDimensions.length + 1 // one more for characters within strings
              : variable.arrayDimensions.length;
          if (variableValue.indexes.length > allowedIndexes) {
            throw new CompilerError(
              "Too many indexes for array variable {lex}.",
              lexeme,
            );
          }
        }
        if (lexemes.get()?.content === ".") {
          lexemes.next();
          const methodLexeme = lexemes.get();
          if (methodLexeme?.type !== "identifier") {
            throw new CompilerError(
              "Method name missing after '.'.",
              lexemes.get(),
            );
          }
          const method = find.nativeCommand(
            routine,
            `.${methodLexeme.value}`,
            variable.isList,
          );
          if (!method) {
            throw new CompilerError(
              `Method "${methodLexeme.value}" is not defined.`,
              methodLexeme,
            );
          }
          lexemes.next();
          return parseMethodFunctionCall(
            methodLexeme,
            lexemes,
            routine,
            method,
            variableValue,
          );
        }
        return variableValue;
      }

      const colour = find.colour(routine, lexeme.value);
      if (colour) {
        lexemes.next();
        return makeColourValue(lexeme, colour);
      }

      const command = find.command(routine, lexeme.value);
      if (command) {
        lexemes.next();
        return parseFunctionCall(lexeme, lexemes, routine, command);
      }

      if (routine.language === "Python") {
        const variable = makeVariable(lexeme.content, routine);
        routine.variables.push(variable);
        return parseFactor(lexemes, routine);
      } else {
        throw new CompilerError("{lex} is not defined.", lexeme);
      }
    }

    default: {
      if (
        (routine.language === "C" || routine.language === "Java") &&
        lexemes.get()?.content === "(" &&
        lexemes.get(1)?.type === "type"
      ) {
        lexemes.next();
        const typeLexeme = lexemes.get() as TypeLexeme;
        const type = typeLexeme.subtype;
        if (type === null) {
          throw new CompilerError(
            "Expression cannot be cast as void.",
            typeLexeme,
          );
        }
        lexemes.next();
        if (lexemes.get()?.content !== ")") {
          throw new CompilerError(
            'Type in type cast expression must be followed by a closing bracket ")".',
            typeLexeme,
          );
        }
        lexemes.next();
        exp = parseExpression(lexemes, routine);
        const expType = getType(exp);
        if (type !== expType) {
          if (type === "boolean" && expType === "character") {
            throw new CompilerError(
              "Characters cannot be cast as booleans.",
              typeLexeme,
            );
          }
          if (type === "boolean" && expType === "string") {
            throw new CompilerError(
              "Strings cannot be cast as booleans.",
              typeLexeme,
            );
          }
          if (type === "string" && expType === "boolean") {
            throw new CompilerError(
              "Booleans cannot be cast as strings.",
              typeLexeme,
            );
          }
          if (type === "character" && expType === "boolean") {
            throw new CompilerError(
              "Booleans cannot be cast as characters.",
              typeLexeme,
            );
          }
          if (type === "character" && expType === "string") {
            throw new CompilerError(
              "Strings cannot be cast as characters.",
              typeLexeme,
            );
          }
          exp = makeCastExpression(typeLexeme, type, exp);
        }
        return exp;
      } else if (
        routine.language === "Python" &&
        lexemes.get()?.content === "["
      ) {
        const openLexeme = lexemes.get() as Lexeme;
        lexemes.next();
        const elements: Expression[] = [];
        while (lexemes.get() && lexemes.get()?.content !== "]") {
          let element = parseExpression(lexemes, routine);
          if (elements.length > 0) {
            if (isListExpression(elements[0])) {
              // checked directly: typeCheck's scalar ladder doesn't apply to
              // list-vs-list comparisons
              if (!isListExpression(element)) {
                throw new CompilerError(
                  "Type error: a list was expected.",
                  element.lexeme,
                );
              }
              const firstKind = getListElementKind(elements[0]);
              const thisKind = getListElementKind(element);
              if (
                firstKind !== undefined &&
                thisKind !== undefined &&
                firstKind !== thisKind
              ) {
                throw new CompilerError(
                  `Type error: a list of '${firstKind}' was expected but a list of '${thisKind}' was found.`,
                  element.lexeme,
                );
              }
            } else {
              element = typeCheck(
                routine.language,
                element,
                getType(elements[0]),
              );
            }
          }
          elements.push(element);
          if (lexemes.get()?.content === ",") {
            lexemes.next();
            if (lexemes.get()?.content === "]") {
              throw new CompilerError(
                "Trailing comma at the end of list elements.",
                lexemes.get(-1),
              );
            }
          } else if (lexemes.get()?.content !== "]") {
            throw new CompilerError(
              'Closing bracket "]" needed after list elements.',
              lexemes.get(-1),
            );
          }
        }
        if (!lexemes.get()) {
          throw new CompilerError(
            'Closing bracket "]" needed after list elements.',
            lexemes.get(-1),
          );
        }
        lexemes.next();
        const isListOfLists =
          elements.length > 0 && isListExpression(elements[0]);
        const listElementKind = isListOfLists
          ? "integer" // opaque sublist pointers, regardless of the sublists' own element kind
          : elements.length > 0
            ? getType(elements[0]) === "string"
              ? "string"
              : "integer"
            : undefined;
        const innerListElementKind = isListOfLists
          ? getListElementKind(elements[0])
          : undefined;
        return makeListLiteral(
          openLexeme,
          elements,
          listElementKind,
          isListOfLists,
          innerListElementKind,
        );
      } // bracketed expression
      else if (lexemes.get()?.content === "(") {
        lexemes.next();
        exp = parseExpression(lexemes, routine);

        if (lexemes.get() && lexemes.get()?.content === ")") {
          lexemes.next();
          return exp;
        } else {
          throw new CompilerError(
            "Closing bracket missing after expression.",
            exp.lexeme,
          );
        }
      } // anything else is an error
      else {
        throw new CompilerError("Expression cannot begin with {lex}.", lexeme);
      }
    }
  }
};

/**
 * Python only: `.method(...)` calls applied to whatever a factor turned out to
 * be - a string literal, a bracketed expression, a call result, or another
 * method call. Loops, so chains of any length work. A plain-variable receiver
 * is handled inline by parseFactor and never reaches here.
 *
 * Python only because a "." there can only introduce a method call: there are
 * no floats, modules or attributes in this language.
 *
 * String receivers only because a list method needs its receiver's heap
 * address, which only a list *variable* has: "[1,2,3].index(2)" would read
 * whatever happened to be on the stack. Supporting it means materialising a
 * temporary list.
 */
const parseFactorWithMethods = (
  lexemes: Lexemes,
  routine: Routine,
): Expression => {
  let exp = parseFactor(lexemes, routine);

  while (
    routine.language === "Python" &&
    lexemes.get()?.content === "." &&
    lexemes.get(1)?.type === "identifier" &&
    // every other receiver type is let in so parseMethodFunctionCall's own type
    // check can give "not defined for type X" rather than a syntax error
    !isListExpression(exp)
  ) {
    lexemes.next(); // move past "."
    const methodLexeme = lexemes.get() as IdentifierLexeme;
    const method = find.nativeCommand(routine, `.${methodLexeme.value}`, false);
    if (!method) {
      throw new CompilerError(
        `Method "${methodLexeme.value}" is not defined.`,
        methodLexeme,
      );
    }
    lexemes.next(); // move past the method name
    exp = parseMethodFunctionCall(methodLexeme, lexemes, routine, method, exp);
  }

  return exp;
};

export default parseFactorWithMethods;
