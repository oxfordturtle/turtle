import { html, type HtmlResult } from "@merivale/womble";
import { type Language, languages } from "@/core/constants.ts";

/**
 * One word of prose spelled differently in each of the six languages, as the six
 * `<code data-language="...">` elements the page-wide `languageVisibility` pass
 * expects - it shows the one matching the current language and hides the rest.
 *
 * ```ts
 * html`… the ${code("colour")} command, which …`;
 * ```
 */
export const code = (name: string | Record<Language, string>): HtmlResult => {
  const forms = typeof name === "string" ? spellings(name) : name;
  return html`
    ${languages.map(
      (language) => html`
        <code data-language="${language}">${forms[language]}</code>
      `,
    )}
  `;
};

/**
 * The six spellings of a name, by the same rule
 * src/core/constants/commands.ts applies to a command declared with a single
 * string: BASIC shouts, C, Pascal and Python are lower case, and Java and
 * TypeScript keep the camel case they were written in. It is applied to the
 * whole string, so an argument list comes along unharmed (`code("rgb(3)")`).
 *
 * A handful of commands genuinely diverge beyond that (`PRINT` is `writeln`
 * in Pascal, for one). Pass those the full record instead of a string.
 */
const spellings = (name: string): Record<Language, string> => ({
  BASIC: name.toUpperCase(),
  C: name.toLowerCase(),
  Java: name,
  Pascal: name.toLowerCase(),
  Python: name.toLowerCase(),
  TypeScript: name,
});
