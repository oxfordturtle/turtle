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
  if (lexemes.peek()?.content === ":") {
    throw new CompilerError(
      'Slices with a step ("s[a:b:c]") are not supported.',
      lexemes.peek(),
    );
  }
  if (lexemes.atEnd()) {
    throw new CompilerError(
      `Closing bracket "${close}" missing after string variable index.`,
      fallbackLexeme,
    );
  }
  if (lexemes.peek()?.content === close) {
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
  if (routine.language === "Python" && lexemes.peek()?.content === ":") {
    lexemes.advance();
    slice = [null, parseSliceBound(lexemes, routine, close, fallbackLexeme)];
  } else {
    const exp = typeCheck(
      routine.language,
      parseExpression(lexemes, routine),
      "integer",
    );
    if (routine.language === "Python" && lexemes.peek()?.content === ":") {
      lexemes.advance();
      slice = [exp, parseSliceBound(lexemes, routine, close, fallbackLexeme)];
    } else {
      index = exp;
    }
  }

  if (lexemes.peek()?.content !== close) {
    // a step slice, worth naming rather than reporting as a missing bracket
    if (slice !== null && lexemes.peek()?.content === ":") {
      throw new CompilerError(
        'Slices with a step ("s[a:b:c]") are not supported.',
        lexemes.peek(),
      );
    }
    // the previous lexeme rather than the bound's own: with the start omitted
    // there may not be one
    throw new CompilerError(
      `Closing bracket "${close}" missing after string variable index.`,
      lexemes.peek(-1),
    );
  }
  lexemes.advance();

  return { index, slice };
};

const parseFactor = (lexemes: Lexemes, routine: Routine): Expression => {
  // an expression can legitimately end a program (a BASIC function's closing
  // "=<expression>" line), so the lexemes really can run out here; without
  // this the cast below turns that into a raw TypeError
  if (lexemes.atEnd()) {
    throw new CompilerError("Expression expected.", lexemes.peek(-1));
  }
  const lexeme = lexemes.peek() as Lexeme;
  let exp: Expression;

  switch (lexeme.type) {
    case "operator":
      switch (lexeme.subtype) {
        case "subt":
          lexemes.advance();
          exp = parseFactor(lexemes, routine);
          exp = typeCheck(routine.language, exp, "integer");
          return makeCompoundExpression(lexeme, null, exp, "neg");

        case "not":
          lexemes.advance();
          exp = parseFactor(lexemes, routine);
          exp = typeCheck(routine.language, exp, "boolint");
          return makeCompoundExpression(lexeme, null, exp, "not");

        case "and": {
          if (routine.language !== "C") {
            throw new CompilerError(
              "Expression cannot begin with {lex}.",
              lexemes.peek(),
            );
          }
          lexemes.advance();
          exp = parseFactor(lexemes, routine);
          if (exp.kind !== "variable") {
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
      lexemes.advance();
      return lexeme.subtype === "string"
        ? makeStringValue(lexeme)
        : makeIntegerValue(lexeme);

    case "input": {
      const input = find.input(routine, lexeme.value);
      if (input) {
        lexemes.advance();
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
        lexemes.advance();
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
        lexemes.advance();
        const open = routine.language === "BASIC" ? "(" : "[";
        const close = routine.language === "BASIC" ? ")" : "]";
        if (lexemes.peek()?.content === open) {
          if (constant.type === "string") {
            lexemes.advance();
            let exp = parseExpression(lexemes, routine);
            exp = typeCheck(routine.language, exp, "integer");
            constantValue.indexes.push(exp);
            lexemes.expect(
              close,
              `Closing bracket "${close}" missing after string variable index.`,
              exp.lexeme,
            );
          } else {
            throw new CompilerError("{lex} is not a string constant.", lexeme);
          }
        }
        return constantValue;
      }

      const variable = find.variable(routine, lexeme.value);
      if (variable) {
        const variableValue = makeVariableValue(lexeme, variable);
        lexemes.advance();
        const open = routine.language === "BASIC" ? "(" : "[";
        const close = routine.language === "BASIC" ? ")" : "]";
        if (lexemes.peek()?.content === open) {
          if (isArray(variable)) {
            lexemes.advance();
            while (!lexemes.atEnd() && lexemes.peek()?.content !== close) {
              let exp = parseExpression(lexemes, routine);
              exp = typeCheck(routine.language, exp, "integer");
              variableValue.indexes.push(exp);
              if (
                routine.language === "BASIC" ||
                routine.language === "Pascal"
              ) {
                if (lexemes.match(",")) {
                  if (lexemes.peek()?.content === close) {
                    throw new CompilerError(
                      "Trailing comma at the end of array indexes.",
                      lexemes.peek(-1),
                    );
                  }
                }
              } else {
                if (
                  lexemes.peek()?.content === close &&
                  lexemes.peek(1)?.content === open
                ) {
                  lexemes.advance();
                  lexemes.advance();
                }
              }
            }
            if (lexemes.atEnd()) {
              throw new CompilerError(
                `Closing bracket "${close}" needed after array indexes.`,
                lexemes.peek(-1),
              );
            }
            lexemes.advance();
          } else if (variable.type === "string") {
            lexemes.advance();
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
            lexemes.advance();
            exp = parseExpression(lexemes, routine);
            exp = typeCheck(routine.language, exp, "integer");
            variableValue.indexes.push(exp);
            lexemes.expect(
              close,
              `Closing bracket "${close}" missing after list variable index.`,
              exp.lexeme,
            );
            if (variable.isListOfLists && lexemes.peek()?.content === open) {
              lexemes.advance();
              let exp2 = parseExpression(lexemes, routine);
              exp2 = typeCheck(routine.language, exp2, "integer");
              variableValue.indexes.push(exp2);
              lexemes.expect(
                close,
                `Closing bracket "${close}" missing after list variable index.`,
                exp2.lexeme,
              );
            }
            // once the list indexes are exhausted, a further "[...]" indexes
            // into the *element*. getType() reports the element's own kind
            // only because every list level has been consumed; while any
            // remain it reports "boolint", so a sublist can't be read as a
            // string.
            if (lexemes.peek()?.content === open) {
              if (getType(variableValue) !== "string") {
                throw new CompilerError(
                  "{lex} is not a list of strings, so its elements cannot be indexed or sliced.",
                  lexeme,
                );
              }
              lexemes.advance();
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
        if (lexemes.match(".")) {
          const methodLexeme = lexemes.peek();
          if (methodLexeme?.type !== "identifier") {
            throw new CompilerError(
              "Method name missing after '.'.",
              lexemes.peek(),
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
          lexemes.advance();
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
        lexemes.advance();
        return makeColourValue(lexeme, colour);
      }

      const command = find.command(routine, lexeme.value);
      if (command) {
        lexemes.advance();
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
        lexemes.peek()?.content === "(" &&
        lexemes.peek(1)?.type === "type"
      ) {
        lexemes.advance();
        const typeLexeme = lexemes.peek() as TypeLexeme;
        const type = typeLexeme.subtype;
        if (type === null) {
          throw new CompilerError(
            "Expression cannot be cast as void.",
            typeLexeme,
          );
        }
        lexemes.advance();
        lexemes.expect(
          ")",
          'Type in type cast expression must be followed by a closing bracket ")".',
          typeLexeme,
        );
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
        lexemes.peek()?.content === "["
      ) {
        const openLexeme = lexemes.peek() as Lexeme;
        lexemes.advance();
        const elements: Expression[] = [];
        while (!lexemes.atEnd() && lexemes.peek()?.content !== "]") {
          let element = parseExpression(lexemes, routine);
          const first = elements[0];
          if (first !== undefined) {
            if (isListExpression(first)) {
              // checked directly: typeCheck's scalar ladder doesn't apply to
              // list-vs-list comparisons
              if (!isListExpression(element)) {
                throw new CompilerError(
                  "Type error: a list was expected.",
                  element.lexeme,
                );
              }
              const firstKind = getListElementKind(first);
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
              element = typeCheck(routine.language, element, getType(first));
            }
          }
          elements.push(element);
          if (lexemes.match(",")) {
            if (lexemes.peek()?.content === "]") {
              throw new CompilerError(
                "Trailing comma at the end of list elements.",
                lexemes.peek(-1),
              );
            }
          } else if (lexemes.peek()?.content !== "]") {
            throw new CompilerError(
              'Closing bracket "]" needed after list elements.',
              lexemes.peek(-1),
            );
          }
        }
        lexemes.expectAfter(
          "]",
          'Closing bracket "]" needed after list elements.',
        );
        const firstElement = elements[0];
        const isListOfLists =
          firstElement !== undefined && isListExpression(firstElement);
        const listElementKind = isListOfLists
          ? "integer" // opaque sublist pointers, regardless of the sublists' own element kind
          : firstElement !== undefined
            ? getType(firstElement) === "string"
              ? "string"
              : "integer"
            : undefined;
        const innerListElementKind = isListOfLists
          ? getListElementKind(firstElement)
          : undefined;
        return makeListLiteral(
          openLexeme,
          elements,
          listElementKind,
          isListOfLists,
          innerListElementKind,
        );
      } // bracketed expression
      else if (lexemes.match("(")) {
        exp = parseExpression(lexemes, routine);

        if (lexemes.peek()?.content === ")") {
          lexemes.advance();
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
    lexemes.peek()?.content === "." &&
    lexemes.peek(1)?.type === "identifier" &&
    // every other receiver type is let in so parseMethodFunctionCall's own type
    // check can give "not defined for type X" rather than a syntax error
    !isListExpression(exp)
  ) {
    lexemes.advance(); // move past "."
    const methodLexeme = lexemes.peek() as IdentifierLexeme;
    const method = find.nativeCommand(routine, `.${methodLexeme.value}`, false);
    if (!method) {
      throw new CompilerError(
        `Method "${methodLexeme.value}" is not defined.`,
        methodLexeme,
      );
    }
    lexemes.advance(); // move past the method name
    exp = parseMethodFunctionCall(methodLexeme, lexemes, routine, method, exp);
  }

  return exp;
};

export default parseFactorWithMethods;
