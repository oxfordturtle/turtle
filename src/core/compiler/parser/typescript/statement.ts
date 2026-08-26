import { type Lexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import * as find from "../common/find.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Program } from "../definitions/routines/program.ts";
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
  routine: Program | Subroutine,
): Statement => {
  let statement: Statement;

  switch (lexeme.type) {
    case "comment":
      lexemes.advance();
      statement = makePassStatement();
      break;

    case "newline":
      // in general this should be impossible (new lines should be eaten up at
      // the end of the previous statement), but it can happen at the start of
      // of the program or the start of a block, if there's a comment on the
      lexemes.advance();
      statement = makePassStatement();
      break;

    case "identifier":
      statement = parseSimpleStatement(lexeme, lexemes, routine);
      eosCheck(lexemes);
      break;

    case "keyword":
      switch (lexeme.subtype) {
        // function
        case "function": {
          // the subroutine will have been defined in the first pass
          const sub = find.subroutine(
            routine,
            lexemes.peek(1)?.content as string,
          ) as Subroutine;
          // so here, just jump past its lexemes
          // N.B. lexemes[sub.end] is the final "}" lexeme; here we want to move
          // past it, hence sub.end + 1
          lexemes.seek(sub.end + 1);
          statement = makePassStatement();
          break;
        }

        // start of variable declaration/assignment
        case "const": // fallthrough
        case "var":
          statement = parseSimpleStatement(lexeme, lexemes, routine);
          eosCheck(lexemes);
          break;

        case "return":
          lexemes.advance();
          statement = parseReturnStatement(lexeme, lexemes, routine);
          break;

        case "if":
          lexemes.advance();
          statement = parseIfStatement(lexeme, lexemes, routine);
          break;

        case "else":
          throw new CompilerError(
            'Statement cannot begin with "else". If you have an "if" above, you may be missing a closing bracket "}".',
            lexeme,
          );

        case "for":
          lexemes.advance();
          statement = parseForStatement(lexeme, lexemes, routine);
          break;

        case "do":
          lexemes.advance();
          statement = parseDoStatement(lexeme, lexemes, routine);
          break;

        case "while":
          lexemes.advance();
          statement = parseWhileStatement(lexeme, lexemes, routine);
          break;

        case "break":
          if (routine.loopDepth === 0) {
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
          if (routine.loopDepth === 0) {
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
        // exhaustive over TypeScript's keyword table (constants/keywords.ts:
        // if, else, for, while, do, function, var, const, return, break,
        // continue), and the tokenizer only emits keyword tokens for names in
        // that table
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
