// deno-coverage-ignore-file -- type declarations only: erased at compile time, so no
// test can ever load this module at runtime.

import type { Lexeme } from "../../lexer/lexeme.ts";
import type { Constant } from "../definitions/constant.ts";
import type { ParserContext } from "../definitions/context.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import type { Program } from "../definitions/routines/program.ts";
import type { Subroutine } from "../definitions/routines/subroutine.ts";
import type { Statement } from "../definitions/statement.ts";
import type { Variable } from "../definitions/variable.ts";

/**
 * How a language ends a statement: a semicolon in C and Java, a semicolon or a
 * new line in TypeScript. The shared parsers that need nothing else take this
 * on its own.
 */
export interface StatementEnd {
  eosCheck(lexemes: Lexemes): void;
}

/**
 * What a C-family language must tell the statement parsers in this directory
 * about itself. `R` is the kind of routine whose body may contain statements:
 * TypeScript allows them at the top level, so its `R` is `Program |
 * Subroutine`, while C's and Java's is `Subroutine` alone.
 */
export interface CFamilyDialect<R extends Program | Subroutine>
  extends StatementEnd {
  /** the language's own statement parser: a block is a sequence of these */
  parseStatement(
    lexeme: Lexeme,
    lexemes: Lexemes,
    context: ParserContext,
    routine: R,
  ): Statement;
}

/**
 * A language's own declaration parsers. C and Java write simple statements
 * identically but declare things differently - C's array brackets follow the
 * variable name, Java's belong to the type - so each brings its own pair.
 */
export interface Declarations {
  constant(lexemes: Lexemes, routine: Routine): Constant;
  variable(lexemes: Lexemes, routine: Routine): Variable;
}
