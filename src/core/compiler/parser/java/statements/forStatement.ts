import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import type { CFamilyDialect } from "../../cFamily/dialect.ts";
import parseBlock from "../../cFamily/statements/block.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { ParserContext } from "../../definitions/context.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makeForStatement, {
  type ForStatement,
} from "../../definitions/statements/forStatement.ts";
import eosCheck from "../../cFamily/statements/eosCheck.ts";
import parseSimpleStatement from "./simpleStatement.ts";

const parseForStatement = (
  forLexeme: KeywordLexeme,
  lexemes: Lexemes,
  context: ParserContext,
  routine: Subroutine,
  dialect: CFamilyDialect<Subroutine>,
): ForStatement => {
  lexemes.expectAfter("(", '"for" must be followed by an opening bracket "(".');

  const firstInitialisationLexeme = lexemes.peek();
  // deno-coverage-ignore-start -- unreachable: the last consumed lexeme is
  // "(", which can never be the program's final lexeme (program.ts guarantees
  // that's "}"), so the stream cannot be dry here
  if (!firstInitialisationLexeme) {
    throw new CompilerError(
      '"for" conditions must begin with a variable assignment.',
      lexemes.peek(-1),
    );
  }
  // deno-coverage-ignore-stop
  if (
    firstInitialisationLexeme.type !== "identifier" &&
    firstInitialisationLexeme.type !== "type"
  ) {
    throw new CompilerError(
      '"for" conditions must begin with a variable assignment.',
      lexemes.peek(),
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
      lexemes.peek(-1),
    );
  }
  if (initialisation.variable.type !== "integer") {
    throw new CompilerError(
      "Loop variable must be an integer.",
      lexemes.peek(),
    );
  }
  eosCheck(lexemes);

  // deno-coverage-ignore-start -- unreachable: eosCheck() has just consumed a
  // ";", which can never be the program's final lexeme (program.ts guarantees
  // that's "}"), so the stream cannot be dry here
  if (lexemes.atEnd()) {
    throw new CompilerError(
      '"for (...;" must be followed by a loop condition.',
      lexemes.peek(-1),
    );
  }
  // deno-coverage-ignore-stop
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");
  eosCheck(lexemes);

  const firstChangeLexeme = lexemes.peek();
  // deno-coverage-ignore-start -- unreachable: eosCheck() has just consumed a
  // ";", which can never be the program's final lexeme (program.ts guarantees
  // that's "}"), so the stream cannot be dry here
  if (!firstChangeLexeme) {
    throw new CompilerError(
      '"for" conditions must begin with a variable assignment.',
      lexemes.peek(-1),
    );
  }
  // deno-coverage-ignore-stop
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
      lexemes.peek(-1),
    );
  }
  if (change.variable !== initialisation.variable) {
    throw new CompilerError(
      "Initial loop variable and change loop variable must be the same.",
      lexemes.peek(-1),
    );
  }

  lexemes.expectAfter(
    ")",
    'Closing bracket ")" missing after "for" loop initialisation.',
  );

  const forStatement = makeForStatement(
    forLexeme,
    initialisation,
    condition,
    change,
  );

  lexemes.expectAfter(
    "{",
    '"for (...)" must be followed by an opening bracket "{".',
  );

  forStatement.statements.push(
    ...context.inLoop(routine, () =>
      parseBlock(lexemes, context, routine, dialect),
    ),
  );

  return forStatement;
};

export default parseForStatement;
