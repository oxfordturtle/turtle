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
 * five tests, each covering something no other layer can see.
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

describe("a link into the system", () => {
  // The seed's own test, and the only layer that can make it. `?l=` is decided
  // twice - the layout seeds the settings store from it on the server, and
  // `initialiseSettings` re-derives it in the browser - and what the seed buys
  // is that the two agree, so nothing flips between the page arriving and the
  // islands hydrating. Read before the bundle has run, and again after.
  it("serves the language named by ?l= without a flip on hydration", async () => {
    await page().goto(app.url("/?l=BASIC"), { waitUntil: "commit" });
    const served = await page().locator("language-select select").inputValue();
    assertEquals(served, "BASIC");

    await page().waitForFunction(
      () =>
        (
          document.querySelector("turtle-system") as HTMLElement | null
        )?.hasAttribute("tab") === true,
    );
    assertEquals(
      await page().locator("language-select select").inputValue(),
      "BASIC",
    );

    // This layer shares one page and one session across the whole file, on
    // purpose (the last test in it is about what survives a reload), so a test
    // that changes a *persisted* setting has to put it back. `?l=` is the same
    // mechanism in reverse.
    await page().goto(app.url("/?l=Python"));
    await page().waitForFunction(
      () =>
        (
          document.querySelector(
            "language-select select",
          ) as HTMLSelectElement | null
        )?.value === "Python",
    );
  });
});

describe("the hidden class", () => {
  // The jsdom layer asserts `.hidden` lands on the right elements; only a
  // browser can say what the class *does*. This is the one `:visible` check
  // for both page-wide sweeps: if `.hidden` were not `display: none`, the
  // prose for every language would be on show at once.
  it("really takes the other languages' prose off the screen", async () => {
    await page().goto(app.url("/documentation/help"));
    await page()
      .locator("code[data-language].hidden")
      .first()
      .waitFor({ state: "attached" });
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
