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
import type { Declarations } from "../dialect.ts";
import parseVariableAssignment from "./variableAssignment.ts";

/**
 * C's and Java's simple statements: a constant definition, a variable
 * declaration (with or without an assignment), an assignment to a variable
 * already declared, or a procedure call. Each language binds its own
 * `declarations` - see `dialect.ts` - and TypeScript, whose "const" and "var"
 * work differently again, keeps its own parser.
 */
const makeParseSimpleStatement =
  (declarations: Declarations) =>
  (
    lexeme: KeywordLexeme | TypeLexeme | IdentifierLexeme,
    lexemes: Lexemes,
    routine: Program | Subroutine,
  ): VariableAssignment | ProcedureCall | PassStatement => {
    switch (lexeme.type) {
      // ("const" in C and "final" in Java are the only keywords that bring us
      // here)
      case "keyword":
        lexemes.advance();
        routine.constants.push(declarations.constant(lexemes, routine));
        return makePassStatement();

      case "type": {
        // it will be an identifier if the next line doesn't throw an error
        const variableLexeme = lexemes.peek(1) as IdentifierLexeme;
        const declared = declarations.variable(lexemes, routine);
        routine.variables.push(declared);
        if (lexemes.peek()?.content === "=") {
          return parseVariableAssignment(
            variableLexeme,
            lexemes,
            routine,
            declared,
          );
        } else {
          return makePassStatement();
        }
      }

      case "identifier": {
        const assignee = find.variable(routine, lexeme.value);
        const command = find.command(routine, lexeme.value);
        if (assignee) {
          lexemes.advance();
          return parseVariableAssignment(lexeme, lexemes, routine, assignee);
        } else if (command) {
          lexemes.advance();
          return parseProcedureCall(lexeme, lexemes, routine, command);
        } else {
          throw new CompilerError("{lex} is not defined.", lexemes.peek());
        }
      }
    }
  };

export default makeParseSimpleStatement;
