import { type Lexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { ParserContext } from "../definitions/context.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import { type Subroutine } from "../definitions/routines/subroutine.ts";
import { type Statement } from "../definitions/statement.ts";
import makeBreakStatement from "../definitions/statements/breakStatement.ts";
import makeContinueStatement from "../definitions/statements/continueStatement.ts";
import makePassStatement from "../definitions/statements/passStatement.ts";
import parseDoStatement from "./statements/doStatement.ts";
import eosCheck from "./statements/eosCheck.ts";
import parseForStatement from "./statements/forStatement.ts";
import parseIfStatement from "./statements/ifStatement.ts";
import parseReturnStatement from "./statements/returnStatement.ts";
import parseSimpleStatement from "./statements/simpleStatement.ts";
import parseWhileStatement from "./statements/whileStatement.ts";

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
        case "const":
          statement = parseSimpleStatement(lexeme, lexemes, routine);
          eosCheck(lexemes);
          break;

        case "return":
          lexemes.advance();
          statement = parseReturnStatement(lexeme, lexemes, routine);
          break;

        case "if":
          lexemes.advance();
          statement = parseIfStatement(lexeme, lexemes, context, routine);
          break;

        case "else":
          throw new CompilerError(
            'Statement cannot begin with "else". If you have an "if" above, you may be missing a closing bracket "}".',
            lexemes.peek(),
          );

        case "for":
          lexemes.advance();
          statement = parseForStatement(lexeme, lexemes, context, routine);
          break;

        case "do":
          lexemes.advance();
          statement = parseDoStatement(lexeme, lexemes, context, routine);
          break;

        case "while":
          lexemes.advance();
          statement = parseWhileStatement(lexeme, lexemes, context, routine);
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

        // deno-coverage-ignore-start -- unreachable: the cases above are
        // exhaustive over C's keyword table (constants/keywords.ts: if, else,
        // for, while, do, const, return, break, continue), and the tokenizer
        // only emits keyword tokens for names in that table
        default:
          throw new CompilerError("Statement cannot begin with {lex}.", lexeme);
        // deno-coverage-ignore-stop
      }
      break;

    default:
      throw new CompilerError("Statement cannot begin with {lex}.", lexeme);
  }

  return statement;
};

export default parseStatement;
