import { define, html, unsafeHtml } from "@merivale/womble";
import { highlight, type Lexeme } from "@/core/compiler.ts";
import { getSettings, languageOf } from "@/islands/settings.ts";
import { getLexemes, programStore } from "./program.ts";
import { paneClasses, paneSources, paneAttributes } from "./tab-pane.ts";

// The Syntax tab: every lexeme the lexer produced from the current program,
// minus the comments (which have a tab of their own). Replaces
// src/client/components/system/syntax.ts, which built the same rows with
// `document.createElement` into an empty `<tbody data-component>` whenever the
// hub said the lexemes had changed.
define("syntax-tab", {
  attributes: paneAttributes,
  sources: [...paneSources, programStore],
  render: ({ active }) => {
    const language = languageOf(getSettings());
    return html`
      <div class="${paneClasses(active, "expert,machine")}">
        <div class="syntax">
          <table class="syntax-table">
            <thead>
              <tr>
                <th>Lex</th>
                <th>Line</th>
                <th>String</th>
                <th class="wide">Type</th>
              </tr>
            </thead>
            <tbody>
              ${getLexemes().map(
                (lexeme, index) => html`
                  <tr>
                    <td>${(index + 1).toString(10)}</td>
                    <td>${lexeme.line.toString(10)}</td>
                    <td class="wide">
                      <code
                        >${lexeme.content
                          ? unsafeHtml(highlight(lexeme.content, language))
                          : ""}</code
                      >
                    </td>
                    <td class="wide">${describe(lexeme)}</td>
                  </tr>
                `,
              )}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },
});

const describe = (lexeme: Lexeme): string =>
  `${lexeme.type}${"subtype" in lexeme ? ` (${lexeme.subtype})` : ""}`;
