import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { html } from "@merivale/womble";
import {
  colours,
  type Command,
  commandCategories,
  cursors,
  fonts,
  inputs,
  type Language,
} from "@/core/constants.ts";
import "@/islands/reference/colour-table.ts";
import "@/islands/reference/command-table.ts";
import { LANGUAGES } from "../../core/compiler/lib/languages.ts";
import { renderIslands, renderRoute } from "./lib/render.ts";

// The reference page's whole point is that it ships real markup rather than
// five empty containers a script fills in on load (which is what it did before
// the migration). These pin that: every row of every table is in the response
// body, and the two language-dependent tables are in the right language.
//
// Every expectation is derived from `@/core/constants.ts`, never written out,
// so adding a colour or a command moves the test with the data instead of
// breaking it.

const rows = (markup: string): number =>
  (markup.match(/<tr[\s>]/g) ?? []).length;

/** the commands the table shows as the reference page writes it: first category, simple level only */
const defaultCommands = (language: Language): Command[] =>
  (commandCategories[0].expressions as Command[]).filter(
    (command) => command.level === 0 && command.names[language],
  );

describe("the reference page", () => {
  it("renders a cell for every colour", async () => {
    const { markup } = await renderRoute("/documentation/reference");
    const table = markup.slice(markup.indexOf("<colour-table"));
    assertEquals(
      (table.match(/style="background:#/g) ?? []).length,
      colours.length,
    );
  });

  it("renders a cell for every cursor", async () => {
    const { markup } = await renderRoute(
      "/documentation/reference?tab=cursors",
    );
    // `lastIndexOf`: the notes above the table are in a pane with the same
    // `data-tab`, and it's the table below that has to carry the data.
    const pane = markup.slice(markup.lastIndexOf('data-tab="cursors"'));
    for (const cursor of cursors) assertStringIncludes(pane, cursor.name);
  });

  it("renders a row for every font", async () => {
    const { markup } = await renderRoute("/documentation/reference?tab=fonts");
    const pane = markup.slice(markup.lastIndexOf('data-tab="fonts"'));
    const table = pane.slice(pane.indexOf("<tbody>"), pane.indexOf("</tbody>"));
    assertEquals(rows(table), fonts.length);
    for (const font of fonts) assertStringIncludes(table, font.name);
  });

  it("renders a row for every non-zero keycode", async () => {
    const { markup } = await renderRoute(
      "/documentation/reference?tab=keycodes",
    );
    const pane = markup.slice(markup.lastIndexOf('data-tab="keycodes"'));
    const table = pane.slice(pane.indexOf("<tbody>"), pane.indexOf("</tbody>"));
    assertEquals(rows(table), inputs.filter((input) => input.value > 0).length);
  });

  it("renders a row per command of the default category", async () => {
    const { markup } = await renderRoute("/documentation/reference");
    const table = markup.slice(
      markup.indexOf('<table class="commands-table">'),
    );
    const body = table.slice(
      table.indexOf("<tbody>"),
      table.indexOf("</tbody>"),
    );
    assertEquals(rows(body), defaultCommands("Python").length);
  });
});

// The two tables that depend on the language, over all six of them. The
// language is a setting, and the server always renders every page at their
// defaults, so these seed the store around the render - see lib/render.ts.
describe("the reference tables, by language", () => {
  for (const language of LANGUAGES) {
    it(`names every command in ${language}`, () => {
      const { markup, logs } = renderIslands(
        { language },
        html` <command-table simple /> `,
      );
      assertEquals(logs, []);
      const body = markup.slice(
        markup.indexOf("<tbody>"),
        markup.indexOf("</tbody>"),
      );
      assertEquals(rows(body), defaultCommands(language).length);
      for (const command of defaultCommands(language)) {
        assertStringIncludes(body, command.names[language] as string);
      }
    });

    it(`names every colour in ${language}`, () => {
      const { markup, logs } = renderIslands(
        { language },
        html` <colour-table /> `,
      );
      assertEquals(logs, []);
      for (const colour of colours) {
        assertStringIncludes(markup, colour.names[language]);
      }
    });
  }
});
