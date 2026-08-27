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

  const programLexeme = lexemes.peek();
  if (
    !programLexeme ||
    programLexeme.type !== "keyword" ||
    programLexeme.subtype !== "program"
  ) {
    throw new CompilerError(
      'Program must begin with keyword "PROGRAM".',
      lexemes.peek(),
    );
  }
  lexemes.advance();

  program.name = identifier(lexemes, program);

  parseSemicolon(lexemes, true, "program declaration");

  let begun = false;
  while (!lexemes.atEnd() && lexemes.peek()?.content.toLowerCase() !== "end") {
    const lexeme = lexemes.peek() as Lexeme;
    switch (lexeme.type) {
      // comments can appear between declarations (e.g. in a VAR block), not
      // just inside a statement body - parseStatement (called only once
      // "begin" has been seen, below) already skips them there; this loop
      // covers the PROGRAM/CONST/VAR/procedure/function declaration section
      // above "begin", which needs the same skip
      case "comment":
        lexemes.advance();
        break;

      case "keyword":
        switch (lexeme.subtype) {
          // constant definitions
          case "const": {
            if (program.variables.length > 0) {
              throw new CompilerError(
                "Constant definitions must be placed above any variable declarations.",
                lexemes.peek(),
              );
            }
            if (program.subroutines.length > 0) {
              throw new CompilerError(
                "Constant definitions must be placed above any subroutine definitions.",
                lexemes.peek(),
              );
            }
            lexemes.advance();
            const constantsSoFar = program.constants.length;
            // a comment may separate one constant definition from the next
            // (e.g. documenting what each constant is for, right after its
            // semicolon) - mirrors the same skip in variables() below
            while (lexemes.peek()?.type === "comment") {
              lexemes.advance();
            }
            while (lexemes.peek()?.type === "identifier") {
              program.constants.push(constant(lexemes, program));
              while (lexemes.peek()?.type === "comment") {
                lexemes.advance();
              }
            }
            if (program.constants.length === constantsSoFar) {
              throw new CompilerError(
                '"CONST" must be followed by an identifier.',
                lexemes.peek(-1),
              );
            }
            break;
          }

          case "var":
            if (program.subroutines.length > 0) {
              throw new CompilerError(
                "Variable declarations must be placed above any subroutine definitions.",
                lexemes.peek(),
              );
            }
            lexemes.advance();
            program.variables.push(...variables(lexemes, program));
            break;

          case "procedure": // fallthrough
          case "function":
            lexemes.advance();
            program.subroutines.push(subroutine(lexeme, lexemes, program));
            break;

          // start of program statements
          case "begin":
            begun = true;
            lexemes.advance();
            while (
              lexemes.peek() &&
              lexemes.peek()?.content?.toLowerCase() !== "end"
            ) {
              const lexeme = lexemes.peek() as Lexeme;
              program.statements.push(parseStatement(lexeme, lexemes, program));
            }
            break;

          default:
            if (!begun) {
              throw new CompilerError(
                'Keyword "begin" missing for main program.',
                lexemes.peek(),
              );
              // deno-coverage-ignore-start -- everything from here to the
              // stop marker is unreachable: begun only becomes true in the
              // "begin" case above, whose statements loop runs until "end" or
              // the lexemes run dry - the very condition that also ends this
              // outer declarations loop - so the switch never runs again with
              // begun === true (the marker sits inside the if because the
              // never-taken else-branch is recorded on its closing brace)
            }
            throw new CompilerError(
              "{lex} makes no sense here.",
              lexemes.peek(),
            );
          // deno-coverage-ignore-stop
        }
        break;

      default:
        if (!begun) {
          throw new CompilerError(
            'Keyword "begin" missing for main program.',
            lexemes.peek(),
          );
          // deno-coverage-ignore-start -- everything from here to the stop
          // marker is unreachable: begun only becomes true in the "begin"
          // case above, whose statements loop runs until "end" or the lexemes
          // run dry - the very condition that also ends this outer
          // declarations loop - so the switch never runs again with begun ===
          // true (the marker sits inside the if because the never-taken
          // else-branch is recorded on its closing brace)
        }
        throw new CompilerError("{lex} makes no sense here.", lexemes.peek());
      // deno-coverage-ignore-stop
    }
  }

  if (!begun) {
    throw new CompilerError(
      'Keyword "begin" missing for main program.',
      lexemes.peek(-1),
    );
  }
  if (lexemes.atEnd()) {
    throw new CompilerError(
      'Keyword "end" missing after main program.',
      lexemes.peek(-1),
    );
  }
  lexemes.advance();
  if (lexemes.peek()?.content !== ".") {
    throw new CompilerError(
      'Full stop missing after program "end".',
      lexemes.peek(-1),
    );
  }
  if (lexemes.peek(1)) {
    throw new CompilerError(
      'No text can appear after program "end".',
      lexemes.peek(1),
    );
  }

  return program;
}
