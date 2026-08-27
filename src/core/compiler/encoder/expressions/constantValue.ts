import { PCode, traits } from "@/core/constants.ts";
import type { ConstantValue } from "../../parser/definitions/expressions/constantValue.ts";
import type { Program } from "../../parser/definitions/routines/program.ts";
import expression from "../expression.ts";
import merge from "../merge.ts";
import type { Options } from "../options.ts";

export default (
  exp: ConstantValue,
  program: Program,
  options: Options,
): number[][] => {
  const pcode: number[][] = [];

  if (exp.constant.type === "string") {
    const value = exp.constant.value as string;
    pcode.push(
      [PCode.lstr, value.length].concat(
        Array.from(value).map((x) => x.charCodeAt(0)),
      ),
    );
    if (exp.indexes.length > 0) {
      const indexExp = expression(exp.indexes[0]!, program, options);
      merge(pcode, indexExp);
      if (traits[program.language].stringIndexBase === 1) {
        merge(pcode, [[PCode.decr]]);
      }
      merge(pcode, [
        [PCode.swap, PCode.test, PCode.plus, PCode.incr, PCode.lptr],
      ]);
    }
  } else {
    pcode.push([PCode.ldin, exp.constant.value as number]);
  }

  return pcode;
};
