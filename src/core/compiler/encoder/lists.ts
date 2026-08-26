import { type Command, PCode } from "@/core/constants.ts";
import {
  type Expression,
  isListExpression,
} from "../parser/definitions/expression.ts";
import makeVariableValue, {
  type VariableValue,
} from "../parser/definitions/expressions/variableValue.ts";
import type { Program } from "../parser/definitions/routines/program.ts";
import type { Subroutine } from "../parser/definitions/routines/subroutine.ts";
import type { Variable } from "../parser/definitions/variable.ts";
import { subroutineAddress, variableAddress } from "./addresses.ts";
import expression from "./expression.ts";
import merge from "./merge.ts";
import type { Options } from "./options.ts";

// encodeLp/encodeSize are the inverse of the machine's decodeLp/decodeSize
// (src/core/machine/runtime.ts).

/** element kind (4=integer, 5=string) plus 16 per extra dimension */
export const encodeLp = (
  elementKind: "integer" | "string",
  dimensions = 1,
): number => (elementKind === "string" ? 5 : 4) + 16 * (dimensions - 1);

/**
 * True for a plain scalar string *variable* read ("c"), and nothing else.
 *
 * The one string expression whose heap pointer can have its *content* change
 * later: reassigning a string variable CSTRs the new value into the variable's
 * own permanent buffer in place rather than rebinding the pointer. So the three
 * sites below that capture a string into list-managed storage must clone this
 * shape (HSTR) and only this shape - every other string expression is either
 * permanently fixed once written or a fresh block nothing revisits, and cloning
 * those as well grows the permanent heap until it is exhausted.
 */
export const isScalarStringVariableRead = (exp: Expression): boolean =>
  exp.expressionType === "variable" &&
  exp.variable.type === "string" &&
  !exp.variable.isList &&
  exp.indexes.length === 0 &&
  exp.slice === null;

/** dim1 (bits 0-10), dim2 (11-20), dim3 (21-26), dim4 (27-31, max string length per element - unenforced, always 0 here) */
export const encodeSize = (
  dim1: number,
  dim2 = 0,
  dim3 = 0,
  dim4 = 0,
): number => dim1 + dim2 * 0x800 + dim3 * 0x200000 + dim4 * 0x8000000;

/** initial capacity for a hint-less "x=[]", which has no elements to size itself from; the growth guard below regrows it on overflow */
export const DEFAULT_LIST_CAPACITY = 8;

/**
 * The capacity a guarded regrow, or ".copy()", allocates.
 *
 * A single fixed target rather than a doubling of the current capacity, because
 * LIHP's size is a compile-time inline operand: there is no "allocate N cells,
 * where N is a stack value" primitive, so the compiler cannot express "twice
 * whatever this list is now". Growth is therefore one step, and
 * listCapacityExceededError remains the backstop beyond it.
 */
export const LIST_REGROW_CAPACITY = 1024;

const storeInVariable = (variable: Variable): number[][] =>
  variable.isGlobal
    ? [[PCode.stvg, variableAddress(variable)]]
    : [
        [
          PCode.stvv,
          subroutineAddress(variable.routine as Subroutine),
          variableAddress(variable),
        ],
      ];

/**
 * Emitted before a mutating list op: if the list is full, allocate a bigger
 * block, copy the old contents in, and store the new base back in the variable.
 *
 * Net stack effect is zero - it only touches the variable's own slot and the
 * heap - so it is safe to prepend to the normal argument-pushing sequence.
 */
const listGrowthGuard = (
  receiver: VariableValue,
  program: Program,
  startLine: number,
  options: Options,
): number[][] => {
  const variable = receiver.variable;
  // The "integer" fallback is unreachable: see the matching note in
  // listProcedureCallCode below.
  // deno-coverage-ignore
  const lp = encodeLp(variable.listElementKind ?? "integer");
  const loadBase = () =>
    expression(makeVariableValue(receiver.lexeme, variable), program, options);

  // "length >= capacity" AND "capacity < LIST_REGROW_CAPACITY". The second half
  // means an already-regrown list falls through to the guarded op's own
  // overflow check rather than reallocating to the same size again. Each half
  // is a self-contained, net-single-push fragment - re-reading the variable is
  // cheaper than juggling the stack to keep two intermediates alive - so they
  // concatenate and AND.
  const conditionLines: number[][] = [];
  merge(conditionLines, loadBase());
  merge(conditionLines, [[PCode.lptr]]); // length = main[base]
  merge(conditionLines, loadBase());
  merge(conditionLines, [[PCode.ldin, 1, PCode.plus, PCode.lptr]]); // capacity = main[base+1]
  merge(conditionLines, [[PCode.mreq]]); // length >= capacity ?
  merge(conditionLines, loadBase());
  merge(conditionLines, [[PCode.ldin, 1, PCode.plus, PCode.lptr]]); // capacity = main[base+1]
  merge(conditionLines, [[PCode.ldin, LIST_REGROW_CAPACITY, PCode.less]]); // capacity < LIST_REGROW_CAPACITY ?
  merge(conditionLines, [[PCode.and]]); // both conditions

  const growLines: number[][] = [];
  merge(growLines, [[PCode.lihp, encodeSize(LIST_REGROW_CAPACITY)]]); // newBase
  merge(growLines, [[PCode.dupl]]); // newBase, newBase
  merge(growLines, loadBase()); // newBase, newBase, oldBase
  // LCPY ignores lp, but the operand byte must still be present or every
  // instruction after it is misread
  merge(growLines, [[PCode.lcpy, lp]]); // newBase (the surviving DUPL copy)
  // promote the regrown block out of temporary heap space - see listLiteral.ts
  merge(growLines, [[PCode.hfix]]);
  merge(growLines, storeInVariable(variable)); // (empty)

  const target = startLine + growLines.length + conditionLines.length;
  merge(conditionLines, [[PCode.ifno, target]]);

  return conditionLines.concat(growLines);
};

/**
 * A list method in *statement* position (".append"/".insert"/".extend"/
 * ".remove"/".reverse"/".del"). Returns null for a non-list command so the
 * caller falls through to ordinary command.code() handling.
 *
 * Separate from listFunctionCallCode below because only a statement-level call
 * site has a `startLine`, which the growth guard needs for its IFNO target.
 */
export const listProcedureCallCode = (
  command: Command,
  args: ReadonlyArray<Expression>,
  program: Program,
  startLine: number,
  options: Options,
): number[][] | null => {
  if (!command.listOperand) {
    return null;
  }

  // the receiver is always a plain, unindexed variable reference: both paths
  // that reach a dot-call construct it that way, and a dot-call always has one
  const receiver = args[0]!;
  // deno-coverage-ignore-start -- unreachable: both parse paths that build a
  // dot-method call (python/statement.ts in statement position, and
  // parser/common/factor.ts in expression position) resolve an identifier to a
  // variable first and build the receiver with makeVariableValue(); a literal
  // or call-result receiver ("[1,2,3].append(4)") is rejected by the parser
  // long before the encoder runs
  if (receiver.expressionType !== "variable") {
    return null;
  }
  // deno-coverage-ignore-stop
  const variable = receiver.variable;
  // The "integer" fallback is unreachable: a list variable always reaches the
  // encoder with a pinned element kind, because python/parser.ts's
  // checkForUncertainTypes rejects any program in which a hint-less "x = []"
  // is never followed by something that reveals the kind, and
  // parser/common/typeCheck.ts rejects a scalar reassignment ("x = 5") that
  // would otherwise leave "x" list-flagged but kind-less.
  // deno-coverage-ignore
  const lp = encodeLp(variable.listElementKind ?? "integer");

  const pcode: number[][] = [];

  if (
    command.listBehavior === "append" ||
    command.listBehavior === "insert" ||
    command.listBehavior === "extend"
  ) {
    const guard = listGrowthGuard(receiver, program, startLine, options);
    // push, not merge: the guard's IFNO jumps to the line after the guard, so
    // the opcode call must start a new line. Merged onto the guard's last line
    // it would be jumped straight past.
    pcode.push(...guard);
  }

  if (command.listBehavior === "remove") {
    // LREM is a silent no-op when the value isn't present; real Python raises,
    // and a silent no-op is the worse failure mode in a teaching language, so
    // LIDX checks first. That needs (list, value) twice, duplicated with PICK
    // rather than by re-evaluating expressions that may have side effects.
    // PICK is 1-indexed from the top, so PICK 2 is the item below it.
    // the parser has checked ".remove" takes exactly its two arguments
    merge(pcode, expression(args[0]!, program, options));
    merge(pcode, expression(args[1]!, program, options));
    merge(pcode, [[PCode.pick, 2, PCode.pick, 2]]); // list, value, list, value
    merge(pcode, [[PCode.lidx, lp]]); // list, value, index
    merge(pcode, [[PCode.ernf, PCode.drop]]); // list, value (throws if index was -1; ERNF peeks rather than pops, so no DUPL needed)
    merge(pcode, [[PCode.lrem, lp]]);
    return pcode;
  }

  // Its own fragment, pushed rather than merged, for the jump-target reason
  // above. A string-kind ".append"/".insert" clones its object argument with
  // HSTR - see isScalarStringVariableRead.
  const objectArgIndex =
    command.listBehavior === "append"
      ? 1
      : command.listBehavior === "insert"
        ? 2
        : -1;
  const tail: number[][] = [];
  args.forEach((arg, index) => {
    const argCode = expression(arg, program, options);
    if (
      index === objectArgIndex &&
      variable.listElementKind === "string" &&
      isScalarStringVariableRead(arg)
    ) {
      merge(argCode, [[PCode.hstr]]);
    }
    merge(tail, argCode);
  });
  merge(tail, [[command.code(0)[0]!, lp]]);
  // only these three touch new cells or store new pointers, so only these three
  // need promoting out of temporary heap space; ".reverse"/".del" rearrange
  // already-promoted pointers within an unchanged block
  if (
    command.listBehavior === "append" ||
    command.listBehavior === "insert" ||
    command.listBehavior === "extend"
  ) {
    merge(tail, [[PCode.hfix]]);
  }
  pcode.push(...tail);
  return pcode;
};

/** A list method in *expression* position (".copy"/".index"/"len"). */
export const listFunctionCallCode = (
  command: Command,
  args: ReadonlyArray<Expression>,
  program: Program,
  options: Options,
): number[][] | null => {
  // len() needs no lp operand - a list's length is just main[base] - so unlike
  // every other case here it doesn't gate on command.listOperand. A string
  // argument falls through to the ordinary SLEN path.
  if (command.listBehavior === "length") {
    if (!isListExpression(args[0]!)) {
      return null;
    }
    const pcode: number[][] = [];
    merge(pcode, expression(args[0]!, program, options));
    merge(pcode, [[PCode.lptr]]);
    return pcode;
  }

  if (!command.listOperand) {
    return null;
  }

  const receiver = args[0]!; // a dot-call always has a receiver
  // deno-coverage-ignore-start -- the ternary's undefined arm and the null
  // return are unreachable, for the same reason as listProcedureCallCode's
  // receiver guard above: every parsed dot-call receiver is a VariableValue
  const variable =
    receiver.expressionType === "variable" ? receiver.variable : undefined;
  if (!variable) {
    return null;
  }
  // deno-coverage-ignore-stop
  // The "integer" fallback is unreachable: see the matching note in
  // listProcedureCallCode above.
  // deno-coverage-ignore
  const lp = encodeLp(variable.listElementKind ?? "integer");

  const pcode: number[][] = [];

  if (command.listBehavior === "copy") {
    // LCPY copies into an existing block rather than allocating one, so ".copy()"
    // allocates first - at LIST_REGROW_CAPACITY, since LIHP cannot be given the
    // source's runtime length
    merge(pcode, [[PCode.lihp, encodeSize(LIST_REGROW_CAPACITY)]]); // newBase
    merge(pcode, [[PCode.dupl]]); // newBase, newBase
    merge(pcode, expression(receiver, program, options)); // newBase, newBase, sourceBase
    merge(pcode, [[PCode.lcpy, lp]]); // newBase (the surviving DUPL copy) - lp unused but required, see the guard's own comment
    // promote out of temporary heap space - see listLiteral.ts
    merge(pcode, [[PCode.hfix]]);
    return pcode;
  }

  for (const arg of args) {
    merge(pcode, expression(arg, program, options));
  }
  merge(pcode, [[command.code(0)[0]!, lp]]);

  if (command.listBehavior === "index") {
    // LIDX pushes -1 rather than throwing where real Python raises; ERNF peeks,
    // so it checks and leaves the index in place
    merge(pcode, [[PCode.ernf]]);
  }

  return pcode;
};
