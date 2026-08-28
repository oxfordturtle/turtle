import {
  assertNoWombleLogs,
  change,
  mountRoute,
  q,
  qa,
  settle,
} from "../lib/setup.ts";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

// Mode visibility is decided in exactly one way now: every component derives it
// from the settings store through `hiddenUnless`, and the server derives the
// same answer, because the mode is one of the five cookie fields. So a pane that
// should be hidden arrives hidden rather than being hidden afterwards.
//
// There used to be a second mechanism - a page-wide `modeVisibility` sweep over
// `[data-mode]`. It never did anything: the markup it was written for spells the
// attribute `modes`, so it swept an empty list on every route, and the test that
// appeared to cover it asserted `[].every(...)`, which is vacuously true. It is
// gone, and so is `validateTab`, the command it used to send.

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

// Rule 6: every test ends with Womble having reported nothing.
afterEach(assertNoWombleLogs);

describe("changing the mode", () => {
  it("hides the panes that don't belong to it", async () => {
    await setMode("simple");
    assert(pane("pcode").includes("hidden"));
    assert(pane("usage").includes("hidden"));
    assertFalse(pane("canvas").includes("hidden"));
    assertFalse(pane("output").includes("hidden"));
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
      assertFalse(pane(tab).includes("hidden"));
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

  // The fallback, which is now *derived* rather than corrected: the chosen tab
  // is kept, and simply isn't the one shown while this mode hasn't got it. That
  // is better than the old behaviour, which overwrote the choice - so leaving
  // Expert mode and coming back used to lose your PCode tab, and now doesn't.
  it("shows the canvas instead when the active tab isn't in this mode", async () => {
    // PCode belongs to Expert and Machine, so this is a mode that has it
    await setMode("expert");
    system().tab = "pcode";
    await settle();
    assert(pane("pcode").includes("active"));

    await setMode("simple");
    assert(pane("canvas").includes("active"));
    assertFalse(pane("pcode").includes("active"));
    // the choice itself survives, unoverwritten
    assertEquals(system().tab, "pcode");
  });

  it("gives the tab back when the mode that has it returns", async () => {
    await setMode("expert");
    system().tab = "pcode";
    await settle();
    await setMode("simple");
    assert(pane("canvas").includes("active"));

    await setMode("expert");
    assert(pane("pcode").includes("active"));
    assertEquals(qa(".system-tab-pane.active").length, 1);
  });

  it("leaves the active tab alone when it survives the change", async () => {
    system().tab = "output";
    await settle();
    await setMode("simple");
    assertEquals(system().tab, "output");
  });

  // The menu's own mode-conditional controls, which carry `modes` and derive
  // `hidden` from it in their own render - the same mechanism the panes use.
  // This is what the old vacuous `[data-mode]` assertion was reaching for.
  it("hides the menu controls that don't belong to it", async () => {
    await setMode("simple");
    q("turtle-system").menu = true;
    await settle();
    // an empty `modes` means every mode, so only the ones that name modes are
    // making a decision here
    const conditional = qa("setting-checkbox[modes]").filter(
      (control: Element) => control.getAttribute("modes") !== "",
    );
    assert(conditional.length > 0);
    for (const control of conditional) {
      const modes = (control.getAttribute("modes") ?? "").split(",");
      assertEquals(
        control.querySelector("label").classList.contains("hidden"),
        !modes.includes("simple"),
      );
    }
    assert(pane("pcode").includes("hidden"));
  });
});

describe("choosing a tab", () => {
  it("shows exactly one pane, from the header's select", async () => {
    const select = q("turtle-system .system-header select");
    // a tab the default (normal) mode actually offers, so what is asserted is
    // the select, not the mode derivation above
    select.value = "usage";
    await change(select);
    assertEquals(system().tab, "usage");
    assertEquals(qa(".system-tab-pane.active").length, 1);
    assert(pane("usage").includes("active"));
  });
});
