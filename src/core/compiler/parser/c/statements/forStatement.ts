import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makeForStatement, {
  type ForStatement,
} from "../../definitions/statements/forStatement.ts";
import parseBlock from "./block.ts";
import eosCheck from "./eosCheck.ts";
import parseSimpleStatement from "./simpleStatement.ts";

const parseForStatement = (
  forLexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Subroutine,
): ForStatement => {
  if (!lexemes.get() || lexemes.get()?.content !== "(") {
    throw new CompilerError(
      '"for" must be followed by an opening bracket "(".',
      lexemes.get(-1),
    );
  }
  lexemes.next();

  const firstInitialisationLexeme = lexemes.get();
  if (!firstInitialisationLexeme) {
    throw new CompilerError(
      '"for" conditions must begin with a variable assignment.',
      lexemes.get(-1),
    );
  }
  if (
    firstInitialisationLexeme.type !== "identifier" &&
    firstInitialisationLexeme.type !== "type"
  ) {
    throw new CompilerError(
      '"for" conditions must begin with a variable assignment.',
      lexemes.get(),
    );
  }
  const initialisation = parseSimpleStatement(
    firstInitialisationLexeme,
    lexemes,
    routine,
  );
  if (initialisation.kind !== "variableAssignment") {
    throw new CompilerError(
      '"for" conditions must begin with a variable assignment.',
      lexemes.get(-1),
    );
  }
  if (initialisation.variable.type !== "integer") {
    throw new CompilerError("Loop variable must be an integer.", lexemes.get());
  }
  eosCheck(lexemes);

  if (!lexemes.get()) {
    throw new CompilerError(
      '"for (...;" must be followed by a loop condition.',
      lexemes.get(-1),
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");
  eosCheck(lexemes);

  const firstChangeLexeme = lexemes.get();
  if (!firstChangeLexeme) {
    throw new CompilerError(
      '"for" conditions must begin with a variable assignment.',
      lexemes.get(-1),
    );
  }
  if (
    firstChangeLexeme.type !== "identifier" &&
    firstChangeLexeme.type !== "type"
  ) {
    throw new CompilerError(
      '"for" conditions must begin with a variable assignment.',
      firstChangeLexeme,
    );
  }
  const change = parseSimpleStatement(firstChangeLexeme, lexemes, routine);
  if (change.kind !== "variableAssignment") {
    throw new CompilerError(
      '"for" loop variable must be changed on each loop.',
      lexemes.get(-1),
    );
  }
  if (change.variable !== initialisation.variable) {
    throw new CompilerError(
      "Initial loop variable and change loop variable must be the same.",
      lexemes.get(-1),
    );
  }

  if (!lexemes.get() || lexemes.get()?.content !== ")") {
    throw new CompilerError(
      'Closing bracket ")" missing after "for" loop initialisation.',
      lexemes.get(-1),
    );
  }
  lexemes.next();

  const forStatement = makeForStatement(
    forLexeme,
    initialisation,
    condition,
    change,
  );

  if (!lexemes.get() || lexemes.get()?.content !== "{") {
    throw new CompilerError(
      '"for (...)" must be followed by an opening bracket "{".',
      lexemes.get(-1),
    );
  }
  lexemes.next();

  routine.loopDepth += 1;
  forStatement.statements.push(...parseBlock(lexemes, routine));
  routine.loopDepth -= 1;

  return forStatement;
};

export default parseForStatement;
