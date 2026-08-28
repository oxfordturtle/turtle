import {
  assertNoWombleLogs,
  click,
  mountRoute,
  q,
  qa,
  settings,
  settle,
} from "../lib/setup.ts";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

// The system menu is where both directions of the parent/child protocol are
// load-bearing at once, and neither has any other verification:
//
// - **Up is the announce.** A submenu's action changes nothing and returns
//   `undefined`; Womble dispatches a bubbling event named after it, and the
//   root picks it up with `on-openSubmenu="openSubmenu"` on the tag it writes.
//   No submenu names `turtle-system` at all.
// - **Down is props, re-asserted every render.** `open="${submenu === "file"}"`
//   is written on all seven tags, so "opening one closes its siblings" is a
//   consequence of `submenu` being one string rather than seven flags
//   cooperating.

/** the toggle link in the collapsed rail, which is the first `<a>` of a submenu */
const toggle = (menu: string): Element => q(`${menu} > div > a`);

/** how many submenu panels are open, by the class the panel derives from `open` */
const openPanels = (): number => qa(".system-sub-menu.open").length;

/** the examples submenu's group links, in order — the first `<a>` of each group */
const groupLinks = (): Element[] => qa("examples-menu > div > div > a");

/** which example group is showing, by the class its link derives from `group` */
const openGroups = (): number => qa("examples-menu a[data-group].open").length;

// deno-lint-ignore no-explicit-any
const system = (): any => q("turtle-system");

beforeEach(async () => {
  await mountRoute("/");
});

// Rule 6: every test ends with Womble having reported nothing.
afterEach(assertNoWombleLogs);

describe("opening a submenu", () => {
  it("tells the root which submenu, and opens the menu with it", async () => {
    await click(toggle("file-menu"));
    assertEquals(system().submenu, "file");
    assert(system().menu);
    assertEquals(openPanels(), 1);
  });

  it("closes the previous one, without the two cooperating", async () => {
    await click(toggle("file-menu"));
    await click(toggle("edit-menu"));
    assertEquals(system().submenu, "edit");
    // `open` is a Boolean prop, so it is a boolean attribute: present or not.
    assertFalse(q("file-menu").hasAttribute("open"));
    assertEquals(q("edit-menu").getAttribute("open"), "");
    assertEquals(openPanels(), 1);
  });

  it("closes itself when clicked again", async () => {
    await click(toggle("file-menu"));
    await click(toggle("file-menu"));
    assertEquals(system().submenu, "");
    assertEquals(openPanels(), 0);
    assert(system().menu);
  });
});

describe("the root's own chrome", () => {
  it("opens and closes the whole menu from the hamburger", async () => {
    await click(q("turtle-system .system-header button"));
    assert(system().menu);
    assertEquals(qa("turtle-system nav.system-menu.open").length, 1);
    await click(q("turtle-system .system-header button"));
    assertFalse(system().menu);
    assertEquals(qa("turtle-system nav.system-menu.open").length, 0);
  });

  it("closes every submenu with the menu itself", async () => {
    await click(toggle("examples-menu"));
    await click(q("turtle-system .system-header button"));
    await click(q("turtle-system .system-header button"));
    assert(system().menu);
    assertEquals(system().submenu, "");
    assertEquals(openPanels(), 0);
  });

  // Fullscreen is a *setting* rather than this island's own attribute: it is a
  // preference someone expects to still hold tomorrow, and being one of the
  // five cookie fields is what lets the server put the class on `<body>` in the
  // first place, instead of the page being laid out twice. The button's icon
  // and title stay a function of state; the `<body>` class is kept in step by
  // `syncBodyState` (src/client/passes.ts), since no component owns `<body>`.
  it("puts the whole page into fullscreen and back from the header button", async () => {
    const button = qa("turtle-system .system-header button").at(-1);
    assertEquals(button.getAttribute("title"), "Maximize");
    assertEquals(qa("i", button)[0].className, "fa fa-expand");

    await click(button);
    assert(settings.getSettings().fullscreen);
    assert(document.body.classList.contains("fullscreen"));
    assertEquals(button.getAttribute("title"), "Expand down");
    assertEquals(qa("i", button)[0].className, "fa fa-compress");

    await click(button);
    assertFalse(settings.getSettings().fullscreen);
    assertFalse(document.body.classList.contains("fullscreen"));
  });

  // and being a setting, it is remembered - which is the whole reason it moved
  it("is still in force on the next page load", async () => {
    await click(qa("turtle-system .system-header button").at(-1));
    assert(settings.getSettings().fullscreen);

    await mountRoute("/", { keepStorage: true });
    assert(settings.getSettings().fullscreen);
    assert(document.body.classList.contains("fullscreen"));
  });

  it("closes the menu when the work area is clicked", async () => {
    await click(toggle("view-menu"));
    await click(q("turtle-system main.system-main"));
    assertFalse(system().menu);
    assertEquals(system().submenu, "");
  });

  // Props down, re-asserted: nothing was clicked, the root's own state was
  // written, and exactly one panel followed.
  it("re-asserts `open` on all seven submenus from `submenu` alone", async () => {
    for (const menu of [
      "file",
      "edit",
      "view",
      "compile",
      "run",
      "options",
      "examples",
    ]) {
      system().submenu = menu;
      await settle();
      assertEquals(openPanels(), 1);
      assertEquals(q(`${menu}-menu`).getAttribute("open"), "");
    }
    system().submenu = "";
    await settle();
    assertEquals(openPanels(), 0);
  });
});

describe("a menu command", () => {
  it("dismisses the menu once it has run", async () => {
    await click(toggle("file-menu"));
    const commands = qa("file-menu .system-sub-menu.open a");
    await click(
      commands.find((a: Element) => a.textContent?.includes("New program")),
    );
    assertFalse(system().menu);
    assertEquals(system().submenu, "");
  });

  it("selects a tab and dismisses the menu, from the Run menu", async () => {
    await click(toggle("run-menu"));
    const links = qa("run-menu .system-sub-menu.open a");
    await click(
      links.find((a: Element) => a.textContent?.includes("Run Options")),
    );
    assertEquals(system().tab, "options");
    assertFalse(system().menu);
  });

  // A command the online system doesn't implement deliberately leaves the menu
  // up, which is the other half of the same protocol: the root only listens for
  // the announces it has an answer to.
  it("leaves the menu up for a command that isn't implemented", async () => {
    await click(toggle("edit-menu"));
    const commands = qa("edit-menu .system-sub-menu.open a");
    await click(
      commands.find((a: Element) =>
        a.textContent?.includes("Find and replace"),
      ),
    );
    assert(system().menu);
    assertEquals(system().submenu, "edit");
  });
});

// The one piece of submenu state that isn't the root's: which group of examples
// is showing. Nothing outside this component has any use for it.
describe("the examples submenu's own group", () => {
  it("opens a group, and collapses it when the same link is clicked again", async () => {
    await click(toggle("examples-menu"));
    const group = groupLinks()[0]!;
    await click(group);
    assertEquals(q("examples-menu").group, group.getAttribute("data-group"));
    assertEquals(openGroups(), 1);

    await click(group);
    assertEquals(q("examples-menu").group, "");
    assertEquals(openGroups(), 0);
  });

  it("shows one group at a time", async () => {
    await click(toggle("examples-menu"));
    await click(groupLinks()[0]!);
    await click(groupLinks()[1]!);
    assertEquals(
      q("examples-menu").group,
      groupLinks()[1]?.getAttribute("data-group"),
    );
    assertEquals(openGroups(), 1);
  });

  // The root used to clear `exampleGroup` on every `openSubmenu`. Now the
  // submenu clears its own, on the one route by which the user can get back to
  // it — its own toggle link — which is the same thing on screen.
  it("starts from the list of groups when the submenu is opened again", async () => {
    await click(toggle("examples-menu"));
    await click(groupLinks()[0]!);
    await click(toggle("file-menu"));
    assertFalse(q("examples-menu").hasAttribute("open"));

    await click(toggle("examples-menu"));
    assertEquals(q("examples-menu").group, "");
    assertEquals(openGroups(), 0);
    assertEquals(openPanels(), 1);
  });
});
