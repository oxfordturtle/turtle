import type { Lexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import { getAllSubroutines } from "../definitions/routine.ts";
import makeProgram, { type Program } from "../definitions/routines/program.ts";
import constant from "./constant.ts";
import identifier from "./identifier.ts";
import parseStatement from "./statement.ts";
import eosCheck from "./statements/eosCheck.ts";
import parseSimpleStatement from "./statements/simpleStatement.ts";
import subroutine from "./subroutine.ts";
import type from "./type.ts";

export default function c(lexemes: Lexemes): Program {
  const program = makeProgram("C");

  while (lexemes.get()) {
    const lexeme = lexemes.get() as Lexeme;
    const lexemeIndex = lexemes.index;

    switch (lexeme.type) {
      case "comment":
        lexemes.next();
        break;

      case "keyword":
        if (lexeme.subtype === "const") {
          lexemes.next();
          program.constants.push(constant(lexemes, program));
          eosCheck(lexemes);
        } else {
          throw new CompilerError(
            "Program can only contain constant definitions, variable declarations, and subroutine definitions.",
            lexeme,
          );
        }
        break;

      case "type":
        type(lexemes);
        identifier(lexemes, program);

        if (lexemes.get()?.content === "(") {
          lexemes.index = lexemeIndex; // go back to the start
          program.subroutines.push(subroutine(lexeme, lexemes, program));
        } // otherwise its a variable declaration/assignment
        else {
          lexemes.index = lexemeIndex; // go back to the start
          program.statements.push(
            parseSimpleStatement(lexeme, lexemes, program),
          );
          eosCheck(lexemes);
        }
        break;

      default:
        throw new CompilerError(
          "Program can only contain constant definitions, variable declarations, and subroutine defintions.",
          lexeme,
        );
    }
  }

  for (const subroutine of getAllSubroutines(program)) {
    lexemes.index = subroutine.start;
    while (lexemes.index < subroutine.end) {
      subroutine.statements.push(
        parseStatement(lexemes.get() as Lexeme, lexemes, subroutine),
      );
    }
  }

  if (!program.subroutines.some((x) => x.name === "main")) {
    throw new CompilerError('Program does not contain any "main" method.');
  }

  return program;
}
