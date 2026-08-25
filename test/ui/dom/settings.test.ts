import {
  assertNoWombleLogs,
  change,
  click,
  errors,
  mountRoute,
  program,
  q,
  qa,
  settings,
  settle,
  storage,
} from "../lib/setup.ts";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

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

// Rule 6: every test ends with Womble having reported nothing.
afterEach(assertNoWombleLogs);

describe("a settings control", () => {
  it("writes the provider and the session when the user changes it", async () => {
    const input = control("setting-checkbox", "showCanvasOnRun").querySelector(
      "input",
    );
    assert(input.checked);
    input.checked = false;
    await change(input);
    assertFalse(getSettings().showCanvasOnRun);
    // sessionStorage is the durable copy, written as part of the same change.
    assertEquals(sessionStorage.getItem("showCanvasOnRun"), "false");
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
    assertEquals(sessionStorage.getItem("editorFontFamily"), '"Consolas"');
    // and the consumer follows: the editor takes its font from this setting
    assertEquals(
      q("system-editor .editor").getAttribute("style"),
      "font-family: Consolas; font-size: 13px",
    );
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

// The three kinds of control that aren't just "read a value, write a value".
describe("a control that isn't a plain value", () => {
  // A disabled checkbox looks disabled, and says why when it is clicked -
  // rather than looking enabled and doing nothing. The click lands on the
  // label, because the browser swallows a disabled input's own.
  it("reports an option the online system cannot change", async () => {
    const captured: string[] = [];
    errors.setErrorHandler((error) => captured.push((error as Error).message));
    const disabled = control("setting-checkbox", "traceOnRun");
    assert(disabled.querySelector("input").disabled);
    await click(disabled.querySelector("label"));
    assertEquals(captured, [
      "This option cannot yet be modified in the online system.",
    ]);
    // and the setting is untouched
    assertFalse(getSettings().traceOnRun);
  });

  // A click on an *enabled* label is the browser forwarding it to the
  // checkbox, so the same action has to no-op there.
  it("says nothing about an option that isn't disabled", async () => {
    const captured: string[] = [];
    errors.setErrorHandler((error) => captured.push((error as Error).message));
    await click(
      control("setting-checkbox", "showCanvasOnRun").querySelector("label"),
    );
    assertEquals(captured, []);
  });

  // The radio's `value` is markup, so it is always a string; `numeric` is what
  // says the setting behind it isn't.
  it("writes a numeric radio's value as a number", async () => {
    const radio = qa("setting-radio").find(
      (element: Element) =>
        element.getAttribute("setting") === "canvasStartSize" &&
        element.getAttribute("value") === "2000",
    );
    const input = radio.querySelector("input");
    input.checked = true;
    await change(input);
    assertEquals(getSettings().canvasStartSize, 2000);
    assertEquals(sessionStorage.getItem("canvasStartSize"), "2000");
  });

  // A radio group reports the option just selected; the one it deselected
  // fires nothing of its own, and must not write its value if it ever did.
  it("ignores a change announced by a radio that isn't selected", async () => {
    const expert = qa("setting-radio").find(
      (element: Element) =>
        element.getAttribute("setting") === "mode" &&
        element.getAttribute("value") === "expert",
    );
    const input = expert.querySelector("input");
    input.checked = false;
    await change(input);
    assertEquals(getSettings().mode, "normal");
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
    assert(q("setting-checkbox input").checked);
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
    assertFalse(getSettings().showCanvasOnRun);

    await openMenu("options-menu");
    await menuCommand("options-menu", "Reset settings to default");

    assert(getSettings().showCanvasOnRun);
    // The point of the test: not the state, the *control*. A `checked=`
    // attribute would leave this `false` while the state above says `true`.
    assert(checkbox.checked);
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
    assertFalse(radio.checked);
  });

  it("closes the system menu it was run from", async () => {
    await openMenu("options-menu");
    await menuCommand("options-menu", "Reset settings to default");
    assertFalse(q("turtle-system").menu);
  });
});

// Both blocked on an account system that doesn't exist - see TODO.md 2.4.
// `saveSettings` is reached from the Options menu (controls.test.ts);
// `loadSavedSettings` has no call site yet at all, and is pinned here so that
// giving it one can't quietly change what it does.
describe("saving settings to an account", () => {
  it("reports that neither half is implemented", () => {
    const captured: string[] = [];
    errors.setErrorHandler((error) => captured.push((error as Error).message));
    settings.saveSettings();
    settings.loadSavedSettings();
    assertEquals(captured, ["Not yet implemented.", "Not yet implemented."]);
  });
});

describe("the language, which every page shares", () => {
  it("re-renders the reference tables when the header's select changes", async () => {
    await mountRoute("/documentation/reference");
    const select = q("language-select select");
    // Python's name for colour 1 is "green"; BASIC's is "GREEN".
    assert(q("colour-table td").textContent.startsWith("green"));
    select.value = "BASIC";
    await change(select);
    assertEquals(getSettings().language, "BASIC");
    assert(q("colour-table td").textContent.startsWith("GREEN"));
  });

  // `?l=` is the one query parameter with a visible effect this layer can
  // reach. It is read off `document.location` as the settings store
  // initialises; the precedence over the stored value is deliberate.
  it("takes the language from ?l= when the page is linked with one", async () => {
    await mountRoute("/?l=Pascal");
    assertEquals(getSettings().language, "Pascal");
    assertEquals(q("language-select select").value, "Pascal");
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
  });

  it("ignores a language it doesn't have", async () => {
    await mountRoute("/?l=Cobol");
    assertEquals(getSettings().language, "Python");
  });

  // `?l=` is filtered before it reaches the store; a direct write isn't, and
  // an unknown language would break the highlighter downstream.
  it("reports a language it doesn't have when one is written directly", () => {
    const captured: string[] = [];
    errors.setErrorHandler((error) => captured.push((error as Error).message));
    settings.setSetting("language", "Cobol");
    assertEquals(captured, ['Unknown language "Cobol".']);
    assertEquals(getSettings().language, "Python");
  });

  // The one setting worth a no-op check: re-adopting the language already
  // showing would mark the open file uncompiled and re-tokenize it for
  // nothing.
  it("does nothing at all when the language written is the one already showing", () => {
    program.setCode("print('hi')");
    program.compileCurrentFile();
    settings.setSetting("language", "Python");
    assert(program.getCurrentFile()?.compiled);
  });

  // `syncLanguage` is how the file memory tells this store that a file it
  // opened brought another language with it - so when it didn't, nobody is
  // told anything.
  it("notifies nobody when the file memory syncs the language already showing", () => {
    let notifications = 0;
    const unsubscribe = settings.settingsStore.subscribe(() => {
      notifications += 1;
    });
    try {
      storage.save("language", "Python");
      settings.syncLanguage();
      assertEquals(notifications, 0);

      storage.save("language", "Java");
      settings.syncLanguage();
      assertEquals(notifications, 1);
      assertEquals(getSettings().language, "Java");
    } finally {
      unsubscribe();
    }
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
    assert(
      shown.every(
        (element: Element) => element.getAttribute("data-language") === "BASIC",
      ),
    );
    assert(shown.length > 0);
  });
});
