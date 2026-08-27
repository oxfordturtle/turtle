import type { Command } from "@/core/constants.ts";
import type { IdentifierLexeme } from "../../../lexer/lexeme.ts";
import type { Expression } from "../expression.ts";
import type { Subroutine } from "../routines/subroutine.ts";

export interface ProcedureCall {
  readonly kind: "procedureCall";
  readonly lexeme: IdentifierLexeme;
  readonly command: Subroutine | Command;
  readonly arguments: Expression[];
}

const makeProcedureCall = (
  lexeme: IdentifierLexeme,
  command: Subroutine | Command,
): ProcedureCall =>
  ({
    kind: "procedureCall",
    lexeme,
    command,
    arguments: [] as Expression[],
  }) as const;

export default makeProcedureCall;
