import { define, html, type HtmlResult, unsafeHtml } from "@merivale/womble";
import { highlight, type UsageCategory } from "@/core/compiler.ts";
import type { Language } from "@/core/constants.ts";
import { getSettings, languageOf } from "@/islands/settings.ts";
import { getUsage, programStore } from "./program.ts";
import { paneClasses, paneSources, paneAttributes } from "./tab-pane.ts";

// The Usage tab: which language expressions the current program uses, how
// often, and where.
//
// A category is three runs of rows - its heading, one row per expression, and a
// total - so the categories are flattened into a single list of rows rather than
// mapped one-to-one: a template hole takes a flat list.
define("usage-tab", {
  attributes: paneAttributes,
  sources: [...paneSources, programStore],
  render: ({ active }) => {
    const language = languageOf(getSettings());
    return html`
      <div class="${paneClasses(active, "normal,expert,machine")}">
        <div class="usage">
          <table class="usage-table">
            <thead>
              <tr>
                <th>Expression</th>
                <th>Level</th>
                <th>Count</th>
                <th>Program Lines</th>
              </tr>
            </thead>
            <tbody>
              ${getUsage().flatMap((category) =>
                categoryRows(category, language),
              )}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },
});

const categoryRows = (
  category: UsageCategory,
  language: Language,
): HtmlResult[] => [
  html`
    <tr class="category-heading">
      <th colspan="4">${category.category}</th>
    </tr>
  `,
  ...category.expressions.map(
    (expression) => html`
      <tr>
        <td>
          <code>${unsafeHtml(highlight(expression.name, language))}</code>
        </td>
        <td>${expression.level.toString(10)}</td>
        <td>${expression.count.toString(10)}</td>
        <td>${expression.lines.replace(/\s/g, ", ")}</td>
      </tr>
    `,
  ),
  html`
    <tr>
      <td></td>
      <td>TOTAL:</td>
      <td>${category.total.toString(10)}</td>
      <td></td>
    </tr>
  `,
];
