import {
  assertNoWombleLogs,
  click,
  commands,
  mountRoute,
  program,
  q,
  qa,
  settings,
  settle,
} from "../_setup.ts";
import { assertEquals } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";

// `src/islands/turtle-system/commands.ts` is how code that isn't inside a
// component's own subtree asks that component to do something.
//
// Nothing below names the event, the effect or the action - only the exported
// function and what the user then sees - so the tests survive a change of
// mechanism. Keep it that way.

// deno-lint-ignore no-explicit-any
const system = (): any => q("turtle-system");

beforeEach(async () => {
  await mountRoute("/");
});

describe("requestTab", () => {
  // What the machine asks for on RUN, on output, and on a memory dump.
  it("shows the tab it asks for", async () => {
    commands.requestTab("output");
    await settle();
    assertEquals(system().tab, "output");
    assertEquals(qa("output-tab .system-tab-pane.active").length, 1);
    assertNoWombleLogs();
  });

  it("dismisses the menu with it", async () => {
    await click(q("turtle-system .system-header button"));
    assertEquals(system().menu, true);
    commands.requestTab("memory");
    await settle();
    assertEquals(system().menu, false);
  });
});

describe("requestValidTab", () => {
  // Sent by the page-wide mode-visibility pass, which can't work it out itself:
  // the panes are components carrying no `data-mode` for it to find.
  it("falls back to the canvas when the active tab isn't in this mode", async () => {
    // The mode first, then the tab: changing the mode notifies the store, and
    // the pass that follows it asks for this by itself. Doing it the other way
    // round would leave nothing for the call below to do.
    settings.setSetting("mode", "simple");
    await settle();
    system().tab = "syntax";
    await settle();
    commands.requestValidTab();
    await settle();
    assertEquals(system().tab, "canvas");
    assertNoWombleLogs();
  });

  it("leaves a tab that is in this mode alone", async () => {
    system().tab = "output";
    await settle();
    commands.requestValidTab();
    await settle();
    assertEquals(system().tab, "output");
  });
});

describe("requestCloseMenu", () => {
  // The settings provider's `resetDefaults`, which is reached through the
  // system menu and so has to dismiss it. What "closed" means is the system's
  // to define - a submenu left open is still open menu chrome - which is why
  // this is an action rather than a `menu = false` from outside.
  it("closes the menu and the submenu it had open", async () => {
    // The toggle link in the collapsed rail, which opens the menu with it.
    await click(q("options-menu > div > a"));
    assertEquals(system().menu, true);
    assertEquals(system().submenu, "options");

    commands.requestCloseMenu();
    await settle();
    assertEquals(system().menu, false);
    assertEquals(system().submenu, "");
    assertNoWombleLogs();
  });
});

describe("requestSelectAll", () => {
  // The Edit menu's "Select All", which reaches into `<system-editor>`.
  it("selects the whole program in the editor", async () => {
    program.setCode("print('hello')");
    await settle();
    commands.requestSelectAll();
    const textarea = q("system-editor textarea") as HTMLTextAreaElement;
    assertEquals(textarea.selectionStart, 0);
    assertEquals(textarea.selectionEnd, "print('hello')".length);
    assertNoWombleLogs();
  });
});

// Not one of ./commands.ts's channels: `syncLanguage` is a store function, and
// the file memory calls it directly. It was a command while the settings were
// an island, for exactly the reason the rest of this file exists - `program.ts`
// is not a component and had no way in - and it belongs here because what it
// has to do is unchanged.
describe("syncLanguage", () => {
  // How the file memory tells the settings store that the language has moved
  // under it - opening or switching to a file in another language stores the
  // new value and then asks the store to re-read it.
  it("makes the store adopt the stored language", async () => {
    sessionStorage.setItem("language", JSON.stringify("Java"));
    settings.syncLanguage();
    await settle();
    assertEquals(settings.getSettings().language, "Java");
    assertEquals(q("language-select select").value, "Java");
    assertNoWombleLogs();
  });

  it("re-runs the language-visibility pass with it", async () => {
    await mountRoute("/documentation/reference");
    sessionStorage.setItem("language", JSON.stringify("C"));
    settings.syncLanguage();
    await settle();
    const shown = qa("code[data-language]").filter(
      (element: Element) => !element.classList.contains("hidden"),
    );
    assertEquals(shown.length > 0, true);
    assertEquals(
      shown.every(
        (element: Element) => element.getAttribute("data-language") === "C",
      ),
      true,
    );
  });
});
