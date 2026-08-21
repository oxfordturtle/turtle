import {
  assert,
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { html } from "@merivale/womble";
import modes from "@/client/constants/modes.ts";
import { getSettings } from "@/islands/settings.ts";
import "@/islands/turtle-system/index.ts";
import { customTags, renderIslands, renderRoute } from "./lib/render.ts";

// What the `/` route sends. `src/pages/index.ts` renders one tag, so
// everything below is `<turtle-system>`'s own render and the subtree it
// writes - which makes this the test that the app is still made of the
// components it says it is.

/** the nine tab panes `<turtle-system>` writes into `.system-tabs` */
const PANES = [
  "canvas-tab",
  "output-tab",
  "usage-tab",
  "comments-tab",
  "syntax-tab",
  "variables-tab",
  "pcode-tab",
  "memory-tab",
  "options-tab",
];

/** the seven submenus it writes into the menu rail */
const MENUS = [
  "file-menu",
  "edit-menu",
  "view-menu",
  "compile-menu",
  "run-menu",
  "options-menu",
  "examples-menu",
];

describe("the system page", () => {
  it("is one <turtle-system> tag, expanded", async () => {
    const { markup } = await renderRoute("/");
    assertStringIncludes(markup, "<turtle-system ");
    assertStringIncludes(markup, "</turtle-system>");
    assertStringIncludes(markup, '<div class="system-body">');
  });

  for (const tag of [...PANES, ...MENUS, "system-editor", "system-filename"]) {
    it(`renders <${tag}>`, async () => {
      const { markup } = await renderRoute("/");
      assert(customTags(markup).has(tag));
    });
  }

  it("renders the nine panes inside the tab container", async () => {
    const { markup } = await renderRoute("/");
    const tabs = markup.slice(markup.indexOf('<div class="system-tabs">'));
    for (const pane of PANES) assertStringIncludes(tabs, `<${pane}`);
    assertEquals(
      (tabs.match(/class="system-tab-pane[^"]*"/g) ?? []).length,
      PANES.length,
    );
  });

  it("shows the canvas pane by default", async () => {
    const { markup } = await renderRoute("/");
    // A pane doesn't render the active tab's name anywhere — it takes
    // `active` as a prop and turns it into a class — so what says the canvas
    // is the one on show is the class it derived from that prop.
    assertStringIncludes(
      markup.slice(markup.indexOf("<canvas-tab")),
      '<div class="system-tab-pane active">',
    );
    assertStringIncludes(markup, '<canvas width="1000" height="1000">');
    assertEquals(
      (markup.match(/class="system-tab-pane active"/g) ?? []).length,
      1,
    );
  });

  // The `?l=`/`?x=`/`?f=` parameters are not rendered onto this tag: both
  // readers take them off `document.location`. `?x=` and `?f=` are purely
  // client facts (tested in test/ui/browser/); `?l=` is not, because the layout
  // seeds the settings store from it per request.
  it("sends the same markup whatever file the link asked to open", async () => {
    const plain = await renderRoute("/");
    const linked = await renderRoute("/?x=hello&f=program.tpas");
    assertEquals(linked.markup, plain.markup);
    const tag = linked.markup.slice(
      linked.markup.indexOf("<turtle-system"),
      linked.markup.indexOf(">", linked.markup.indexOf("<turtle-system")),
    );
    assertFalse(/url/i.test(tag));
  });
});

// The acceptance test for per-request seeding, via Womble's `withStores` and
// `storeSeeds`: `/?l=BASIC` serves markup already in BASIC, with no client-side
// correction and no flash.
describe("the system page, seeded from the link's ?l=", () => {
  it("serves a language the link asked for, and says so in the seed script", async () => {
    const { markup, logs } = await renderRoute("/?l=BASIC");
    assertStringIncludes(
      markup,
      '<script type="application/json" data-womble-stores>' +
        '{"settings":{"language":"BASIC"}}</script>',
    );
    assertStringIncludes(markup, '<option value="BASIC" selected>');
    assertEquals(logs.length, 0);
  });

  it("ignores a language this system doesn't have, seeding nothing", async () => {
    const { markup } = await renderRoute("/?l=Cobol");
    assertStringIncludes(
      markup,
      '<script type="application/json" data-womble-stores>{}</script>',
    );
    assertFalse(markup.includes('<option value="Cobol"'));
  });

  // What the scope is *for*. A module-level store is process-global on a
  // server, so without it the first of these two requests would decide the
  // second - and every one after it.
  it("leaves no residue for the next request, or for the module", async () => {
    const seeded = await renderRoute("/?l=BASIC");
    const plain = await renderRoute("/");
    const fresh = await renderRoute("/");

    assertFalse(seeded.markup === plain.markup);
    assertEquals(plain.markup, fresh.markup);
    assertEquals(getSettings().language, "Python");
  });

  // Every page reads the language, not just the system one - so the reference
  // tables are served in BASIC too, where they used to be rendered in Python
  // and swapped client-side.
  it("seeds the documentation pages just the same", async () => {
    const { markup } = await renderRoute("/documentation/reference?l=BASIC");
    assertStringIncludes(
      markup,
      '<script type="application/json" data-womble-stores>' +
        '{"settings":{"language":"BASIC"}}</script>',
    );
  });
});

// The mode is a setting, and the server always renders every page at their
// defaults (the stored mode is a browser fact) - so the modes are routed over
// by seeding the settings store around the render. See lib/render.ts's
// `renderIslands`.
describe("the system page, by mode", () => {
  // which tabs the header's <select> offers, per src/islands/turtle-system.ts
  const offered: Record<string, string[]> = {
    simple: ["canvas", "output"],
    normal: ["canvas", "output", "usage"],
    expert: [
      "canvas",
      "output",
      "usage",
      "comments",
      "syntax",
      "pcode",
      "memory",
    ],
    machine: [
      "canvas",
      "output",
      "usage",
      "comments",
      "syntax",
      "pcode",
      "memory",
      "options",
    ],
  };

  for (const mode of modes) {
    it(`hides the tab options that don't belong to ${mode} mode`, () => {
      const { markup, logs } = renderIslands(
        { mode },
        html` <turtle-system /> `,
      );
      assertEquals(logs, []);
      const select = markup.slice(
        markup.indexOf("<select"),
        markup.indexOf("</select>"),
      );
      const options = Array.from(
        select.matchAll(/<option value="([a-z]+)" class="([^"]*)"/g),
      );
      assertEquals(
        options.filter((option) => option[2] !== "hidden").map((o) => o[1]),
        offered[mode],
      );
    });
  }

  it("hides a file-menu command outside the modes it belongs to", () => {
    const simple = renderIslands({ mode: "simple" }, html` <file-menu /> `);
    const expert = renderIslands({ mode: "expert" }, html` <file-menu /> `);
    assertStringIncludes(
      simple.markup,
      '<a class="hidden" on-click="notImplemented"><span>Print program</span>',
    );
    assertStringIncludes(
      expert.markup,
      '<a class="" on-click="notImplemented"><span>Print program</span>',
    );
  });
});
