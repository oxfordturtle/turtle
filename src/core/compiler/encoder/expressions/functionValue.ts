import { PCode } from "@/core/constants.ts";
import type { FunctionCall } from "../../parser/definitions/expressions/functionCall.ts";
import type { Program } from "../../parser/definitions/routines/program.ts";
import {
  getParameters,
  getResultType,
} from "../../parser/definitions/routines/subroutine.ts";
import { resultAddress, turtleAddress } from "../addresses.ts";
import expression from "../expression.ts";
import { listFunctionCallCode } from "../lists.ts";
import merge from "../merge.ts";
import type { Options } from "../options.ts";

export default (
  exp: FunctionCall,
  program: Program,
  options: Options,
): number[][] => {
  const pcode: number[][] = [];

  // Python list method calls (".copy"/".index")
  if (exp.command.kind === "Command") {
    const listCode = listFunctionCallCode(
      exp.command,
      exp.arguments,
      program,
      options,
    );
    if (listCode) {
      return listCode;
    }
  }

  const parameters =
    exp.command.kind === "Command"
      ? exp.command.parameters
      : getParameters(exp.command);
  for (let index = 0; index < parameters.length; index += 1) {
    // the parser has already checked the argument count against the
    // parameter list, so both subscripts are in range
    const arg = exp.arguments[index]!;
    const param = parameters[index]!;
    merge(pcode, expression(arg, program, options, param.isReferenceParameter));
  }

  if (exp.command.kind === "Subroutine") {
    // the command index is a placeholder, back-patched by encode.ts
    merge(pcode, [[PCode.subr, exp.command.index]]);
  } else {
    // copied so the command's own array isn't modified
    merge(pcode, [exp.command.code(turtleAddress(program))]);
  }

  if (exp.command.kind === "Subroutine") {
    // push, not merge: anything after a subroutine call must start a new line
    pcode.push([PCode.ldvv, resultAddress(program), 1]);
    if (getResultType(exp.command) === "string") {
      merge(pcode, [[PCode.hstr]]);
    }
  }

  return pcode;
};
