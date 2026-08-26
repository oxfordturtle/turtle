import {
  type IdentifierLexeme,
  type KeywordLexeme,
  type TypeLexeme,
} from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import * as find from "../../common/find.ts";
import parseProcedureCall from "../../common/procedureCall.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makePassStatement, {
  type PassStatement,
} from "../../definitions/statements/passStatement.ts";
import { type ProcedureCall } from "../../definitions/statements/procedureCall.ts";
import { type VariableAssignment } from "../../definitions/statements/variableAssignment.ts";
import constant from "../constant.ts";
import variable from "../variable.ts";
import parseVariableAssignment from "./variableAssignment.ts";

const parseSimpleStatement = (
  lexeme: KeywordLexeme | TypeLexeme | IdentifierLexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
): VariableAssignment | ProcedureCall | PassStatement => {
  switch (lexeme.type) {
    // (because "const" is the only keyword that will bring us here)
    case "keyword":
      lexemes.advance();
      routine.constants.push(constant(lexemes, routine));
      return makePassStatement();

    case "type": {
      const variableLexeme = lexemes.peek(1) as IdentifierLexeme; // it will be if the next line doesn't throw an error
      const foo = variable(lexemes, routine);
      routine.variables.push(foo);
      if (lexemes.peek()?.content === "=") {
        return parseVariableAssignment(variableLexeme, lexemes, routine, foo);
      } else {
        return makePassStatement();
      }
    }

    case "identifier": {
      const bar = find.variable(routine, lexeme.value);
      const baz = find.command(routine, lexeme.value);
      if (bar) {
        lexemes.advance();
        return parseVariableAssignment(lexeme, lexemes, routine, bar);
      } else if (baz) {
        lexemes.advance();
        const statement = parseProcedureCall(lexeme, lexemes, routine, baz);
        return statement;
      } else {
        throw new CompilerError("{lex} is not defined.", lexemes.peek());
      }
    }
  }
};

export default parseSimpleStatement;
