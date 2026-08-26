import { type Lexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { CFamilyDialect } from "../cFamily/dialect.ts";
import parseDoStatement from "../cFamily/statements/doStatement.ts";
import eosCheck from "../cFamily/statements/eosCheck.ts";
import parseIfStatement from "../cFamily/statements/ifStatement.ts";
import parseReturnStatement from "../cFamily/statements/returnStatement.ts";
import parseWhileStatement from "../cFamily/statements/whileStatement.ts";
import type { ParserContext } from "../definitions/context.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import { type Subroutine } from "../definitions/routines/subroutine.ts";
import { type Statement } from "../definitions/statement.ts";
import makeBreakStatement from "../definitions/statements/breakStatement.ts";
import makeContinueStatement from "../definitions/statements/continueStatement.ts";
import makePassStatement from "../definitions/statements/passStatement.ts";
import parseForStatement from "./statements/forStatement.ts";
import parseSimpleStatement from "./statements/simpleStatement.ts";

const parseStatement = (
  lexeme: Lexeme,
  lexemes: Lexemes,
  context: ParserContext,
  routine: Subroutine,
): Statement => {
  let statement: Statement;

  switch (lexeme.type) {
    case "comment":
      lexemes.advance();
      statement = makePassStatement();
      break;

    case "identifier": // fallthrough
    case "type":
      statement = parseSimpleStatement(lexeme, lexemes, routine);
      eosCheck(lexemes);
      break;

    case "keyword":
      switch (lexeme.subtype) {
        // constant definition
        case "final":
          statement = parseSimpleStatement(lexeme, lexemes, routine);
          eosCheck(lexemes);
          break;

        case "return":
          lexemes.advance();
          statement = parseReturnStatement(lexeme, lexemes, routine, dialect);
          break;

        case "if":
          lexemes.advance();
          statement = parseIfStatement(
            lexeme,
            lexemes,
            context,
            routine,
            dialect,
          );
          break;

        case "else":
          throw new CompilerError(
            'Statement cannot begin with "else". If you have an "if" above, you may be missing a closing bracket "}".',
            lexeme,
          );

        case "for":
          lexemes.advance();
          statement = parseForStatement(
            lexeme,
            lexemes,
            context,
            routine,
            dialect,
          );
          break;

        case "do":
          lexemes.advance();
          statement = parseDoStatement(
            lexeme,
            lexemes,
            context,
            routine,
            dialect,
          );
          break;

        case "while":
          lexemes.advance();
          statement = parseWhileStatement(
            lexeme,
            lexemes,
            context,
            routine,
            dialect,
          );
          break;

        case "break":
          if (!context.insideLoop(routine)) {
            throw new CompilerError(
              "'break' is only allowed inside a loop.",
              lexeme,
            );
          }
          lexemes.advance();
          eosCheck(lexemes);
          statement = makeBreakStatement();
          break;

        case "continue":
          if (!context.insideLoop(routine)) {
            throw new CompilerError(
              "'continue' is only allowed inside a loop.",
              lexeme,
            );
          }
          lexemes.advance();
          eosCheck(lexemes);
          statement = makeContinueStatement();
          break;

        default:
          throw new CompilerError("Statement cannot begin with {lex}.", lexeme);
      }
      break;

    default:
      throw new CompilerError("Statement cannot begin with {lex}.", lexeme);
  }

  return statement;
};

/** what the shared C-family statement parsers need to know about Java */
const dialect: CFamilyDialect<Subroutine> = { eosCheck, parseStatement };

export default parseStatement;
