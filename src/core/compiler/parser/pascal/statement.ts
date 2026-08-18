import { type Lexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Program } from "../definitions/routines/program.ts";
import type { Subroutine } from "../definitions/routines/subroutine.ts";
import { type Statement } from "../definitions/statement.ts";
import makePassStatement from "../definitions/statements/passStatement.ts";
import eosCheck from "./statements/eosCheck.ts";
import parseForStatement from "./statements/forStatement.ts";
import parseIfStatement from "./statements/ifStatement.ts";
import parseRepeatStatement from "./statements/repeatStatement.ts";
import parseSimpleStatement from "./statements/simpleStatement.ts";
import parseWhileStatement from "./statements/whileStatement.ts";

const parseStatement = (
  lexeme: Lexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
): Statement => {
  // declare the return value
  let statement: Statement;

  // assign the return value accordingly
  switch (lexeme.type) {
    // comments - just ignore them; unlike every other statement kind, a
    // comment doesn't need (and its own trailing lexeme has no reason to
    // be followed by) a semicolon, so return immediately rather than
    // falling through to the eosCheck() call below, which would wrongly
    // demand one after whatever lexeme follows the comment
    case "comment":
      lexemes.next();
      return makePassStatement();

    case "identifier":
      statement = parseSimpleStatement(lexeme, lexemes, routine);
      break;

    case "keyword":
      switch (lexeme.subtype) {
        case "if":
          lexemes.next();
          statement = parseIfStatement(lexeme, lexemes, routine);
          break;

        case "for":
          lexemes.next();
          statement = parseForStatement(lexeme, lexemes, routine);
          break;

        case "repeat":
          lexemes.next();
          statement = parseRepeatStatement(lexeme, lexemes, routine);
          break;

        case "while":
          lexemes.next();
          statement = parseWhileStatement(lexeme, lexemes, routine);
          break;

        default:
          throw new CompilerError("Statement cannot begin with {lex}.", lexeme);
      }
      break;

    default:
      throw new CompilerError("Statement cannot begin with {lex}.", lexeme);
  }

  eosCheck(lexemes);

  return statement;
};

export default parseStatement;
