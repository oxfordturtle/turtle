import { PCode } from "@/core/constants.ts";
import type { IntegerValue } from "../../parser/definitions/expressions/integerValue.ts";
import type { Program } from "../../parser/definitions/routines/program.ts";
import type { Options } from "../options.ts";

export default (
  exp: IntegerValue,
  _program: Program,
  _options: Options,
): number[] => [PCode.ldin, exp.value];
