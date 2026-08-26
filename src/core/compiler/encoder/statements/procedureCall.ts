import { PCode } from "@/core/constants.ts";
import type { NamedArgument } from "../../parser/definitions/expressions/namedArgument.ts";
import { type Program } from "../../parser/definitions/routines/program.ts";
import { getParameters } from "../../parser/definitions/routines/subroutine.ts";
import type { ProcedureCall } from "../../parser/definitions/statements/procedureCall.ts";
import { turtleAddress } from "../addresses.ts";
import expression from "../expression.ts";
import { listProcedureCallCode } from "../lists.ts";
import merge from "../merge.ts";
import type { Options } from "../options.ts";

export default (
  stmt: ProcedureCall,
  program: Program,
  startLine: number,
  options: Options,
): number[][] => {
  const pcode: number[][] = [];

  // Python "print": the positional arguments separated by "sep" (default a
  // space), then "end" after the last (default a newline)
  if (
    program.language === "Python" &&
    stmt.command.kind === "Command" &&
    stmt.command.names.Python === "print"
  ) {
    const named = (name: string): NamedArgument | undefined =>
      stmt.arguments.find(
        (argument): argument is NamedArgument =>
          argument.kind === "namedArgument" && argument.lexeme.content === name,
      );
    const separator = named("sep");
    const terminator = named("end");
    const positional = stmt.arguments.filter(
      (argument) => argument.kind !== "namedArgument",
    );

    for (const [index, argument] of positional.entries()) {
      if (index > 0) {
        if (separator === undefined) {
          // the default separator, encoded as literalStringValue.ts would
          merge(pcode, [[PCode.lstr, 1, " ".charCodeAt(0)]]);
        } else {
          merge(pcode, expression(separator.expression, program, options));
        }
        merge(pcode, [[PCode.writ]]);
      }
      merge(pcode, expression(argument, program, options));
      merge(pcode, [[PCode.writ]]);
    }

    if (terminator === undefined) {
      // NEWL rather than WRIT of a literal "\n": equivalent, but no heap string
      merge(pcode, [[PCode.newl]]);
    } else {
      merge(pcode, expression(terminator.expression, program, options));
      merge(pcode, [[PCode.writ]]);
    }
    return pcode;
  }

  // Python list method calls (".append" etc.)
  if (stmt.command.kind === "Command") {
    const listCode = listProcedureCallCode(
      stmt.command,
      stmt.arguments,
      program,
      startLine,
      options,
    );
    if (listCode) {
      return listCode;
    }
  }

  const parameters =
    stmt.command.kind === "Command"
      ? stmt.command.parameters
      : getParameters(stmt.command);
  for (let index = 0; index < parameters.length; index += 1) {
    // the parser has already checked the argument count against the
    // parameter list, so both subscripts are in range
    const arg = stmt.arguments[index]!;
    const param = parameters[index]!;
    merge(pcode, expression(arg, program, options, param.isReferenceParameter));
  }

  if (stmt.command.kind === "Subroutine") {
    // the command index is a placeholder, back-patched by encode.ts
    merge(pcode, [[PCode.subr, stmt.command.index]]);
  } else {
    merge(pcode, [stmt.command.code(turtleAddress(program))]);
  }

  return pcode;
};
