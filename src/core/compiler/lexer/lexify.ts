import type { Language } from "@/core/constants.ts";
import type { Token } from "../tokenizer/token.ts";
import { CompilerError } from "../tools/error.ts";
import {
  booleanLexeme,
  characterLexeme,
  commentLexeme,
  dedentLexeme,
  delimiterLexeme,
  identifierLexeme,
  indentLexeme,
  inputCodeLexeme,
  integerLexeme,
  keywordLexeme,
  type Lexeme,
  newlineLexeme,
  operatorLexeme,
  queryCodeLexeme,
  stringLexeme,
  typeLexeme,
} from "./lexeme.ts";

export default (tokens: Token[], language: Language): Lexeme[] => {
  const lexemes: Lexeme[] = [];
  const indents = [0];
  let index = 0;
  let indent = indents[0];
  while (index < tokens.length) {
    switch (tokens[index].type) {
      case "spaces":
        break;

      case "newline":
        // line breaks are significant in BASIC, Python and TypeScript
        if (
          language === "BASIC" ||
          language === "Python" ||
          language === "TypeScript"
        ) {
          if (lexemes[lexemes.length - 1]) {
            if (
              lexemes[lexemes.length - 1].type !== "newline" &&
              lexemes[lexemes.length - 1].type !== "comment"
            ) {
              lexemes.push(newlineLexeme(tokens[index]));
            }
          }
          while (tokens[index + 1] && tokens[index + 1].type === "newline") {
            index += 1;
          }
        }

        if (language === "Python") {
          indent =
            tokens[index + 1] && tokens[index + 1].type === "spaces"
              ? tokens[index + 1].content.length
              : 0;
          if (indent > indents[indents.length - 1]) {
            indents.push(indent);
            lexemes.push(indentLexeme(tokens[index + 1]));
          } else {
            while (indent < indents[indents.length - 1]) {
              indents.pop();
              lexemes.push(dedentLexeme(tokens[index + 1] || tokens[index]));
            }
            if (indent !== indents[indents.length - 1]) {
              // deno-coverage-ignore-start -- the "|| tokens[index]" fallback
              // is unreachable: a mismatch needs indent > 0, which requires a
              // truthy "spaces" token at tokens[index + 1] (with no next token
              // indent is 0, which always sits at the bottom of the indents
              // stack - seeded as [0], never popped past it - so it cannot
              // mismatch). The throw itself is live and tested; it sits
              // inside this range only because a branch cannot be excluded
              // mid-expression. The identical fallback in the dedent push
              // above *is* reachable and covered.
              throw new CompilerError(
                `Inconsistent indentation at line ${
                  (tokens[index + 1] || tokens[index]).line
                }.`,
              );
              // deno-coverage-ignore-stop
            }
          }
        }
        break;

      case "comment":
        lexemes.push(commentLexeme(tokens[index], language));
        // a comment is terminated by a line break, which is significant in
        // these languages, so a newline lexeme follows every comment
        if (language === "BASIC" || language === "Python") {
          lexemes.push(newlineLexeme(tokens[index + 1] || tokens[index]));
        }
        break;

      case "keyword":
        lexemes.push(keywordLexeme(tokens[index]));
        break;

      case "type":
        lexemes.push(typeLexeme(tokens[index]));
        break;

      case "operator":
        lexemes.push(operatorLexeme(tokens[index], language));
        break;

      case "delimiter":
        lexemes.push(delimiterLexeme(tokens[index]));
        break;

      case "string": {
        const lexeme = stringLexeme(tokens[index], language);
        const isCharacter = lexeme.value.length === 1;
        if (
          isCharacter &&
          (language === "C" || language === "Java" || language === "Pascal")
        ) {
          lexemes.push(characterLexeme(tokens[index], language));
        } else {
          lexemes.push(lexeme);
        }
        break;
      }

      case "boolean":
        lexemes.push(booleanLexeme(tokens[index], language));
        break;

      case "binary":
        lexemes.push(integerLexeme(tokens[index], 2));
        break;

      case "octal":
        lexemes.push(integerLexeme(tokens[index], 8));
        break;

      case "hexadecimal":
        lexemes.push(integerLexeme(tokens[index], 16));
        break;

      case "decimal":
        lexemes.push(integerLexeme(tokens[index], 10));
        break;

      case "inputCode":
        lexemes.push(inputCodeLexeme(tokens[index], language));
        break;

      case "queryCode":
        lexemes.push(queryCodeLexeme(tokens[index], language));
        break;

      case "command":
      case "turtle":
      case "colour":
      case "identifier":
        lexemes.push(identifierLexeme(tokens[index], language));
        break;

      case "unterminatedComment":
        throw new CompilerError("Unterminated comment.", tokens[index]);

      case "unterminatedString":
        throw new CompilerError("Unterminated string.", tokens[index]);

      case "badBinary":
      case "badOctal":
      case "badHexadecimal":
        throw new CompilerError("Ill-formed integer literal.", tokens[index]);

      case "real":
        throw new CompilerError(
          "The Turtle System does not support real numbers.",
          tokens[index],
        );

      case "badInputCode":
        throw new CompilerError("Unrecognised input code.", tokens[index]);

      case "badQueryCode":
        throw new CompilerError("Unrecognised input query.", tokens[index]);

      case "illegal":
        throw new CompilerError(
          "Illegal character in this context.",
          tokens[index],
        );
    }

    index += 1;
  }

  return lexemes;
};
