import type { Lexeme, OperatorLexeme } from "../../lexer/lexeme.ts";
import type { Operator } from "../../lexer/types.ts";
import { CompilerError } from "../../tools/error.ts";
import {
  type Expression,
  getListElementKind,
  getType,
  isListExpression,
} from "../definitions/expression.ts";
import makeCompoundExpression from "../definitions/expressions/compoundExpression.ts";
import { type Lexemes } from "../definitions/lexemes.ts";
import {
  comparisonLevel,
  operator,
  precedence,
  stringOperator,
} from "../definitions/operators.ts";
import type { Routine } from "../definitions/routine.ts";
import parseFactor from "./factor.ts";
import typeCheck from "./typeCheck.ts";

/**
 * Consumes the start of a Python membership test and returns a synthetic
 * operator lexeme carrying the "in" keyword's own position; null, having
 * consumed nothing, when this isn't one.
 *
 * "not in" is matched here as a single two-lexeme operator rather than left to
 * the generic unary "not", which would parse "not (x in y)" but not "x not in
 * y" at all.
 */
const parseMembershipOperator = (
  lexemes: Lexemes,
  routine: Routine,
): { lexeme: OperatorLexeme; negated: boolean } | null => {
  if (routine.language !== "Python") {
    return null;
  }
  const first = lexemes.peek();
  if (!first) {
    return null;
  }
  const isIn = (lexeme: Lexeme | undefined): boolean =>
    lexeme?.type === "keyword" && lexeme.content === "in";
  const negated =
    first.type === "operator" &&
    first.subtype === "not" &&
    isIn(lexemes.peek(1));
  if (!negated && !isIn(first)) {
    return null;
  }
  if (negated) {
    lexemes.advance(); // move past "not"
  }
  const inLexeme = lexemes.peek() as Lexeme;
  lexemes.advance(); // move past "in"
  return {
    // the subtype is provisional - which of the four membership operators
    // this really is depends on the right operand, resolved by the caller
    lexeme: { ...inLexeme, type: "operator", subtype: "lin" },
    negated,
  };
};

/**
 * Picks the operator that matches what the right operand turned out to be: a
 * list (LIDX scan) or a string (POSS substring search). There are no dicts or
 * sets in this language, so that is the whole membership protocol.
 */
const makeMembershipExpression = (
  routine: Routine,
  lexeme: OperatorLexeme,
  left: Expression,
  right: Expression,
  negated: boolean,
): Expression => {
  if (isListExpression(right)) {
    // a list of lists reports its elements as "integer", since sublists are
    // opaque pointers, so "x in wins" would scan heap addresses. Rejected
    // rather than silently answering nonsense; "x in wins[i]" still works.
    const rightIsListOfLists =
      right.kind === "listLiteral"
        ? right.isListOfLists
        : right.kind === "variable" &&
          right.variable.isListOfLists &&
          right.indexes.length === 0;
    if (rightIsListOfLists) {
      throw new CompilerError('"in" cannot search a list of lists.', lexeme);
    }
    const elementKind = getListElementKind(right);
    if (elementKind === undefined) {
      // "x in []" has no element kind to infer, and nothing is in it anyway
      throw new CompilerError(
        'The list on the right of "in" is empty, so nothing can be in it.',
        lexeme,
      );
    }
    return makeCompoundExpression(
      lexeme,
      typeCheck(routine.language, left, elementKind),
      right,
      negated ? "lnin" : "lin",
      undefined, // the result is a boolean, not a list - see listElementKind's own comment
      elementKind,
    );
  }
  if (getType(right) === "string" || getType(right) === "character") {
    return makeCompoundExpression(
      lexeme,
      typeCheck(routine.language, left, "string"),
      typeCheck(routine.language, right, "string"),
      negated ? "snin" : "sin",
    );
  }
  throw new CompilerError(
    '"in" must be followed by a list or a string.',
    lexeme,
  );
};

const parseExpression = (
  lexemes: Lexemes,
  routine: Routine,
  level = 0,
): Expression => {
  const levels = precedence[routine.language];

  // the bottom of the ladder, where the tightest-binding prefixes live
  if (level >= levels.length) {
    return parseFactor(lexemes, routine);
  }
  const thisLevel = levels[level]!; // in range, by the check just above

  // recursing at the *same* level rather than the next is what makes "not not
  // x" parse
  if (thisLevel.unary) {
    const lexeme = lexemes.peek();
    const op = lexeme && operator(lexeme, thisLevel);
    if (!op) {
      return parseExpression(lexemes, routine, level + 1);
    }
    lexemes.advance();
    const operand = typeCheck(
      routine.language,
      parseExpression(lexemes, routine, level),
      "boolint",
    );
    return makeCompoundExpression(lexeme as OperatorLexeme, null, operand, op);
  }

  let exp = parseExpression(lexemes, routine, level + 1);

  // Membership binds like a comparison, so it belongs on this rung, but it
  // can't join the `precedence` table: that matches on lexeme subtype, and
  // "in" is a keyword lexeme - left that way so "for x in range(...)"'s own
  // parser still matches the keyword directly.
  while (level === comparisonLevel(routine.language)) {
    const membership = parseMembershipOperator(lexemes, routine);
    if (!membership) {
      break;
    }
    exp = makeMembershipExpression(
      routine,
      membership.lexeme,
      exp,
      parseExpression(lexemes, routine, level + 1),
      membership.negated,
    );
  }

  while (!lexemes.atEnd() && operator(lexemes.peek() as Lexeme, thisLevel)) {
    const lexeme = lexemes.peek() as OperatorLexeme;
    let op = operator(lexeme, thisLevel) as Operator;

    lexemes.advance();

    let nextExp = parseExpression(lexemes, routine, level + 1);

    // Python list multiplication, rerouted to LMUL. Real Python also allows
    // the reversed order ("n*[x]"); no example program needs it.
    if (op === "mult" && isListExpression(exp)) {
      nextExp = typeCheck(routine.language, nextExp, "integer");
      exp = makeCompoundExpression(
        lexeme,
        exp,
        nextExp,
        "lmul",
        getListElementKind(exp),
      );
      continue;
    }

    // Python string repetition, rerouted to SMUL; both operand orders, unlike
    // list multiplication. Both special cases run before the type check below,
    // which would otherwise reject the string/integer mismatch.
    if (routine.language === "Python" && op === "mult") {
      const expType = getType(exp);
      const nextExpType = getType(nextExp);
      const isStringy = (t: typeof expType) =>
        t === "string" || t === "character";
      if (isStringy(expType) && nextExpType === "integer") {
        exp = typeCheck(routine.language, exp, "string");
        nextExp = typeCheck(routine.language, nextExp, "integer");
        exp = makeCompoundExpression(lexeme, exp, nextExp, "smul");
        continue;
      }
      if (expType === "integer" && isStringy(nextExpType)) {
        const stringExp = typeCheck(routine.language, nextExp, "string");
        const intExp = typeCheck(routine.language, exp, "integer");
        exp = makeCompoundExpression(lexeme, stringExp, intExp, "smul");
        continue;
      }
    }

    // both ways round, so a character on either side of a string is converted
    exp = typeCheck(routine.language, exp, getType(nextExp));
    nextExp = typeCheck(routine.language, nextExp, getType(exp));

    if (getType(exp) === "string" || getType(nextExp) === "string") {
      op = stringOperator(op);
    }
    if (getType(exp) === "character" || getType(nextExp) === "character") {
      // TODO: reconsider this, as this behaviour is not ideal
      // whether to use the string operator should be determined by the context
      // i.e. if we're expecting a string, use the string equivalent ??
      if (op === "plus") {
        op = stringOperator(op);
      }
    }

    exp = makeCompoundExpression(lexeme, exp, nextExp, op);
  }

  return exp;
};

export default parseExpression;
