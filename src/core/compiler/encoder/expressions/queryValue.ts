import { PCode } from "@/core/constants.ts";
import type { QueryValue } from "../../parser/definitions/expressions/queryValue.ts";
import type { Program } from "../../parser/definitions/routines/program.ts";
import type { Options } from "../options.ts";

export default (
  exp: QueryValue,
  _program: Program,
  _options: Options,
): number[] => [PCode.ldin, exp.input.value, PCode.stat];
