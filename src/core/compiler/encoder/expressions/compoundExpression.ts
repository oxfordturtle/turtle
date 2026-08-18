import { PCode } from "@/core/constants.ts";
import type { Language } from "@/core/constants.ts";
import type { Operator } from "../../lexer/types.ts";
import type { CompoundExpression } from "../../parser/definitions/expressions/compoundExpression.ts";
import type { Program } from "../../parser/definitions/routines/program.ts";
import { encodeLp } from "../lists.ts";
import expression from "../expression.ts";
import merge from "../merge.ts";
import type { Options } from "../options.ts";
import { relativeJump } from "../relativeJumps.ts";

/**
 * Pascal and BASIC are deliberately absent: standard Pascal doesn't guarantee
 * short-circuit evaluation, and BASIC's AND/OR are the bitwise operators, which
 * need both operands' bits. Each language gets one evaluation rule, not two.
 */
const shortCircuitLanguages: Language[] = ["C", "Java", "Python", "TypeScript"];

/**
 * Evaluate the left operand; if it already decides the answer, jump past the
 * right operand's code leaving the left operand's own value as the result. No
 * ANDL/ORL is emitted at all - whichever operand survives *is* the value.
 *
 * There is no jump-if-nonzero opcode, only IFNO, so "or" inverts its test
 * first. IFNO pops, hence the DUPL: one copy is consumed by the test, the other
 * survives the jump (and is dropped when the jump isn't taken).
 */
const shortCircuit = (
  exp: CompoundExpression,
  program: Program,
  options: Options,
): number[][] => {
  const pcode = expression(
    exp.left as NonNullable<typeof exp.left>,
    program,
    options,
  );
  const right = expression(exp.right, program, options);

  merge(pcode, [
    exp.operator === "andl"
      ? [PCode.dupl, PCode.ifno, relativeJump(right.length + 1)]
      : [
          PCode.dupl,
          PCode.ldin,
          0,
          PCode.eqal,
          PCode.ifno,
          relativeJump(right.length + 1),
        ],
  ]);

  // push, not merge: the jump leaves the line the test is on, so anything
  // merged onto it would be skipped along with the right operand
  const rightLines: number[][] = [[PCode.drop]];
  merge(rightLines, right);
  pcode.push(...rightLines);

  // the jump lands here, on a line of its own for the same reason. It can't be
  // empty (the machine reads pcode[line][0] unconditionally), so it holds the
  // opcode that does nothing; whatever comes next merges onto it and runs on
  // both paths.
  pcode.push([PCode.null]);

  return pcode;
};

export default (
  exp: CompoundExpression,
  program: Program,
  options: Options,
): number[][] => {
  if (
    exp.left &&
    (exp.operator === "andl" || exp.operator === "orl") &&
    shortCircuitLanguages.includes(program.language)
  ) {
    return shortCircuit(exp, program, options);
  }

  const left = exp.left ? expression(exp.left, program, options) : null;

  if (left && exp.right.expressionType === "integer" && exp.right.value === 1) {
    if (exp.operator === "plus") {
      merge(left, [[PCode.incr]]);
      return left;
    }
    if (exp.operator === "subt") {
      merge(left, [[PCode.decr]]);
      return left;
    }
  }

  const right = expression(exp.right, program, options);
  const op = operator(exp, program, options);

  if (left) {
    merge(left, right);
    merge(left, [op]);
    return left;
  }
  merge(right, [op]);
  return right;
};

const operator = (
  exp: CompoundExpression,
  program: Program,
  _options: Options,
): number[] => {
  const op = exp.operator;
  switch (op) {
    case "not":
      return program.language === "C" ||
        program.language === "Python" ||
        program.language === "TypeScript"
        ? // PCode.not is bitwise negation
          [PCode.ldin, 0, PCode.eqal]
        : [PCode.not];

    // Python list multiplication ("[x]*n"). LMUL ignores its lp operand but
    // still requires one, and the block it allocates must be promoted out of
    // temporary heap space immediately - see listLiteral.ts.
    case "lmul":
      return [
        PCode.lmul,
        encodeLp(exp.listElementKind ?? "integer"),
        PCode.hfix,
      ];

    // Python list membership. LIDX reports -1 for "not found" rather than
    // throwing, so membership is that result compared against -1 - no new
    // opcode, no emitted loop. SWAP because LIDX wants (^list, obj) and the
    // source order is (obj, ^list). The negated form inverts the comparison
    // rather than applying PCode.not, which is bitwise and would turn Python's
    // 1 into -2.
    case "lin":
    case "lnin":
      return [
        PCode.swap,
        PCode.lidx,
        // asserted rather than defaulted: the parser only produces these
        // operators once the element kind is known
        encodeLp(exp.listOperandKind as "integer" | "string"),
        PCode.ldin,
        -1,
        op === "lin" ? PCode.noeq : PCode.eqal,
      ];

    // Python substring membership. POSS pops the subject first and the needle
    // second, which is the order "needle in haystack" already leaves them in,
    // and pushes a 1-based index with 0 for not found.
    case "sin":
    case "snin":
      return [
        PCode.poss,
        PCode.ldin,
        0,
        op === "sin" ? PCode.noeq : PCode.eqal,
      ];

    default:
      return [PCode[op as any] as any as PCode];
  }
};
