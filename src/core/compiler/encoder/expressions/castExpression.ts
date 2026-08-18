import { PCode } from "@/core/constants/pcodes.ts";
import {
  getListElementKind,
  getType,
  isListExpression,
} from "../../parser/definitions/expression.ts";
import type { CastExpression } from "../../parser/definitions/expressions/castExpression.ts";
import type { Program } from "../../parser/definitions/routines/program.ts";
import { encodeLp } from "../lists.ts";
import expression from "../expression.ts";
import merge from "../merge.ts";
import type { Options } from "../options.ts";

export default (
  exp: CastExpression,
  program: Program,
  options: Options,
): number[][] => {
  const pcode = expression(exp.expression, program, options);

  if (getType(exp.expression) === "character" && exp.type === "string") {
    merge(pcode, [[PCode.ctos]]);
  }
  if (getType(exp.expression) === "integer" && exp.type === "string") {
    merge(pcode, [[PCode.itos]]);
  }
  if (getType(exp.expression) === "string" && exp.type === "integer") {
    merge(pcode, [[PCode.ldin, 0, PCode.sval]]);
  }
  // Python "print(mylist)" - implicit list->string via LPRT's repr() formatting
  if (isListExpression(exp.expression) && exp.type === "string") {
    merge(pcode, [
      [PCode.lprt, encodeLp(getListElementKind(exp.expression) ?? "integer")],
    ]);
  }

  return pcode;
};
