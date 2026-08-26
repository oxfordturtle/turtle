import type { Command } from "@/core/constants.ts";
import type { IdentifierLexeme } from "../../../lexer/lexeme.ts";
import type { Type } from "../../../lexer/types.ts";
import type { Expression } from "../expression.ts";
import { getResultType, type Subroutine } from "../routines/subroutine.ts";

export interface FunctionCall {
  readonly kind: "function";
  readonly lexeme: IdentifierLexeme;
  readonly command: Subroutine | Command;
  readonly type: Type;
  readonly arguments: Expression[];
  // set by the caller for list-returning commands (".copy()"), since a static
  // Command definition can't express "the same kind as the receiver"
  listElementKind?: "integer" | "string";
}

const makeFunctionCall = (
  lexeme: IdentifierLexeme,
  command: Subroutine | Command,
): FunctionCall => ({
  kind: "function",
  lexeme,
  command,
  type: command.kind === "Command" ? command.returns! : getResultType(command)!, // function calls should only ever be created with functions
  arguments: [],
});

export default makeFunctionCall;
