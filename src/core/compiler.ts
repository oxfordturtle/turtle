export { default as tokenize } from "./compiler/tokenizer/tokenize.ts";
export { default as lexify } from "./compiler/lexer/lexify.ts";
export { default as parse } from "./compiler/parser/parser.ts";
export { default as encode } from "./compiler/encoder/encode.ts";
export { default as analyse } from "./compiler/analyser/analyse.ts";
export { default as highlight } from "./compiler/tokenizer/highlight.ts";
export { type Token } from "./compiler/tokenizer/token.ts";
export { type CommentLexeme, type Lexeme } from "./compiler/lexer/lexeme.ts";
export {
  default as makeProgram,
  type Program,
} from "./compiler/parser/definitions/routines/program.ts";
/**
 * The formatter is an unfinished stub (TODO.md §2.2): `formatProgram` returns
 * the literal string "program", and several statement and expression arms
 * return "TODO". It is exported all the same so that its current behaviour is
 * pinned by test/core/compiler/formatter.test.ts and visible to the coverage
 * gate; implementing it for real means updating those pins as part of the
 * change.
 */
export { default as formatProgram } from "./compiler/formatter/formatter.ts";
export { default as formatStatement } from "./compiler/formatter/statement.ts";
export { default as formatExpression } from "./compiler/formatter/expression.ts";
export { default as formatType } from "./compiler/formatter/type.ts";
export type { UsageCategory } from "./compiler/analyser/usageCategory.ts";
export type { UsageExpression } from "./compiler/analyser/usageExpression.ts";
export type { Type } from "./compiler/lexer/types.ts";
export type { Subroutine } from "./compiler/parser/definitions/routines/subroutine.ts";
export type { Options as EncoderOptions } from "./compiler/encoder/options.ts";
export { defaultOptions as defaultCompilerOptions } from "./compiler/encoder/options.ts";
export type { Statement } from "./compiler/parser/definitions/statement.ts";
export type { Expression } from "./compiler/parser/definitions/expression.ts";
export type { Variable } from "./compiler/parser/definitions/variable.ts";
export type { Constant } from "./compiler/parser/definitions/constant.ts";
export type { BreakStatement } from "./compiler/parser/definitions/statements/breakStatement.ts";
export type { ContinueStatement } from "./compiler/parser/definitions/statements/continueStatement.ts";
export type { ForStatement } from "./compiler/parser/definitions/statements/forStatement.ts";
export type { IfStatement } from "./compiler/parser/definitions/statements/ifStatement.ts";
export type { PassStatement } from "./compiler/parser/definitions/statements/passStatement.ts";
export type { ProcedureCall } from "./compiler/parser/definitions/statements/procedureCall.ts";
export type { RepeatStatement } from "./compiler/parser/definitions/statements/repeatStatement.ts";
export type { ReturnStatement } from "./compiler/parser/definitions/statements/returnStatement.ts";
export type { VariableAssignment } from "./compiler/parser/definitions/statements/variableAssignment.ts";
export type { WhileStatement } from "./compiler/parser/definitions/statements/whileStatement.ts";
