import type { Language } from "@/core/constants.ts";
import type { Lexeme } from "../lexer/lexeme.ts";
import basicParser from "./basic/parser.ts";
import cParser from "./c/parser.ts";
import makeLexemes from "./definitions/lexemes.ts";
import type { Program } from "./definitions/routines/program.ts";
import javaParser from "./java/parser.ts";
import pascalParser from "./pascal/parser.ts";
import pythonParser from "./python/parser.ts";
import typeScriptParser from "./typescript/parser.ts";

const parseProgram = (rawLexemes: Lexeme[], language: Language): Program => {
  const lexemes = makeLexemes(rawLexemes);

  switch (language) {
    case "BASIC":
      return basicParser(lexemes);
    case "C":
      return cParser(lexemes);
    case "Java":
      return javaParser(lexemes);
    case "Pascal":
      return pascalParser(lexemes);
    case "Python":
      return pythonParser(lexemes);
    case "TypeScript":
      return typeScriptParser(lexemes);
  }
};

export default parseProgram;
