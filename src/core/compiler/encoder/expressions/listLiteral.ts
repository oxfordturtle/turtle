import { PCode } from "@/core/constants.ts";
import type { ListLiteral } from "../../parser/definitions/expressions/listLiteral.ts";
import type { Program } from "../../parser/definitions/routines/program.ts";
import {
  DEFAULT_LIST_CAPACITY,
  encodeLp,
  encodeSize,
  isScalarStringVariableRead,
} from "../lists.ts";
import expression from "../expression.ts";
import merge from "../merge.ts";
import type { Options } from "../options.ts";

export default (
  exp: ListLiteral,
  program: Program,
  options: Options,
): number[][] => {
  const capacity =
    exp.elements.length > 0 ? exp.elements.length : DEFAULT_LIST_CAPACITY;
  const pcode: number[][] = [[PCode.lihp, encodeSize(capacity)]];

  if (exp.elements.length > 0) {
    const lp = encodeLp(exp.listElementKind ?? "integer");
    for (const element of exp.elements) {
      merge(pcode, [[PCode.dupl]]);
      const elementCode = expression(element, program, options);
      // cloned onto a fresh heap block - see lists.ts's
      // isScalarStringVariableRead for why only this expression shape needs it
      if (
        exp.listElementKind === "string" &&
        isScalarStringVariableRead(element)
      ) {
        merge(elementCode, [[PCode.hstr]]);
      }
      merge(pcode, elementCode);
      merge(pcode, [[PCode.lapp, lp]]);
    }
  }

  // Lists share heap/temp-space bookkeeping with heap strings, so anything left
  // in temp space can be silently reclaimed and overwritten by a later read of
  // an earlier temp string (getHeapString rewinds heapTemp past what it reads).
  // HFIX promotes the block, and any element pointers in it, out of reach of
  // that. Every other list encoder that allocates or stores does the same.
  merge(pcode, [[PCode.hfix]]);

  return pcode;
};
