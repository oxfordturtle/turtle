import { type Lexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Program } from "../definitions/routines/program.ts";
import {
  getProgram,
  type Subroutine,
} from "../definitions/routines/subroutine.ts";
import type { Statement } from "../definitions/statement.ts";
import makePassStatement from "../definitions/statements/passStatement.ts";
import constant from "./constant.ts";
import parseForStatement from "./statements/forStatement.ts";
import parseIfStatement from "./statements/ifStatement.ts";
import parseRepeatStatement from "./statements/repeatStatement.ts";
import parseReturnStatement from "./statements/returnStatement.ts";
import parseSimpleStatement from "./statements/simpleStatement.ts";
import parseWhileStatement from "./statements/whileStatement.ts";
import { array, variables } from "./variable.ts";

const parseStatement = (
  lexeme: Lexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
  oneLine = false,
): Statement => {
  let statement: Statement;

  switch (lexeme.type) {
    case "comment":
      lexemes.advance();
      statement = makePassStatement();
      break;

    // deno-coverage-ignore-start -- unreachable: lexify never emits a newline
    // as a routine's first lexeme (leading line breaks are dropped, and a
    // first-line comment yields the comment lexeme first, handled above), and
    // every dispatch point either consumes line breaks before parsing (the
    // block parsers, parseNewLine for subroutine bodies) or follows the
    // end-of-statement check below, which eats every colon/newline/comment;
    // one-line IF/ELSE bodies are checked non-newline before dispatch. Kept
    // as a safe no-op in case a future dispatch path misses a newline.
    case "newline":
      statement = makePassStatement();
      break;
    // deno-coverage-ignore-stop

    // '=' (at the end of a function)
    case "operator":
      if (lexeme.subtype === "eqal") {
        lexemes.advance();
        statement = parseReturnStatement(lexeme, lexemes, routine);
      } else {
        throw new CompilerError("Statement cannot begin with {lex}.", lexeme);
      }
      break;

    case "identifier":
      statement = parseSimpleStatement(lexeme, lexemes, routine);
      break;

    case "keyword":
      switch (lexeme.subtype) {
        // CONST statement
        case "const":
          lexemes.advance();
          routine.constants.push(constant(lexemes, routine));
          statement = makePassStatement();
          break;

        // DIM statement
        case "dim":
          lexemes.advance();
          routine.variables.push(array(lexemes, routine));
          statement = makePassStatement();
          break;

        // LOCAL statement
        case "local":
          if (routine.kind === "Program") {
            throw new CompilerError(
              "Main program cannot declare any LOCAL variables.",
              lexemes.peek(),
            );
          }
          lexemes.advance();
          routine.variables.push(...variables(lexemes, routine));
          statement = makePassStatement();
          break;

        // PRIVATE statement
        case "private": {
          if (routine.kind === "Program") {
            throw new CompilerError(
              "Main program cannot declare any PRIVATE variables.",
              lexemes.peek(),
            );
          }
          lexemes.advance();
          const privateVariables = variables(lexemes, routine);
          for (const privateVariable of privateVariables) {
            privateVariable.private = routine;
          }
          getProgram(routine).variables.push(...privateVariables);
          statement = makePassStatement();
          break;
        }

        case "if":
          lexemes.advance();
          statement = parseIfStatement(lexeme, lexemes, routine);
          break;

        case "for":
          lexemes.advance();
          statement = parseForStatement(lexeme, lexemes, routine);
          break;

        case "repeat":
          lexemes.advance();
          statement = parseRepeatStatement(lexeme, lexemes, routine);
          break;

        case "while":
          lexemes.advance();
          statement = parseWhileStatement(lexeme, lexemes, routine);
          break;

        case "def":
          if (routine.kind === "Program") {
            throw new CompilerError(
              'Subroutines must be defined after program "END".',
              lexeme,
            );
          }
          throw new CompilerError(
            "Subroutines cannot contain any nested subroutine definitions.",
            lexeme,
          );

        default:
          throw new CompilerError(
            "Statement cannot begin with {lex}.",
            lexemes.peek(),
          );
      }
      break;

    default:
      throw new CompilerError(
        "Statement cannot begin with {lex}.",
        lexemes.peek(),
      );
  }

  // end of statement check
  // bypass within oneLine IF...THEN...ELSE statement (check occurs at the end of the whole statement)
  if (!oneLine && lexemes.peek()) {
    if (
      lexemes.peek()?.content === ":" ||
      lexemes.peek()?.type === "newline" ||
      lexemes.peek()?.type === "comment"
    ) {
      while (
        lexemes.peek()?.content === ":" ||
        lexemes.peek()?.type === "newline" ||
        lexemes.peek()?.type === "comment"
      ) {
        lexemes.advance();
      }
    } else {
      throw new CompilerError(
        "Statements must be separated by a colon or placed on different lines.",
        lexemes.peek(),
      );
    }
  }

  return statement;
};

export default parseStatement;
