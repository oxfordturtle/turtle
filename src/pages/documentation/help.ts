import { html, type HtmlResult } from "@merivale/womble";
import type { RequestParams } from "../types.ts";
import page from "../_layout/page.ts";
import { htmlResponse } from "../utils/response.ts";
import "@/islands/doc-tabs.ts";
import "@/islands/language-select.ts";
import BASICBasics from "./help/BASIC/basics.ts";
import BASICStructures from "./help/BASIC/structures.ts";
import BASICOperators from "./help/BASIC/operators.ts";
import BASICInput from "./help/BASIC/input.ts";
import CBasics from "./help/C/basics.ts";
import CStructures from "./help/C/structures.ts";
import COperators from "./help/C/operators.ts";
import CInput from "./help/C/input.ts";
import JavaBasics from "./help/Java/basics.ts";
import JavaStructures from "./help/Java/structures.ts";
import JavaOperators from "./help/Java/operators.ts";
import JavaInput from "./help/Java/input.ts";
import PascalBasics from "./help/Pascal/basics.ts";
import PascalStructures from "./help/Pascal/structures.ts";
import PascalOperators from "./help/Pascal/operators.ts";
import PascalInput from "./help/Pascal/input.ts";
import PythonBasics from "./help/Python/basics.ts";
import PythonStructures from "./help/Python/structures.ts";
import PythonOperators from "./help/Python/operators.ts";
import PythonInput from "./help/Python/input.ts";
import TypeScriptBasics from "./help/TypeScript/basics.ts";
import TypeScriptStructures from "./help/TypeScript/structures.ts";
import TypeScriptOperators from "./help/TypeScript/operators.ts";
import TypeScriptInput from "./help/TypeScript/input.ts";

export default (requestParams: RequestParams): Promise<Response> =>
  htmlResponse(
    page(requestParams, {
      header: header(tab(requestParams)),
      main: main(tab(requestParams)),
    }),
  );

const tab = (requestParams: RequestParams): string =>
  requestParams.url.searchParams.get("tab") ?? "basics";

// Both <select>s are islands. The language one reads and writes the settings
// store every page shares, which is what makes the guides below update live; the
// tab one switches the panes underneath, which stay page markup because they are
// documentation prose. Its `<option>`s are call-site children, projected as-is
// and never patched, so the plain `selected` attribute is a genuine default.
const header = (tab: string): HtmlResult => html`
  <div class="title">
    <h1>Turtle Languages Help</h1>
    <doc-tabs tab="${tab}">
      <option value="basics" selected="${tab === "basics"}">
        Programs &amp; Procedures
      </option>
      <option value="structures" selected="${tab === "structures"}">
        Command Structures
      </option>
      <option value="operators" selected="${tab === "operators"}">
        Operators
      </option>
      <option value="input" selected="${tab === "input"}">User Input</option>
    </doc-tabs>
    <language-select />
  </div>
  <p>
    The <em>Turtle System</em> supports programming in several specially
    designed languages. These languages all mimic an existing language, but
    incorporate native Turtle Graphics support, and are pared down to facilitate
    teaching and learning in a simpler and less daunting environment (and to
    enable the compilers to produce much more precise and detailed error
    messages). The guides on this page, together with the
    <a href="/documentation/reference">Commands &amp; Constants Reference</a>,
    cover the essentials for programming in the <em>Turtle System</em>. For a
    more complete description of the languages, see the
    <a href="/documentation/languages">Turtle Language Specifications</a>.
  </p>
`;

const main = (tab: string): HtmlResult => html`
  <div class="tab-panes">
    ${guides.map(
      ({ name, byLanguage }) => html`
        <div class="${paneClass(tab, name)}" data-tab="${name}">
          ${byLanguage.map(
            ([language, guide]) => html`
              <div data-language="${language}">${guide()}</div>
            `,
          )}
        </div>
      `,
    )}
  </div>
`;

// One entry per tab, each listing the six language guides that tab shows -
// the `data-language` divs the page-wide `languageVisibility` pass
// (src/client/passes.ts) shows and hides.
const guides: { name: string; byLanguage: [string, () => HtmlResult][] }[] = [
  {
    name: "basics",
    byLanguage: [
      ["BASIC", BASICBasics],
      ["C", CBasics],
      ["Java", JavaBasics],
      ["Pascal", PascalBasics],
      ["Python", PythonBasics],
      ["TypeScript", TypeScriptBasics],
    ],
  },
  {
    name: "structures",
    byLanguage: [
      ["BASIC", BASICStructures],
      ["C", CStructures],
      ["Java", JavaStructures],
      ["Pascal", PascalStructures],
      ["Python", PythonStructures],
      ["TypeScript", TypeScriptStructures],
    ],
  },
  {
    name: "operators",
    byLanguage: [
      ["BASIC", BASICOperators],
      ["C", COperators],
      ["Java", JavaOperators],
      ["Pascal", PascalOperators],
      ["Python", PythonOperators],
      ["TypeScript", TypeScriptOperators],
    ],
  },
  {
    name: "input",
    byLanguage: [
      ["BASIC", BASICInput],
      ["C", CInput],
      ["Java", JavaInput],
      ["Pascal", PascalInput],
      ["Python", PythonInput],
      ["TypeScript", TypeScriptInput],
    ],
  },
];

const paneClass = (tab: string, name: string): string =>
  tab === name ? "tab-pane active" : "tab-pane";
