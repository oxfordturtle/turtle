import {
  assertNoWombleLogs,
  change,
  click,
  mountRoute,
  q,
  qa,
  settings,
  settle,
} from "../_setup.ts";
import { assertEquals } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";

// The settings store (src/islands/settings.ts) owns every persisted setting,
// and the ~40 controls scattered through the system menu, the system header
// and the documentation pages read and write it. None of that is visible in
// server markup, and the failure mode is a control that displays a stale value
// while the setting underneath it is right.
//
// The `.checked=`/`.value=` property bindings are the specific thing here:
// These controls carry property bindings rather than plain attributes. An
// attribute sets a control's *reset default*, not its live value, so shipping
// them as attributes was a bug invisible until something outside the control
// changed the setting - which is exactly what these tests do.

const getSettings = (): Record<string, unknown> => settings.getSettings();

// deno-lint-ignore no-explicit-any
const control = (kind: string, setting: string): any =>
  qa(kind).find(
    (element: Element) => element.getAttribute("setting") === setting,
  );

const openMenu = async (menu: string): Promise<void> => {
  await click(q(`${menu} > div > a`));
};

const menuCommand = async (menu: string, label: string): Promise<void> => {
  const links = qa(`${menu} .system-sub-menu.open a`);
  await click(links.find((a: Element) => a.textContent?.includes(label)));
};

beforeEach(async () => {
  await mountRoute("/");
});

describe("a settings control", () => {
  it("writes the provider and the session when the user changes it", async () => {
    const input = control("setting-checkbox", "showCanvasOnRun").querySelector(
      "input",
    );
    assertEquals(input.checked, true);
    input.checked = false;
    await change(input);
    assertEquals(getSettings().showCanvasOnRun, false);
    // sessionStorage is the durable copy, written as part of the same change.
    assertEquals(sessionStorage.getItem("showCanvasOnRun"), "false");
    assertNoWombleLogs();
  });

  it("writes a number setting as a number", async () => {
    const input = control("setting-number", "editorFontSize").querySelector(
      "input",
    );
    input.value = "20";
    await change(input);
    assertEquals(getSettings().editorFontSize, 20);
    assertEquals(sessionStorage.getItem("editorFontSize"), "20");
  });

  it("writes a select setting", async () => {
    const select = control("setting-select", "editorFontFamily").querySelector(
      "select",
    );
    select.value = "Consolas";
    await change(select);
    assertEquals(getSettings().editorFontFamily, "Consolas");
  });

  it("reaches the component that consumes it", async () => {
    const input = control("setting-number", "editorFontSize").querySelector(
      "input",
    );
    input.value = "22";
    await change(input);
    assertEquals(
      q("system-editor .editor").getAttribute("style"),
      "font-family: Courier; font-size: 22px",
    );
  });
});

// A control mounted with no page around it renders the settings anyway: the
// store is a module, not an ancestor, so there is nothing for it to fail to
// find - which a provider-based version could not say.
describe("a control mounted on its own", () => {
  it("still reads the settings", async () => {
    document.body.innerHTML =
      '<setting-checkbox setting="showCanvasOnRun" label="Show Canvas on RUN"></setting-checkbox>';
    await settle();
    assertEquals(q("setting-checkbox input").checked, true);
    assertNoWombleLogs();
  });
});

describe("resetting the settings to their defaults", () => {
  it("puts every checkbox's live value back", async () => {
    const checkbox = control(
      "setting-checkbox",
      "showCanvasOnRun",
    ).querySelector("input");
    checkbox.checked = false;
    await change(checkbox);
    assertEquals(getSettings().showCanvasOnRun, false);

    await openMenu("options-menu");
    await menuCommand("options-menu", "Reset settings to default");

    assertEquals(getSettings().showCanvasOnRun, true);
    // The point of the test: not the state, the *control*. A `checked=`
    // attribute would leave this `false` while the state above says `true`.
    assertEquals(checkbox.checked, true);
    assertNoWombleLogs();
  });

  it("puts every number input's live value back", async () => {
    const input = control("setting-number", "editorFontSize").querySelector(
      "input",
    );
    input.value = "20";
    await change(input);
    await openMenu("options-menu");
    await menuCommand("options-menu", "Reset settings to default");
    assertEquals(getSettings().editorFontSize, 13);
    assertEquals(input.value, "13");
  });

  it("puts every radio's live value back", async () => {
    const expert = qa("setting-radio").find(
      (element: Element) =>
        element.getAttribute("setting") === "mode" &&
        element.getAttribute("value") === "expert",
    );
    const radio = expert.querySelector("input");
    radio.checked = true;
    await change(radio);
    assertEquals(getSettings().mode, "expert");
    await openMenu("options-menu");
    await menuCommand("options-menu", "Reset settings to default");
    assertEquals(getSettings().mode, "normal");
    assertEquals(radio.checked, false);
  });

  it("closes the system menu it was run from", async () => {
    await openMenu("options-menu");
    await menuCommand("options-menu", "Reset settings to default");
    assertEquals(q("turtle-system").menu, false);
  });
});

describe("the language, which every page shares", () => {
  it("re-renders the reference tables when the header's select changes", async () => {
    await mountRoute("/documentation/reference");
    const select = q("language-select select");
    // Python's name for colour 1 is "green"; BASIC's is "GREEN".
    assertEquals(q("colour-table td").textContent.startsWith("green"), true);
    select.value = "BASIC";
    await change(select);
    assertEquals(getSettings().language, "BASIC");
    assertEquals(q("colour-table td").textContent.startsWith("GREEN"), true);
    assertNoWombleLogs();
  });

  // `?l=` is the one query parameter with a visible effect this layer can
  // reach. It is read off `document.location` as the settings store
  // initialises; the precedence over the stored value is deliberate.
  it("takes the language from ?l= when the page is linked with one", async () => {
    await mountRoute("/?l=Pascal");
    assertEquals(getSettings().language, "Pascal");
    assertEquals(q("language-select select").value, "Pascal");
    assertNoWombleLogs();
  });

  it("lets ?l= beat the language already in the session", async () => {
    const select = q("language-select select");
    select.value = "BASIC";
    await change(select);
    assertEquals(getSettings().language, "BASIC");
    // A second page load in the same session: the stored BASIC is what this
    // mount reconciles against, and ?l= has to win anyway.
    await mountRoute("/?l=Pascal", { keepSession: true });
    assertEquals(getSettings().language, "Pascal");
    assertNoWombleLogs();
  });

  it("ignores a language it doesn't have", async () => {
    await mountRoute("/?l=Cobol");
    assertEquals(getSettings().language, "Python");
  });

  it("hides the prose written for the other five languages", async () => {
    await mountRoute("/documentation/reference");
    const select = q("language-select select");
    select.value = "BASIC";
    await change(select);
    await settle();
    const shown = qa("code[data-language]").filter(
      (element: Element) => !element.classList.contains("hidden"),
    );
    assertEquals(
      shown.every(
        (element: Element) => element.getAttribute("data-language") === "BASIC",
      ),
      true,
    );
    assertEquals(shown.length > 0, true);
  });
});
