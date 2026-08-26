import type { Lexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import { getAllSubroutines } from "../definitions/routine.ts";
import type { Program } from "../definitions/routines/program.ts";
import constant from "./constant.ts";
import identifier from "./identifier.ts";
import program from "./program.ts";
import parseStatement from "./statement.ts";
import eosCheck from "./statements/eosCheck.ts";
import parseSimpleStatement from "./statements/simpleStatement.ts";
import subroutine from "./subroutine.ts";
import type from "./type.ts";

export default function java(lexemes: Lexemes): Program {
  const prog = program(lexemes);

  lexemes.seek(prog.start);
  while (lexemes.before(prog.end)) {
    const lexeme = lexemes.peek() as Lexeme;
    const declarationStart = lexemes.mark();

    switch (lexeme.type) {
      case "comment":
        lexemes.advance();
        break;

      // constant definitions
      case "keyword":
        if (lexeme.subtype === "final") {
          lexemes.advance();
          prog.constants.push(constant(lexemes, prog));
          eosCheck(lexemes);
        } else {
          throw new CompilerError(
            "Program can only contain constant definitions, variable declarations, and subroutine definitions.",
            lexeme,
          );
        }
        break;

      // variable declarations/assignments or subroutine definitions
      case "type":
        type(lexemes, prog);
        identifier(lexemes, prog);

        if (lexemes.peek()?.content === "(") {
          lexemes.seek(declarationStart); // go back to the start
          prog.subroutines.push(subroutine(lexeme, lexemes, prog));
        } // otherwise its a variable declaration/assignment
        else {
          lexemes.seek(declarationStart); // go back to the start
          prog.statements.push(parseSimpleStatement(lexeme, lexemes, prog));
          eosCheck(lexemes);
        }
        break;

      default:
        throw new CompilerError(
          "Program can only contain constant definitions, variable declarations, and subroutine definitions.",
          lexeme,
        );
    }
  }

  for (const subroutine of getAllSubroutines(prog)) {
    lexemes.seek(subroutine.start);
    while (lexemes.before(subroutine.end)) {
      subroutine.statements.push(
        parseStatement(lexemes.peek() as Lexeme, lexemes, subroutine),
      );
    }
  }

  if (!prog.subroutines.some((x) => x.name === "main")) {
    throw new CompilerError('Program does not contain any "main" method.');
  }

  return prog;
}
