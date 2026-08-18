import { html, type HtmlResult } from "@merivale/womble";
import type { RequestParams } from "../types.ts";
import page from "../_layout/page.ts";
import { htmlResponse } from "../utils/response.ts";
import "@/islands/reference/colour-table.ts";
import "@/islands/reference/command-table.ts";
import "@/islands/doc-tabs.ts";
import "@/islands/language-select.ts";
import cursorTable from "@/islands/reference/cursor-table.ts";
import fontTable from "@/islands/reference/font-table.ts";
import keycodeTable from "@/islands/reference/keycode-table.ts";
import coloursNotes from "./reference/notes/colours.ts";
import commandsNotes from "./reference/notes/commands.ts";
import cursorsNotes from "./reference/notes/cursors.ts";
import fontsNotes from "./reference/notes/fonts.ts";
import keycodesNotes from "./reference/notes/keycodes.ts";

export default (requestParams: RequestParams): Promise<Response> =>
  htmlResponse(
    page(requestParams, {
      header: header(tab(requestParams)),
      main: main(tab(requestParams)),
    }),
  );

const tab = (requestParams: RequestParams): string =>
  requestParams.url.searchParams.get("tab") ?? "commands";

// Both <select>s are islands. The language one reads and writes the settings
// store, which the command and colour tables below also follow, so changing the
// language updates them live; the tab one switches the two sets of panes
// underneath, which stay page markup because they are documentation prose. Its
// `<option>`s are call-site children, projected as-is and never patched, so the
// plain `selected` attribute is a genuine default.
const header = (tab: string): HtmlResult => html`
  <div class="title">
    <h1>Commands &amp; Constants Reference</h1>
    <doc-tabs tab="${tab}">
      <option value="commands" selected="${tab === "commands"}">
        Native Commands
      </option>
      <option value="colours" selected="${tab === "colours"}">
        Colour Constants
      </option>
      <option value="fonts" selected="${tab === "fonts"}">Fonts</option>
      <option value="cursors" selected="${tab === "cursors"}">Cursors</option>
      <option value="keycodes" selected="${tab === "keycodes"}">
        Input Keycodes
      </option>
    </doc-tabs>
    <language-select />
  </div>
  <div class="tab-panes">
    <div class="${paneClass(tab, "commands")}" data-tab="commands">
      ${commandsNotes()}
    </div>
    <div class="${paneClass(tab, "colours")}" data-tab="colours">
      ${coloursNotes()}
    </div>
    <div class="${paneClass(tab, "fonts")}" data-tab="fonts">
      ${fontsNotes()}
    </div>
    <div class="${paneClass(tab, "cursors")}" data-tab="cursors">
      ${cursorsNotes()}
    </div>
    <div class="${paneClass(tab, "keycodes")}" data-tab="keycodes">
      ${keycodesNotes()}
    </div>
  </div>
`;

const main = (tab: string): HtmlResult => html`
  <div class="tab-panes">
    <div class="${paneClass(tab, "commands")}" data-tab="commands">
      <command-table simple />
    </div>
    <div class="${paneClass(tab, "colours")}" data-tab="colours">
      <colour-table />
    </div>
    <div class="${paneClass(tab, "fonts")}" data-tab="fonts">
      ${fontTable()}
    </div>
    <div class="${paneClass(tab, "cursors")}" data-tab="cursors">
      ${cursorTable()}
    </div>
    <div class="${paneClass(tab, "keycodes")}" data-tab="keycodes">
      ${keycodeTable()}
    </div>
  </div>
`;

const paneClass = (tab: string, name: string): string =>
  tab === name ? "tab-pane active" : "tab-pane";
