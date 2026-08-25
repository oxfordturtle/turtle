import type { Language } from "@/core/constants.ts";
import {
  lexify,
  parse,
  type Program,
  type Statement,
  tokenize,
} from "@/core/compiler.ts";

/**
 * Wraps a fragment of statements in the minimal valid program shell each
 * language requires (BASIC's "END", C/Java's "main" method + (for Java) a
 * class wrapper, Pascal's "program ... begin ... end.", TypeScript's
 * variable-declaration rules) so that shared-behavior tests can supply just
 * the interesting part.
 *
 * `varDecl` is a language-specific declaration to splice in before the body
 * for languages that need it declared up front (C/Java/Pascal/TypeScript).
 */
export const wrapProgram = (
  language: Language,
  body: string,
  varDecl = "",
): string => {
  switch (language) {
    case "BASIC":
      return `${body}\nEND`;
    case "C":
      return `${varDecl}\nvoid main () {\n${body}\n}`;
    case "Java":
      return `class Test {\n${varDecl}\nvoid main () {\n${body}\n}\n}`;
    case "Pascal":
      return `program Test;\n${varDecl}\nbegin\n${body}\nend.`;
    case "Python":
      return body;
    case "TypeScript":
      return `${varDecl}\n${body}`;
  }
};

/** parses a whole program for the given language */
export const parseProgram = (language: Language, code: string): Program => {
  const tokens = tokenize(code, language);
  const lexemes = lexify(tokens, language);
  return parse(lexemes, language);
};

/**
 * The statements to inspect for a wrapped test program: top-level for
 * languages that allow bare top-level statements, or the (sole) "main"
 * subroutine's statements for C/Java, which require every statement to
 * live inside a subroutine.
 */
export const bodyStatements = (
  language: Language,
  program: Program,
): Statement[] =>
  language === "C" || language === "Java"
    ? program.subroutines[0].statements
    : program.statements;
