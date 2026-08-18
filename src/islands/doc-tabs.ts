/// <reference lib="dom" />
import { define, html } from "@merivale/womble";

// The tab `<select>` on /documentation/help and /documentation/reference.
//
// **The panes it switches stay outside it, deliberately**: they are large tracts
// of static documentation prose, and the reference page has two sets of them, so
// an island could only own them by owning the prose. A named effect sweeps them
// instead, re-running whenever the tab changes. That is why `tab` is an
// attribute at all - nothing in this render depends on it, but the effect reads
// it off the element as it runs, which is what makes it the dependency.
//
// The `<option>`s are call-site children, since the two pages offer different
// tabs. They are static nodes this render projects and never patches, so the
// browser's own `<select>` behaviour is the whole of it and the server's
// `selected` attribute is a genuine default.
define("doc-tabs", {
  attributes: {
    /** which pane is showing — seeded from the page's own `?tab=` parameter */
    tab: "",
  },

  render: (_attributes, view) => html`
    <select aria-label="tab" on-change="chooseTab">
      ${view.children}
    </select>
  `,

  actions: {
    chooseTab: (_attributes, { element }) => {
      element.blur();
      return { tab: (element as HTMLSelectElement).value };
    },
  },

  effects: {
    // scoped to `.tab-panes` so this can never reach the system's own panes,
    // which are components that derive `.active` from state
    panes: ({ element }) => {
      // read as the setup runs, which is what makes `tab` this effect's
      // dependency
      const { tab } = element;
      for (const pane of Array.from(
        document.querySelectorAll(".tab-panes > [data-tab]"),
      )) {
        pane.classList.toggle(
          "active",
          (pane as HTMLElement).dataset.tab === tab,
        );
      }
    },
  },
});
