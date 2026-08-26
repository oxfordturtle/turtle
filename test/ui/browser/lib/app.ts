import { type Browser, chromium, type Page } from "playwright-core";
import router from "@/pages/router.ts";

/**
 * Layer 3's harness: the real app, in a real browser.
 *
 * **The server is this process.** `app.ts` is `Deno.serve(router)` and nothing
 * else, so the suite serves the same router it tests, on a port of its own.
 * That is not a nicety: a long-lived `deno task start` on :8000 left over from
 * an earlier session serves pre-edit markup against a freshly built client
 * bundle, which presents exactly like a hydration bug. Nothing here can attach
 * to it.
 *
 * **The client bundle is not built here.** `deno task build` writes
 * `assets/build/index.js` and `assets/build/screen.css`, the router serves them
 * out of `assets/`, and a page without them hydrates into nothing at all - so
 * `startApp` checks for the bundle and says so rather than leaving the whole
 * suite to fail with a puzzle.
 */

const PORT = 8321;

const BUNDLE = "assets/build/index.js";

export type App = {
  url: (path: string) => string;
  page: Page;
  stop: () => Promise<void>;
};

/** Serves the app, opens a browser on it, and hands back a page and the way to close both. */
export const startApp = async (): Promise<App> => {
  await assertBuilt();
  const server = Deno.serve({ port: PORT, onListen: () => {} }, router);
  const browser = await launch();
  const page = await browser.newPage();
  // Long enough for a real page load and a compile, short enough that a
  // selector that will never match fails while you are still watching.
  page.setDefaultTimeout(10_000);
  return {
    url: (path: string) => `http://localhost:${PORT}${path}`,
    page,
    stop: async () => {
      await browser.close();
      await server.shutdown();
    },
  };
};

/**
 * Chrome, not Playwright's own chromium: this repo has never downloaded the
 * bundled browsers (`playwright-core` doesn't ship them at all), and the
 * installed Google Chrome is what every manual check has used. The fallback is
 * for a machine - CI, most likely - that has the chromium download but no
 * Chrome channel.
 */
const launch = async (): Promise<Browser> => {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return await chromium.launch();
  }
};

const assertBuilt = async (): Promise<void> => {
  try {
    await Deno.stat(BUNDLE);
  } catch {
    throw new Error(
      `${BUNDLE} is missing: run \`deno task build\` before \`deno task test:ui:browser\`.`,
    );
  }
};

/** The colour of the pixel at `(x, y)` on the turtle's canvas, as `[r, g, b]`. */
export const pixel = (
  page: Page,
  x: number,
  y: number,
): Promise<[number, number, number]> =>
  page.evaluate(
    ([x, y]) => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      const data = canvas.getContext("2d")!.getImageData(x, y, 1, 1).data;
      // one pixel is always four bytes of RGBA
      return [data[0]!, data[1]!, data[2]!] as [number, number, number];
    },
    [x, y] as [number, number],
  );

/** Types `code` into the editor, replacing whatever was there. */
export const writeProgram = async (page: Page, code: string): Promise<void> => {
  const editor = page.locator("system-editor textarea");
  await editor.fill(code);
  // The store takes the text on `input`, which `fill` fires; this waits for
  // the re-render it sets off rather than for a fixed delay.
  await page
    .locator("system-editor .line-numbers li")
    .nth(code.split("\n").length - 1)
    .waitFor();
};

/** Opens one of the system menu's submenus by its label. */
export const openSubmenu = async (page: Page, label: string): Promise<void> => {
  await page.locator('button[aria-label="system menu"]').click();
  await page
    .locator(`.system-menu > * > div > a:has(span:text-is("${label}"))`)
    .click();
};
