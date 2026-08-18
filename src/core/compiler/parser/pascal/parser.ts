import type { Lexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import makeProgram, { type Program } from "../definitions/routines/program.ts";
import constant from "./constant.ts";
import identifier from "./identifier.ts";
import parseStatement from "./statement.ts";
import parseSemicolon from "./statements/semicolon.ts";
import subroutine from "./subroutine.ts";
import { variables } from "./variable.ts";

export default function pascal(lexemes: Lexemes): Program {
  const program = makeProgram("Pascal");

  const programLexeme = lexemes.get();
  if (
    !programLexeme ||
    programLexeme.type !== "keyword" ||
    programLexeme.subtype !== "program"
  ) {
    throw new CompilerError(
      'Program must begin with keyword "PROGRAM".',
      lexemes.get(),
    );
  }
  lexemes.next();

  program.name = identifier(lexemes, program);

  parseSemicolon(lexemes, true, "program declaration");

  let begun = false;
  while (lexemes.get() && lexemes.get()?.content.toLowerCase() !== "end") {
    const lexeme = lexemes.get() as Lexeme;
    switch (lexeme.type) {
      // comments can appear between declarations (e.g. in a VAR block), not
      // just inside a statement body - parseStatement (called only once
      // "begin" has been seen, below) already skips them there; this loop
      // covers the PROGRAM/CONST/VAR/procedure/function declaration section
      // above "begin", which needs the same skip
      case "comment":
        lexemes.next();
        break;

      case "keyword":
        switch (lexeme.subtype) {
          // constant definitions
          case "const": {
            if (program.variables.length > 0) {
              throw new CompilerError(
                "Constant definitions must be placed above any variable declarations.",
                lexemes.get(),
              );
            }
            if (program.subroutines.length > 0) {
              throw new CompilerError(
                "Constant definitions must be placed above any subroutine definitions.",
                lexemes.get(),
              );
            }
            lexemes.next();
            const constantsSoFar = program.constants.length;
            // a comment may separate one constant definition from the next
            // (e.g. documenting what each constant is for, right after its
            // semicolon) - mirrors the same skip in variables() below
            while (lexemes.get()?.type === "comment") {
              lexemes.next();
            }
            while (lexemes.get()?.type === "identifier") {
              program.constants.push(constant(lexemes, program));
              while (lexemes.get()?.type === "comment") {
                lexemes.next();
              }
            }
            if (program.constants.length === constantsSoFar) {
              throw new CompilerError(
                '"CONST" must be followed by an identifier.',
                lexemes.get(-1),
              );
            }
            break;
          }

          case "var":
            if (program.subroutines.length > 0) {
              throw new CompilerError(
                "Variable declarations must be placed above any subroutine definitions.",
                lexemes.get(),
              );
            }
            lexemes.next();
            program.variables.push(...variables(lexemes, program));
            break;

          case "procedure": // fallthrough
          case "function":
            lexemes.next();
            program.subroutines.push(subroutine(lexeme, lexemes, program));
            break;

          // start of program statements
          case "begin":
            begun = true;
            lexemes.next();
            while (
              lexemes.get() &&
              lexemes.get()?.content?.toLowerCase() !== "end"
            ) {
              const lexeme = lexemes.get() as Lexeme;
              program.statements.push(parseStatement(lexeme, lexemes, program));
            }
            break;

          default:
            if (!begun) {
              throw new CompilerError(
                'Keyword "begin" missing for main program.',
                lexemes.get(),
              );
            }
            throw new CompilerError(
              "{lex} makes no sense here.",
              lexemes.get(),
            );
        }
        break;

      default:
        if (!begun) {
          throw new CompilerError(
            'Keyword "begin" missing for main program.',
            lexemes.get(),
          );
        }
        throw new CompilerError("{lex} makes no sense here.", lexemes.get());
    }
  }

  if (!begun) {
    throw new CompilerError(
      'Keyword "begin" missing for main program.',
      lexemes.get(-1),
    );
  }
  if (!lexemes.get()) {
    throw new CompilerError(
      'Keyword "end" missing after main program.',
      lexemes.get(-1),
    );
  }
  lexemes.next();
  if (!lexemes.get() || lexemes.get()?.content !== ".") {
    throw new CompilerError(
      'Full stop missing after program "end".',
      lexemes.get(-1),
    );
  }
  if (lexemes.get(1)) {
    throw new CompilerError(
      'No text can appear after program "end".',
      lexemes.get(1),
    );
  }

  return program;
}
