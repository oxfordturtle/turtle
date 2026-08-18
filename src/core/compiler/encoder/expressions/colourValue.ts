import { PCode } from "@/core/constants.ts";
import type { ColourValue } from "../../parser/definitions/expressions/colourValue.ts";
import type { Program } from "../../parser/definitions/routines/program.ts";
import type { Options } from "../options.ts";

export default (
  exp: ColourValue,
  _program: Program,
  _options: Options,
): number[] => [PCode.ldin, exp.colour.value];
