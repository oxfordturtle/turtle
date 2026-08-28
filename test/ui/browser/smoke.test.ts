import {
  assert,
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "@std/assert";
import { afterAll, beforeAll, describe, it } from "@std/testing/bdd";
import type { Page } from "playwright-core";
import {
  type App,
  openSubmenu,
  pixel,
  startApp,
  writeProgram,
} from "./lib/app.ts";

/**
 * The acceptance pass a human would otherwise do by hand. Deliberately small:
 * six tests, each covering something no other layer can see.
 *
 * The canvas and the console are the reason this layer exists at all. Both are
 * written imperatively by the adapters rather than rendered by any component,
 * so neither the SSR layer nor the jsdom layer reaches
 * them - jsdom has no canvas, and a pixel is a pixel.
 */

let app: App;
const page = (): Page => app.page;

beforeAll(async () => {
  app = await startApp();
});

afterAll(async () => {
  await app.stop();
});

describe("running a program", () => {
  // The whole journey in one pass: an example opens from the menu, compiles,
  // runs and halts; then a program of our own draws and prints, and the pixels
  // and the console text - the two things only a real browser has - are read
  // back.
  it("opens an example, runs it, halts it, then draws and prints", async () => {
    await page().goto(app.url("/"));
    await openSubmenu(page(), "Examples");
    // A bouncing-ball example, deliberately: it never finishes, so there is
    // still something running for HALT to stop. A drawing that completes in a
    // few frames would have halted itself before the click.
    await page().locator('a[data-group="Movement"]').first().click();
    await page().locator('a[data-example="BouncingBall"]').click();
    // The example is fetched, so the click returns before the file is open.
    await page().waitForFunction(
      () =>
        (document.querySelector("system-filename input") as HTMLInputElement)
          ?.value === "BouncingBall",
    );
    assert(
      (await page().locator("system-editor textarea").inputValue()).length > 0,
    );

    await page().locator('button[title="RUN"]').click();
    // HALT enables when the machine reports it is running, which is also what
    // says the program compiled: a compile error alerts and never runs.
    await page().locator('button[title="HALT"]:not([disabled])').waitFor();
    await page().locator('button[title="HALT"]').click();
    await page().locator('button[title="HALT"][disabled]').waitFor();
    // and it drew something: the ball bounces around a white canvas.
    assertEquals(await pixel(page(), 0, 0), [255, 255, 255]);

    // Now the pixels and the text, from a program whose output is exact.
    await writeProgram(
      page(),
      "blank(green)\nforward(100)\nprint('hello from turtle')",
    );
    await page().locator('button[title="RUN"]').click();
    await page()
      .locator("canvas-tab pre.console", { hasText: "hello from turtle" })
      .waitFor();

    // `blank(green)` fills the canvas with forestgreen, #228B22.
    assertEquals(await pixel(page(), 10, 10), [34, 139, 34]);
    // and the turtle draws a black line from the centre, upwards
    assertEquals(await pixel(page(), 500, 450), [0, 0, 0]);
    assertStringIncludes(
      await page().locator("output-tab pre").innerText(),
      "hello from turtle",
    );
  });
});

describe("a link that names a language", () => {
  // The seed's own test, and the only layer that can make it. `?l=` is decided
  // twice - the layout resolves it on the server and seeds the settings store,
  // and `initialiseSettings` re-derives it in the browser through the same
  // `resolveLanguage` - and what that buys is that the two agree, so nothing
  // flips between the page arriving and the islands hydrating. Read before the
  // bundle has run, and again after.
  //
  // A *documentation* page, because that is where `?l=` wins outright: it is a
  // view parameter there. On the system page the open file decides, which the
  // test below is about.
  it("serves the language named by ?l= without a flip on hydration", async () => {
    await page().goto(app.url("/documentation/help?l=BASIC"), {
      waitUntil: "commit",
    });
    assertEquals(
      await page().locator("language-select select").inputValue(),
      "BASIC",
    );

    await page().waitForFunction(
      () => document.body.dataset.language !== undefined,
    );
    assertEquals(
      await page().locator("language-select select").inputValue(),
      "BASIC",
    );
    assertEquals(
      await page().evaluate(() => document.body.dataset.language),
      "BASIC",
    );
  });

  // The confirmed rule: on the system page the file decides, and the stored
  // value tracks it, so a link must not re-language a program someone is in the
  // middle of writing. By now this browser has a cookie (every load writes one),
  // so the stored Python wins over the link's BASIC.
  it("leaves the system's own language alone", async () => {
    await page().goto(app.url("/?l=BASIC"), { waitUntil: "commit" });
    assertEquals(
      await page().locator("language-select select").inputValue(),
      "Python",
    );
    await page().waitForFunction(
      () =>
        (
          document.querySelector("turtle-system") as HTMLElement | null
        )?.hasAttribute("tab") === true,
    );
    assertEquals(
      await page().locator("language-select select").inputValue(),
      "Python",
    );
  });
});

describe("the language stylesheet", () => {
  // The jsdom layer asserts that `<body data-language>` moves; only a browser
  // can say what the attribute *does*, because jsdom applies no stylesheet.
  // This is the one `:visible` check for the whole mechanism: if
  // style/screen/language.css were wrong, the prose for all six languages would
  // be on show at once.
  //
  // It also asserts what the rewrite was *for*: the prose is hidden by the
  // markup the server sent, not by a script afterwards - so this is read at
  // `commit`, before the bundle has run at all.
  it("takes the other languages' prose off the screen, before any script runs", async () => {
    await page().goto(app.url("/documentation/help"), { waitUntil: "commit" });
    const visible = await page()
      .locator("code[data-language]:visible")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-language")),
      );
    assert(visible.length > 0);
    assert(visible.every((language) => language === "Python"));
    assertFalse(
      await page().locator('code[data-language="BASIC"]').first().isVisible(),
    );
  });

  // and it follows a language change, which is a change rather than a
  // correction: one attribute write, and the stylesheet does the rest
  it("follows the language select", async () => {
    await page().goto(app.url("/documentation/help"));
    await page().locator("language-select select").selectOption("BASIC");
    await page()
      .locator('code[data-language="BASIC"]')
      .first()
      .waitFor({ state: "visible" });
    assertFalse(
      await page().locator('code[data-language="Python"]').first().isVisible(),
    );
    // put the shared session back, as this layer's convention requires
    await page().locator("language-select select").selectOption("Python");
  });
});

describe("the site nav and the system", () => {
  // Fullscreen takes the site nav off the screen - the system fills the window
  // - so the system's own top bar carries a second copy of the site menu
  // (src/islands/turtle-system.ts). Both copies are in the markup on every
  // system page, and which one a person sees is a stylesheet decision keyed off
  // `<body class="fullscreen">`, so this is the only layer that can check it:
  // jsdom renders the pair and applies no CSS at all.
  it("hands the site menu over to the system's top bar, and takes it back", async () => {
    await page().goto(app.url("/"));
    const inNav = page().locator(".site-nav site-menu");
    const inSystem = page().locator(".system-site-nav site-menu");
    assert(await inNav.isVisible());
    assertFalse(await inSystem.isVisible());

    await page().locator('button[title="Maximize"]').click();
    await inSystem.waitFor({ state: "visible" });
    assertFalse(await inNav.isVisible());

    // and it is a way back to the site rather than a picture of one - which is
    // the whole point of it, since the nav it stands in for is gone
    await page().locator('.system-site-nav a[href="/about"]').click();
    await page().waitForURL(/\/about$/);
    // fullscreen is still set, but it is the system's own affair: every other
    // route has its nav
    assert(await inNav.isVisible());

    // put the shared session back, as this layer's convention requires
    await page().goto(app.url("/"));
    await page().locator('button[title="Expand down"]').click();
    await inNav.waitFor({ state: "visible" });
    assertFalse(await inSystem.isVisible());
  });

  /** What is actually painted at the centre of `selector` - itself, or what covers it. */
  const covering = (selector: string): Promise<string> =>
    page().evaluate((sel) => {
      const element = document.querySelector(sel)!;
      const box = element.getBoundingClientRect();
      const top = document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      );
      return element.contains(top)
        ? "itself"
        : `${top?.tagName.toLowerCase()}.${top?.className}`;
    }, selector);

  // Stacking, which nothing below this layer resolves. A dropdown hangs out of
  // its bar and over whatever is beneath, and there are two of those to get
  // right: the nav's, which falls across the system app, and the copy's, which
  // falls across the editor. A hit test rather than a look: the row is only
  // usable if the point in the middle of it belongs to the row.
  it("opens its dropdown over the system, in either state", async () => {
    await page().goto(app.url("/"));
    const second = 'a[href="/documentation/reference"]';

    await page().locator(".site-nav site-menu .site-menu > a").click();
    assertEquals(await covering(`.site-nav ${second}`), "itself");

    await page().locator('button[title="Maximize"]').click();
    await page().locator(".system-site-nav site-menu .site-menu > a").click();
    assertEquals(await covering(`.system-site-nav ${second}`), "itself");

    // put the shared session back
    await page().locator('button[title="Expand down"]').click();
    await page().locator(".site-nav site-menu").waitFor({ state: "visible" });
  });
});

describe("the documentation code blocks", () => {
  // Backstops `highlightCodeBlocks`'s reading of the server's blocks via
  // `textContent` (src/client/passes.ts): in real Chrome, the pass must leave
  // the blocks marked up rather than showing markup as text.
  it("come out highlighted, not escaped", async () => {
    await page().goto(app.url("/documentation/help"));
    const block = page()
      .locator('code[data-language="Python"]:visible', {
        has: page().locator("span[class]"),
      })
      .first();
    await block.waitFor();
    const text = await block.innerText();
    assert(text.trim().length > 0);
    // parsed as markup: nothing of the highlighter's own output is readable
    assertFalse(text.includes("<span"));
  });
});

describe("the session", () => {
  it("brings the file and the settings back after a reload", async () => {
    await page().goto(app.url("/"));
    await writeProgram(page(), "circle(100)");
    await openSubmenu(page(), "View");
    await page().locator('label:has-text("Expert Mode") input').check();

    await page().reload();
    await page().locator("system-editor textarea").waitFor();
    assertEquals(
      await page().locator("system-editor textarea").inputValue(),
      "circle(100)",
    );
    assertFalse(await page().locator("pcode-tab .system-tab-pane").isVisible());
    // Expert mode came back with it: the PCode tab is offered again, which it
    // isn't in simple or normal mode.
    const tabs = page().locator("turtle-system .system-header select").first();
    assertEquals(
      await tabs
        .locator("option:not(.hidden)")
        .evaluateAll((options) =>
          options.map((option) => option.getAttribute("value")),
        ),
      ["canvas", "output", "usage", "comments", "syntax", "pcode", "memory"],
    );
  });
});
