import { type Lexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
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
  routine: Subroutine,
): Statement => {
  let statement: Statement;

  switch (lexeme.type) {
    case "comment":
      lexemes.next();
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
          lexemes.next();
          statement = parseReturnStatement(lexeme, lexemes, routine);
          break;

        case "if":
          lexemes.next();
          statement = parseIfStatement(lexeme, lexemes, routine);
          break;

        case "else":
          throw new CompilerError(
            'Statement cannot begin with "else". If you have an "if" above, you may be missing a closing bracket "}".',
            lexemes.get(),
          );

        case "for":
          lexemes.next();
          statement = parseForStatement(lexeme, lexemes, routine);
          break;

        case "do":
          lexemes.next();
          statement = parseDoStatement(lexeme, lexemes, routine);
          break;

        case "while":
          lexemes.next();
          statement = parseWhileStatement(lexeme, lexemes, routine);
          break;

        case "break":
          if (routine.loopDepth === 0) {
            throw new CompilerError(
              "'break' is only allowed inside a loop.",
              lexeme,
            );
          }
          lexemes.next();
          eosCheck(lexemes);
          statement = makeBreakStatement();
          break;

        case "continue":
          if (routine.loopDepth === 0) {
            throw new CompilerError(
              "'continue' is only allowed inside a loop.",
              lexeme,
            );
          }
          lexemes.next();
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

export default parseStatement;
