import {
  assertNoWombleLogs,
  change,
  click,
  mountRoute,
  q,
  qa,
} from "../lib/setup.ts";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { afterEach, describe, it } from "@std/testing/bdd";

// The two islands that belong to the site rather than to the system: the logo
// dropdown in the top-left of every page (src/islands/site-menu.ts), and the
// tab `<select>` on the two documentation pages (src/islands/doc-tabs.ts).
//
// Both are the same shape - a control whose state is its own attributes - and
// both are interesting for what they do to markup *outside* themselves: the
// site menu closes when a click lands anywhere else on the page, and the doc
// tabs switch panes that are static prose no island owns.

// Every query here is scoped to the site nav's *own* copy of the island: the
// system page renders a second one inside the system header, which the
// stylesheet shows in place of the nav while fullscreen covers it (see
// src/islands/turtle-system.ts). A bare `site-menu` selector would find two on
// `/`, and the two are independent islands with their own open state.
const nav = ".site-nav site-menu";

const logo = (): Element => q(`${nav} > a`);

const documentationToggle = (): Element => q(`${nav} .site-menu > a`);

/** how many dropdown panels are showing, by the class each derives from its flag */
const openPanels = (): number => qa(`${nav} .site-sub-menu.open`).length;

// Rule 6: every test ends with Womble having reported nothing.
afterEach(assertNoWombleLogs);

describe("the site menu", () => {
  it("opens and closes from the logo, turning its caret over", async () => {
    await mountRoute("/");
    assertEquals(openPanels(), 0);
    assertEquals(q(`${nav} > a i`).className, "fa fa-caret-down");

    await click(logo());
    assert(q(nav).site);
    assertEquals(openPanels(), 1);
    assertEquals(q(`${nav} > a i`).className, "fa fa-caret-up");

    await click(logo());
    assertFalse(q(nav).site);
    assertEquals(openPanels(), 0);
  });

  // Two levels in one island, so "documentation can only be open while site
  // is open" is an invariant of the render tree rather than something two
  // islands have to agree on.
  it("opens the documentation submenu inside it, and closes it with its parent", async () => {
    await mountRoute("/");
    await click(logo());
    await click(documentationToggle());
    assert(q(nav).documentation);
    assertEquals(openPanels(), 2);
    // its own caret, the second of the two icons in the toggle, turns over too
    assertEquals(
      qa("i", documentationToggle()).at(-1).className,
      "fa fa-caret-up",
    );

    // closing the whole thing closes the nested one with it
    await click(logo());
    assertFalse(q(nav).site);
    assertFalse(q(nav).documentation);
    assertEquals(openPanels(), 0);
  });

  it("closes it again on a second click", async () => {
    await mountRoute("/");
    await click(logo());
    await click(documentationToggle());
    await click(documentationToggle());
    assertFalse(q(nav).documentation);
    assertEquals(openPanels(), 1);
  });

  // The nav is the only page content outside `.wrapper`, so "click anywhere
  // outside this island" is a document listener rather than anything Womble
  // could delegate.
  it("closes when a click lands anywhere else on the page", async () => {
    await mountRoute("/about");
    await click(logo());
    await click(documentationToggle());
    await click(q(".wrapper"));
    assertFalse(q(nav).site);
    assertFalse(q(nav).documentation);
    assertEquals(openPanels(), 0);
  });

  it("stays open for a click inside itself", async () => {
    await mountRoute("/");
    await click(logo());
    await click(q(`${nav} .site-sub-menu a`));
    assert(q(nav).site);
  });

  // Which page is showing is a prop from the layout, and marks its own link.
  it("marks the section and page the layout says is showing", async () => {
    await mountRoute("/");
    assertEquals(
      qa(`${nav} a.active`).map((a: Element) => a.getAttribute("href")),
      ["/"],
    );

    await mountRoute("/documentation/help");
    assertEquals(
      qa(`${nav} a.active`).map((a: Element) => a.getAttribute("href")),
      // the Documentation toggle has no href of its own
      [null, "/documentation/help"],
    );

    await mountRoute("/documentation/reference");
    assertEquals(
      qa(`${nav} a.active`).map((a: Element) => a.getAttribute("href")),
      [null, "/documentation/reference"],
    );

    await mountRoute("/contact");
    assertEquals(
      qa(`${nav} a.active`).map((a: Element) => a.getAttribute("href")),
      ["/contact"],
    );
  });
});

// The same island a second time, in the system's own top bar. Fullscreen hides
// the site nav - the system is filling the space it had - so without this there
// is no way back to the rest of the site from there. Which of the two copies is
// on screen is the stylesheet's answer (style/screen/system/header.css), and the
// browser suite is where that is asserted; what this layer can say is that the
// second copy is there, that it offers the same links, and that the two don't
// interfere with each other.
describe("the site menu's copy in the system header", () => {
  const copy = ".system-site-nav site-menu";

  const hrefs = (selector: string): Array<string | null> =>
    qa(`${selector} a[href]`).map((a: Element) => a.getAttribute("href"));

  it("offers the same links as the nav's, and only on the system page", async () => {
    await mountRoute("/");
    assertEquals(hrefs(copy), hrefs(nav));
    // and it knows which page it is on, from the `section` its call site
    // hardcodes - the system is only ever the index route
    assertEquals(
      qa(`${copy} a.active`).map((a: Element) => a.getAttribute("href")),
      ["/"],
    );

    await mountRoute("/about");
    assertEquals(qa(copy).length, 0);
  });

  // Two instances of one island, so each has its own state: the copy the person
  // can see is the one that opens.
  it("opens on its own, leaving the nav's copy closed", async () => {
    await mountRoute("/");
    await click(q(`${copy} > a`));
    assert(q(copy).site);
    assertFalse(q(nav).site);
  });

  // The wrapper it sits in carries the root's `closeMenu`, so the system menu
  // doesn't stay up underneath a dropdown that has replaced it. Womble's
  // delegation is what makes that safe: a click from inside a nested island is
  // matched from the island's own tag upwards, so the root reads its own
  // `on-click` and never the site menu's.
  it("closes the system menu it shares its bar with", async () => {
    await mountRoute("/");
    await click(q('button[aria-label="system menu"]'));
    assert(q("turtle-system").menu);

    await click(q(`${copy} > a`));
    assertFalse(q("turtle-system").menu);
    assert(q(copy).site);
  });
});

describe("the documentation tabs", () => {
  const panes = (): Array<string | null> =>
    qa(".tab-panes > [data-tab].active").map((pane: Element) =>
      pane.getAttribute("data-tab"),
    );

  it("shows the pane named by the page's own ?tab= parameter", async () => {
    await mountRoute("/documentation/help?tab=operators");
    assertEquals(q("doc-tabs select").value, "operators");
    assertEquals(panes(), ["operators"]);
  });

  it("switches panes when another tab is chosen", async () => {
    await mountRoute("/documentation/help");
    assertEquals(panes(), ["basics"]);
    const select = q("doc-tabs select") as HTMLSelectElement;
    select.value = "structures";
    await change(select);
    assertEquals(q("doc-tabs").tab, "structures");
    assertEquals(panes(), ["structures"]);
  });

  // The reference page carries *two* sets of panes - one for the prose above
  // the tables and one below - which is exactly why the panes are swept by a
  // named effect rather than owned by the island: one control, every pane on
  // the page named after its tab.
  it("sweeps both sets of panes on the reference page", async () => {
    await mountRoute("/documentation/reference");
    assertEquals(panes(), ["commands", "commands"]);
    const select = q("doc-tabs select") as HTMLSelectElement;
    select.value = "cursors";
    await change(select);
    assertEquals(panes(), ["cursors", "cursors"]);
  });
});
