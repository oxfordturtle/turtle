import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { html } from "@merivale/womble";
import {
  cookieFields,
  defaults,
  type Property,
} from "@/client/constants/properties.ts";
import {
  COOKIE_NAME,
  parseCookie,
  serialiseCookie,
} from "@/client/state/cookie.ts";
import {
  type SettingName,
  type Settings,
  settingNames,
} from "@/islands/settings.ts";
import "@/islands/turtle-system/index.ts";
import { renderIslands, renderRoute } from "./lib/render.ts";

// The cookie is the whole of what a request tells the server about who is
// asking, and the only reason it exists is so that the markup we *send* is
// already right - no first render that a script has to correct.
//
// Three things are worth holding to account, and the third is the one that will
// still be earning its keep in a year.

describe("the cookie's format", () => {
  it("round-trips every field, with its type", () => {
    const values = {
      language: "BASIC",
      mode: "machine",
      fullscreen: true,
      editorFontFamily: "Consolas",
      editorFontSize: 20,
    };
    assertEquals(
      parseCookie(`${COOKIE_NAME}=${serialiseCookie(values)}`),
      values,
    );
  });

  it("survives a font family with a space in it", () => {
    const values = { ...defaults, editorFontFamily: "Lucida Sans Typewriter" };
    const parsed = parseCookie(`${COOKIE_NAME}=${serialiseCookie(values)}`);
    assertEquals(parsed.editorFontFamily, "Lucida Sans Typewriter");
  });

  // A cookie is user-editable and long-lived, so every way of mangling one has
  // to end in "fall back to the default" rather than in a broken page.
  it("reads what it can out of a damaged one, and no more", () => {
    assertEquals(parseCookie(null), {});
    assertEquals(parseCookie(""), {});
    assertEquals(parseCookie("other=1; unrelated=2"), {});
    assertEquals(parseCookie(`${COOKIE_NAME}=garbage`), {});
    // a field that isn't one of ours, a number that isn't one, a boolean that
    // isn't one - each dropped on its own, the readable ones kept
    assertEquals(
      parseCookie(
        `${COOKIE_NAME}=language:Java|nonsense:1|editorFontSize:big|fullscreen:maybe`,
      ),
      { language: "Java" },
    );
  });

  it("is found among other cookies", () => {
    assertEquals(
      parseCookie(`before=1; ${COOKIE_NAME}=mode:expert; after=2`).mode,
      "expert",
    );
  });
});

describe("what the server does with it", () => {
  it("renders the language it names, in the markup and the seed", async () => {
    const { markup } = await renderRoute("/", {
      cookie: { language: "BASIC" },
    });
    assertEquals(
      markup.includes('<option value="BASIC" selected>'),
      true,
      "the language select is already on BASIC",
    );
    assertEquals(markup.includes('<option value="Python" selected>'), false);
  });

  it("renders the mode it names, in the panes and the tab options", async () => {
    const { markup } = await renderRoute("/", { cookie: { mode: "machine" } });
    // Run Settings belongs to Machine mode alone, so in any other mode its pane
    // arrives hidden and its tab option with it
    assertFalse(
      markup
        .slice(markup.indexOf("<options-tab"))
        .startsWith(
          '<options-tab active=""><div class="system-tab-pane hidden">',
        ),
    );
    assertStringIncludesOption(markup, "options");
  });

  it("renders the editor font it names", async () => {
    const { markup } = await renderRoute("/", {
      cookie: { editorFontFamily: "Consolas", editorFontSize: 20 },
    });
    assertEquals(
      markup.includes('style="font-family: Consolas; font-size: 20px"'),
      true,
      "the editor already has the stored font",
    );
  });

  // A first-ever visitor sends no cookie at all and gets the defaults - the same
  // page as someone whose cookie happens to hold them, which is what makes the
  // browser's own `initialiseSettings` agree with the seed either way.
  //
  // The `<head>`'s seed script is the one thing that does differ: a request with
  // no cookie has only the resolved language to say, while one carrying the
  // defaults says all five. Both leave the store on the same values, so the page
  // is identical - which is what this compares.
  it("serves a first-ever visitor the same page as a defaults cookie", async () => {
    const bare = await renderRoute("/");
    const explicit = await renderRoute("/", { cookie: {} });
    assertEquals(body(bare.markup), body(explicit.markup));
    assert(body(bare.markup).length > 0);
  });
});

/** everything from `<body` on, which is the page proper without the head's seed script */
const body = (markup: string): string => markup.slice(markup.indexOf("<body"));

/** the tab `<select>`'s options that are not hidden in this render */
const assertStringIncludesOption = (markup: string, tab: string): void => {
  const select = markup.slice(
    markup.indexOf("<select"),
    markup.indexOf("</select>"),
  );
  assert(select.includes(`<option value="${tab}" class=""`));
};

// ---------------------------------------------------------------------------

/**
 * **The test that keeps `cookieFields` honest.**
 *
 * The five fields are derived from what today's markup happens to depend on,
 * and that will drift the moment someone renders a new setting into a visible
 * control. So: flip each persisted setting in turn, and diff the markup a
 * *visitor can see* - the menu is closed on arrival and eight of the nine panes
 * are inactive, so anything that only changes those is corrected where nobody
 * is looking, and is deliberately not worth a cookie field.
 *
 * A setting that changes the visible markup and is not in `cookieFields` fails
 * here, and whoever added it has to either put it in the cookie or say why it
 * belongs in the exceptions below.
 */
describe("cookieFields is exactly the settings the first paint depends on", () => {
  /**
   * Settings that reach visible markup but still don't need a cookie. Both of
   * these render into the pane wrapper's custom properties for the console's
   * font - and the console on a freshly loaded page is empty, so there is no
   * text for the wrong font to be wrong about. See src/README.md.
   */
  const EXCUSED: readonly SettingName[] = [
    "outputFontFamily",
    "outputFontSize",
  ];

  /** A different value of the right type, so flipping means something. */
  const other = (name: SettingName): string | number | boolean => {
    const current = defaults[name as Property];
    if (typeof current === "boolean") return !current;
    if (typeof current === "number") return current + 7;
    if (name === "language") return "BASIC";
    if (name === "mode") return "machine";
    return "Consolas";
  };

  /**
   * The markup a visitor actually sees on arrival: without the menu rail, which
   * starts closed, and without the eight panes that start inactive.
   */
  const visible = (markup: string): string => {
    let rest = markup.replace(
      /<nav class="system-menu[^"]*">[\s\S]*?<\/nav>/,
      "",
    );
    for (const tag of PANES) {
      rest = rest.replace(
        new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`),
        (whole, inner: string) =>
          inner.includes('class="system-tab-pane active') ? whole : "",
      );
    }
    return rest;
  };

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

  const render = (settings: Partial<Settings>): string =>
    visible(renderIslands(settings, html` <turtle-system /> `).markup);

  // a write whose key is a variable, as everywhere else that walks `settingNames`
  const flip = <K extends SettingName>(name: K): Partial<Settings> => {
    const settings: Partial<Settings> = {};
    settings[name] = other(name) as Settings[K];
    return settings;
  };

  const base = () => render({});

  for (const name of settingNames) {
    it(`${name} is in the cookie if and only if it shows`, () => {
      const flipped = render(flip(name));
      const shows = flipped !== base();
      const carried = (cookieFields as readonly string[]).includes(name);
      if (EXCUSED.includes(name)) return;
      assertEquals(
        shows,
        carried,
        shows
          ? `${name} changes the first paint but is not a cookie field - add it to cookieFields, or excuse it here with a reason`
          : `${name} is a cookie field but changes nothing a visitor sees - it may not need to be one`,
      );
    });
  }
});
