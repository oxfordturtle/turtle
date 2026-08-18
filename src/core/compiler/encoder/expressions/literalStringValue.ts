import { PCode } from "@/core/constants.ts";
import { type StringValue } from "../../parser/definitions/expressions/stringValue.ts";
import type { Program } from "../../parser/definitions/routines/program.ts";
import type { Options } from "../options.ts";

export default (
  exp: StringValue,
  _program: Program,
  _options: Options,
): number[] =>
  [PCode.lstr, exp.value.length].concat(
    Array.from(exp.value).map((x) => x.charCodeAt(0)),
  );
