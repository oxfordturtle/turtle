import { colours, type Language } from "@/core/constants.ts";
import type { Token } from "./token.ts";
import tokenize from "./tokenize.ts";

export default (code: string | Token[], language: Language): string => {
  const tokens = typeof code === "string" ? tokenize(code, language) : code;
  return tokens
    .map((token) => {
      switch (token.type) {
        case "spaces":
        case "newline":
          return token.content;

        case "unterminatedComment":
        case "unterminatedString":
        case "badBinary":
        case "badOctal":
        case "badHexadecimal":
        case "real":
        case "badInputCode":
        case "badQueryCode":
        case "illegal":
          return `<span class="error">${token.content}</span>`;

        case "binary":
        case "octal":
        case "hexadecimal":
        case "decimal":
          return `<span class="integer">${token.content}</span>`;

        case "colour": {
          const colour = colours.find(
            (x) => x.names[language] === token.content,
          );
          return colour
            ? `<span class="colour" style="border-color:#${colour.hex};">${token.content}</span>`
            : `<span class="colour">${token.content}</span>`;
        }

        default:
          return `<span class="${token.type}">${token.content}</span>`;
      }
    })
    .join("");
};
