import type { Lexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { ParserContext } from "../definitions/context.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import { getAllSubroutines } from "../definitions/routine.ts";
import makeProgram, { type Program } from "../definitions/routines/program.ts";
import constant from "./constant.ts";
import identifier from "../cFamily/identifier.ts";
import parseStatement from "./statement.ts";
import eosCheck from "../cFamily/statements/eosCheck.ts";
import parseSimpleStatement from "./statements/simpleStatement.ts";
import subroutine from "./subroutine.ts";
import type from "./type.ts";

export default function c(lexemes: Lexemes, context: ParserContext): Program {
  const program = makeProgram("C");

  while (!lexemes.atEnd()) {
    const lexeme = lexemes.peek() as Lexeme;
    const declarationStart = lexemes.mark();

    switch (lexeme.type) {
      case "comment":
        lexemes.advance();
        break;

      case "keyword":
        if (lexeme.subtype === "const") {
          lexemes.advance();
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

        if (lexemes.peek()?.content === "(") {
          lexemes.seek(declarationStart); // go back to the start
          program.subroutines.push(subroutine(lexeme, lexemes, program));
        } // otherwise its a variable declaration/assignment
        else {
          lexemes.seek(declarationStart); // go back to the start
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
    lexemes.seekBody(subroutine);
    while (lexemes.inBody(subroutine)) {
      subroutine.statements.push(
        parseStatement(lexemes.peek() as Lexeme, lexemes, context, subroutine),
      );
    }
  }

  if (!program.subroutines.some((x) => x.name === "main")) {
    throw new CompilerError('Program does not contain any "main" method.');
  }

  return program;
}
