import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makeForStatement, {
  type ForStatement,
} from "../../definitions/statements/forStatement.ts";
import parseBlock from "./block.ts";
import parseSimpleStatement from "./simpleStatement.ts";

const parseForStatement = (
  forLexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
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
    firstInitialisationLexeme.type !== "keyword" &&
    firstInitialisationLexeme.type !== "identifier"
  ) {
    throw new CompilerError(
      '"for" conditions must begin with a variable assignment.',
      firstInitialisationLexeme,
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

  if (!lexemes.get() || lexemes.get()?.content !== ";") {
    throw new CompilerError(
      '"for (..." must be followed by a semicolon.',
      lexemes.get(-1),
    );
  }
  lexemes.next();

  if (!lexemes.get()) {
    throw new CompilerError(
      '"for (...; ...;" must be followed by a loop condition.',
      lexemes.get(-1),
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  if (!lexemes.get() || lexemes.get()?.content !== ";") {
    throw new CompilerError(
      '"for (...; ..." must be followed by a semicolon.',
      lexemes.get(-1),
    );
  }
  lexemes.next();

  const firstChangeLexeme = lexemes.get();
  if (!firstChangeLexeme) {
    throw new CompilerError(
      '"for (...;" must be followed by a loop variable reassignment.',
      lexemes.get(-1),
    );
  }
  if (
    firstChangeLexeme.type !== "keyword" &&
    firstChangeLexeme.type !== "identifier"
  ) {
    throw new CompilerError(
      '"for (...;" must be followed by a loop variable reassignment.',
      lexemes.get(-1),
    );
  }
  const change = parseSimpleStatement(firstChangeLexeme, lexemes, routine);
  if (change.kind !== "variableAssignment") {
    throw new CompilerError(
      '"for (...;" must be followed by a loop variable reassignment.',
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
      '"for (...; ...; ..." must be followed by a closing bracket ")".',
      lexemes.get(-1),
    );
  }
  lexemes.next();

  if (!lexemes.get() || lexemes.get()?.content !== "{") {
    throw new CompilerError(
      '"for (...; ...; ...)" must be followed by an opening bracket "{".',
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

  routine.loopDepth += 1;
  forStatement.statements.push(...parseBlock(lexemes, routine));
  routine.loopDepth -= 1;

  return forStatement;
};

export default parseForStatement;
