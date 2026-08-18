import {
  assertNoWombleLogs,
  change,
  mountRoute,
  q,
  qa,
  settle,
} from "../_setup.ts";
import { assertEquals } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";

// Mode visibility is decided in two different ways at once, and they must not
// fight.
//
// - The page-wide `modeVisibility` pass (src/client/passes.ts) sweeps the
//   document for `[data-mode]` and toggles `.hidden`. That's the right call for
//   the elements it covers - static, server-rendered documentation prose that
//   no island owns. It runs at startup and again on every settings change.
// - Anything *inside* an island derives its own visibility from the mode
//   instead, because the sweep runs before the islands hydrate and their first
//   render would wipe whatever it had just set. The nine tab panes deliberately
//   carry no `data-mode` for precisely that reason.
//
// The third piece is `validateTab`: a pane the mode change has just hidden
// can't be the one on show, and the pass can't work that out for itself any
// more, so it asks the system (see commands.test.ts).

// deno-lint-ignore no-explicit-any
const system = (): any => q("turtle-system");

const setMode = async (mode: string): Promise<void> => {
  const radio = qa("setting-radio")
    .find(
      (element: Element) =>
        element.getAttribute("setting") === "mode" &&
        element.getAttribute("value") === mode,
    )
    .querySelector("input");
  radio.checked = true;
  await change(radio);
};

/** a pane's class list, which is where both of its visibility decisions land */
const pane = (tab: string): string => q(`${tab}-tab > div`).className;

beforeEach(async () => {
  await mountRoute("/");
});

describe("changing the mode", () => {
  it("hides the panes that don't belong to it", async () => {
    await setMode("simple");
    assertEquals(pane("pcode").includes("hidden"), true);
    assertEquals(pane("usage").includes("hidden"), true);
    assertEquals(pane("canvas").includes("hidden"), false);
    assertEquals(pane("output").includes("hidden"), false);
    assertNoWombleLogs();
  });

  it("shows them again in a mode they do belong to", async () => {
    await setMode("simple");
    await setMode("machine");
    for (const tab of [
      "canvas",
      "output",
      "usage",
      "pcode",
      "memory",
      "options",
    ]) {
      assertEquals(pane(tab).includes("hidden"), false);
    }
  });

  it("hides the tab options that don't belong to it", async () => {
    await setMode("simple");
    // The header's *first* select is the tab list; the second is the language
    // (`<language-select>`, an island of its own).
    const options = qa("option", q("turtle-system .system-header select"));
    const shown = options
      .filter((option: Element) => !option.classList.contains("hidden"))
      .map((option: Element) => option.getAttribute("value"));
    assertEquals(shown, ["canvas", "output"]);
  });

  // The fallback: the tab on show was in a mode that has just gone away.
  it("falls back to the canvas when the active tab goes away", async () => {
    system().tab = "pcode";
    await settle();
    assertEquals(pane("pcode").includes("active"), true);
    await setMode("simple");
    assertEquals(system().tab, "canvas");
    assertEquals(pane("canvas").includes("active"), true);
    assertNoWombleLogs();
  });

  it("leaves the active tab alone when it survives the change", async () => {
    system().tab = "output";
    await settle();
    await setMode("simple");
    assertEquals(system().tab, "output");
  });

  // The two mechanisms, in one assertion: the sweep sets `.hidden` on the
  // menu's own `[data-mode]` markup, the panes derive theirs, and neither
  // undoes the other's work on the next render.
  it("leaves the swept elements and the derived ones agreeing", async () => {
    await setMode("simple");
    q("turtle-system").menu = true;
    await settle();
    const swept = qa("[data-mode]").filter((element: Element) =>
      (element.getAttribute("data-mode") ?? "").split(",").includes("simple"),
    );
    assertEquals(
      swept.every((element: Element) => !element.classList.contains("hidden")),
      true,
    );
    assertEquals(pane("pcode").includes("hidden"), true);
    assertNoWombleLogs();
  });
});

describe("choosing a tab", () => {
  it("shows exactly one pane, from the header's select", async () => {
    const select = q("turtle-system .system-header select");
    select.value = "memory";
    await change(select);
    assertEquals(system().tab, "memory");
    assertEquals(qa(".system-tab-pane.active").length, 1);
    assertEquals(pane("memory").includes("active"), true);
    assertNoWombleLogs();
  });
});
