import { PCode } from "@/core/constants.ts";
import makeVariableValue from "../../parser/definitions/expressions/variableValue.ts";
import type { Program } from "../../parser/definitions/routines/program.ts";
import type { Subroutine } from "../../parser/definitions/routines/subroutine.ts";
import type { VariableAssignment } from "../../parser/definitions/statements/variableAssignment.ts";
import { isArray } from "../../parser/definitions/variable.ts";
import {
  subroutineAddress,
  turtleAddress,
  variableAddress,
} from "../addresses.ts";
import expression from "../expression.ts";
import { isScalarStringVariableRead } from "../lists.ts";
import merge from "../merge.ts";
import type { Options } from "../options.ts";

/**
 * True for "x[i]='foo'"-style writes of a scalar string into a string-kind list,
 * which need an HFIX right after the write - see listLiteral.ts. Writing a whole
 * sublist pointer ("wins[i]=somesublist") is not one: that isn't a string
 * pointer.
 */
const writesStringListElement = (stmt: VariableAssignment): boolean => {
  if (!stmt.variable.isList || stmt.indexes.length === 0) {
    return false;
  }
  return stmt.variable.isListOfLists
    ? stmt.indexes.length === 2 &&
        stmt.variable.innerListElementKind === "string"
    : stmt.variable.listElementKind === "string";
};

/**
 * "x[i] += y" on a list element, which the parser deliberately leaves
 * un-desugared (see parser/definitions/statements/variableAssignment.ts): the
 * index has to be evaluated once, so the element's address is computed once and
 * kept on the stack across the read. DUPL makes the copy that LPTR consumes,
 * and SWAP puts the result under the surviving address, which is the order SPTR
 * wants.
 *
 * No HSTR case, unlike the plain writes below: a "+=" on a string element ends
 * in SCAT, whose result is a fresh heap block rather than some string
 * variable's own buffer that a later assignment could overwrite in place.
 */
const augmentedElementAssignment = (
  stmt: VariableAssignment,
  operator: NonNullable<VariableAssignment["operator"]>,
  program: Program,
  options: Options,
): number[][] => {
  const exp = makeVariableValue(stmt.lexeme, stmt.variable);
  exp.indexes.push(...stmt.indexes);
  const pcode = expression(exp, program, options);
  pcode[pcode.length - 1]!.pop(); // drop the trailing LPTR: the address is wanted first
  merge(pcode, [[PCode.dupl, PCode.lptr]]); // address, current value
  merge(pcode, expression(stmt.value, program, options)); // address, current value, y
  merge(pcode, [[PCode[operator]]]); // address, new value
  merge(pcode, [[PCode.swap, PCode.sptr]]);

  if (writesStringListElement(stmt)) {
    merge(pcode, [[PCode.hfix]]);
  }

  return pcode;
};

export default (
  stmt: VariableAssignment,
  program: Program,
  _startLine: number,
  options: Options,
): number[][] => {
  if (stmt.operator !== null) {
    return augmentedElementAssignment(stmt, stmt.operator, program, options);
  }

  if (stmt.variable.turtle) {
    return turtleVariableAssignment(stmt, program, options);
  }

  if (stmt.variable.isGlobal) {
    return globalVariableAssignment(stmt, program, options);
  }

  if (stmt.variable.isPointer) {
    return pointerVariableAssignment(stmt, program, options);
  }

  if (
    stmt.variable.isReferenceParameter &&
    !isArray(stmt.variable) &&
    stmt.variable.type !== "string"
  ) {
    return referenceVariableAssignment(stmt, program, options);
  }

  return localVariableAssignment(stmt, program, options);
};

const turtleVariableAssignment = (
  stmt: VariableAssignment,
  program: Program,
  options: Options,
): number[][] => {
  const pcode = expression(stmt.value, program, options);

  // TODO: after NEWTURTLE??
  merge(pcode, [
    [PCode.stvg, turtleAddress(program) + (stmt.variable.turtle as number)],
  ]);

  return pcode;
};

const globalVariableAssignment = (
  stmt: VariableAssignment,
  program: Program,
  options: Options,
): number[][] => {
  const pcode = expression(stmt.value, program, options);

  // cloned onto a fresh heap block before its pointer goes into the list slot -
  // see lists.ts's isScalarStringVariableRead
  if (writesStringListElement(stmt) && isScalarStringVariableRead(stmt.value)) {
    merge(pcode, [[PCode.hstr]]);
  }

  // the write encoding is the read encoding with its trailing LPTR swapped for
  // SPTR
  if (
    isArray(stmt.variable) ||
    (stmt.variable.type === "string" && stmt.indexes.length > 0) ||
    (stmt.variable.isList && stmt.indexes.length > 0)
  ) {
    const exp = makeVariableValue(stmt.lexeme, stmt.variable);
    exp.indexes.push(...stmt.indexes);
    const element = expression(exp, program, options);
    const lastLine = element[element.length - 1]!; // expression() never returns no lines
    if (isArray(stmt.variable) && stmt.variable.type === "string") {
      lastLine.push(PCode.cstr);
    } else {
      lastLine[lastLine.length - 1] = PCode.sptr; // change LPTR to SPTR
    }
    merge(pcode, element);
    if (writesStringListElement(stmt)) {
      merge(pcode, [[PCode.hfix]]);
    }
  } // global string
  else if (stmt.variable.type === "string") {
    merge(pcode, [[PCode.ldvg, variableAddress(stmt.variable), PCode.cstr]]);
  } // global boolean/character/integer
  else {
    merge(pcode, [[PCode.stvg, variableAddress(stmt.variable)]]);
  }

  return pcode;
};

const pointerVariableAssignment = (
  stmt: VariableAssignment,
  program: Program,
  options: Options,
): number[][] => {
  const variableValue = makeVariableValue(stmt.lexeme, stmt.variable);
  const pcode = expression(variableValue, program, options);
  pcode[pcode.length - 1]!.pop(); // pop off PCode.peek

  merge(pcode, expression(stmt.value, program, options));

  if (stmt.variable.type === "string") {
    merge(pcode, [[PCode.cstr]]);
  } else {
    merge(pcode, [[PCode.poke]]);
  }

  return pcode;
};

const referenceVariableAssignment = (
  stmt: VariableAssignment,
  program: Program,
  options: Options,
): number[][] => {
  const pcode = expression(stmt.value, program, options);

  merge(pcode, [
    [
      PCode.stvr,
      subroutineAddress(stmt.variable.routine as Subroutine),
      variableAddress(stmt.variable),
    ],
  ]);

  return pcode;
};

const localVariableAssignment = (
  stmt: VariableAssignment,
  program: Program,
  options: Options,
): number[][] => {
  const pcode = expression(stmt.value, program, options);

  // see the matching comment in globalVariableAssignment above
  if (writesStringListElement(stmt) && isScalarStringVariableRead(stmt.value)) {
    merge(pcode, [[PCode.hstr]]);
  }

  if (
    isArray(stmt.variable) ||
    (stmt.variable.type === "string" && stmt.indexes.length > 0) ||
    (stmt.variable.isList && stmt.indexes.length > 0)
  ) {
    const exp = makeVariableValue(stmt.lexeme, stmt.variable);
    exp.indexes.push(...stmt.indexes);
    const element = expression(exp, program, options);
    const lastLine = element[element.length - 1]!; // expression() never returns no lines
    if (isArray(stmt.variable) && stmt.variable.type === "string") {
      lastLine.push(PCode.cstr);
    } else {
      lastLine[lastLine.length - 1] = PCode.sptr; // change LPTR to SPTR
    }
    merge(pcode, element);
    if (writesStringListElement(stmt)) {
      merge(pcode, [[PCode.hfix]]);
    }
  } // local string
  else if (stmt.variable.type === "string") {
    merge(pcode, [
      [
        PCode.ldvv,
        subroutineAddress(stmt.variable.routine as Subroutine),
        variableAddress(stmt.variable),
        PCode.cstr,
      ],
    ]);
  } // local boolean/character/integer
  else {
    merge(pcode, [
      [
        PCode.stvv,
        subroutineAddress(stmt.variable.routine as Subroutine),
        variableAddress(stmt.variable),
      ],
    ]);
  }

  return pcode;
};
