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
  // the innermost indentation level: `indents` is seeded [0] and never popped
  // past that, so the stack is never empty
  const currentIndent = (): number => indents[indents.length - 1]!;
  let index = 0;
  let indent = 0;
  // the loop condition is the bounds check, so `token` needs no other one
  let token = tokens[index];
  while (token !== undefined) {
    switch (token.type) {
      case "spaces":
        break;

      case "newline":
        // line breaks are significant in BASIC, Python and TypeScript
        if (
          language === "BASIC" ||
          language === "Python" ||
          language === "TypeScript"
        ) {
          const previous = lexemes[lexemes.length - 1];
          if (previous) {
            if (previous.type !== "newline" && previous.type !== "comment") {
              lexemes.push(newlineLexeme(token));
            }
          }
          while (tokens[index + 1]?.type === "newline") {
            index += 1;
          }
        }

        if (language === "Python") {
          // bound after the loop above, which may have advanced `index`
          const after = tokens[index + 1];
          indent = after?.type === "spaces" ? after.content.length : 0;
          if (indent > currentIndent()) {
            indents.push(indent);
            lexemes.push(indentLexeme(after!));
          } else {
            while (indent < currentIndent()) {
              indents.pop();
              lexemes.push(dedentLexeme(after || token));
            }
            if (indent !== currentIndent()) {
              // deno-coverage-ignore-start -- the "|| token" fallback
              // is unreachable: a mismatch needs indent > 0, which requires a
              // truthy "spaces" token at tokens[index + 1] (with no next token
              // indent is 0, which always sits at the bottom of the indents
              // stack - seeded as [0], never popped past it - so it cannot
              // mismatch). The throw itself is live and tested; it sits
              // inside this range only because a branch cannot be excluded
              // mid-expression. The identical fallback in the dedent push
              // above *is* reachable and covered.
              throw new CompilerError(
                `Inconsistent indentation at line ${(after || token).line}.`,
              );
              // deno-coverage-ignore-stop
            }
          }
        }
        break;

      case "comment": {
        lexemes.push(commentLexeme(token, language));
        // a comment is terminated by a line break, which is significant in
        // these languages, so a newline lexeme follows every comment
        if (language === "BASIC" || language === "Python") {
          lexemes.push(newlineLexeme(tokens[index + 1] || token));
        }
        break;
      }

      case "keyword":
        lexemes.push(keywordLexeme(token));
        break;

      case "type":
        lexemes.push(typeLexeme(token));
        break;

      case "operator":
        lexemes.push(operatorLexeme(token, language));
        break;

      case "delimiter":
        lexemes.push(delimiterLexeme(token));
        break;

      case "string": {
        const lexeme = stringLexeme(token, language);
        const isCharacter = lexeme.value.length === 1;
        if (
          isCharacter &&
          (language === "C" || language === "Java" || language === "Pascal")
        ) {
          lexemes.push(characterLexeme(token, language));
        } else {
          lexemes.push(lexeme);
        }
        break;
      }

      case "boolean":
        lexemes.push(booleanLexeme(token, language));
        break;

      case "binary":
        lexemes.push(integerLexeme(token, 2));
        break;

      case "octal":
        lexemes.push(integerLexeme(token, 8));
        break;

      case "hexadecimal":
        lexemes.push(integerLexeme(token, 16));
        break;

      case "decimal":
        lexemes.push(integerLexeme(token, 10));
        break;

      case "inputCode":
        lexemes.push(inputCodeLexeme(token, language));
        break;

      case "queryCode":
        lexemes.push(queryCodeLexeme(token, language));
        break;

      case "command":
      case "turtle":
      case "colour":
      case "identifier":
        lexemes.push(identifierLexeme(token, language));
        break;

      case "unterminatedComment":
        throw new CompilerError("Unterminated comment.", token);

      case "unterminatedString":
        throw new CompilerError("Unterminated string.", token);

      case "badBinary":
      case "badOctal":
      case "badHexadecimal":
        throw new CompilerError("Ill-formed integer literal.", token);

      case "real":
        throw new CompilerError(
          "The Turtle System does not support real numbers.",
          token,
        );

      case "badInputCode":
        throw new CompilerError("Unrecognised input code.", token);

      case "badQueryCode":
        throw new CompilerError("Unrecognised input query.", token);

      case "illegal":
        throw new CompilerError("Illegal character in this context.", token);
    }

    index += 1;
    token = tokens[index];
  }

  return lexemes;
};
