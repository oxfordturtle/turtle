import { define, html } from "@merivale/womble";

// The site logo dropdown, and the documentation submenu nested in it.
//
// Both levels live in this one island rather than two linked by context: the
// nesting is always exactly two levels, and one island makes "documentation can
// only be open while site is open" an invariant of the render tree - the toggle
// is only reachable while its parent submenu is showing - rather than something
// two islands must coordinate.
const attributes = {
  section: "",
  page: "",
  site: false,
  documentation: false,
};

define("site-menu", {
  attributes,
  render: ({ section, page, site, documentation }) => html`
    <a class="${classes(site && "open")}" on-click="toggleSite">
      <span class="icon logo"
        ><img src="/images/turtle.png" alt="turtle logo"
      /></span>
      <span class="text">The Turtle System</span>
      <span class="icon"
        ><i class="${site ? "fa fa-caret-up" : "fa fa-caret-down"}"></i
      ></span>
    </a>
    <div class="${classes("site-sub-menu", site && "open")}">
      <a href="/" class="${classes(section === "index" && "active")}">
        <span class="icon logo"
          ><img src="/images/turtle.png" alt="turtle logo"
        /></span>
        <span class="text">The Turtle System</span>
      </a>
      <div class="site-menu">
        <a
          class="${classes(
            section === "documentation" && "active",
            documentation && "open",
          )}"
          on-click="toggleDocumentation"
        >
          <span class="icon"><i class="fa fa-book"></i></span>
          <span class="text">Documentation</span>
          <span class="icon"
            ><i
              class="${documentation ? "fa fa-caret-up" : "fa fa-caret-down"}"
            ></i
          ></span>
        </a>
        <div class="${classes("site-sub-menu", documentation && "open")}">
          <a
            href="/documentation/help"
            class="${classes(page === "help" && "active")}"
          >
            Turtle Languages Help
          </a>
          <a
            href="/documentation/reference"
            class="${classes(page === "reference" && "active")}"
          >
            Commands &amp; Constants Reference
          </a>
        </div>
      </div>
      <a href="/about" class="${classes(section === "about" && "active")}">
        <span class="icon"><i class="fa fa-info"></i></span>
        <span class="text">About</span>
      </a>
      <a href="/contact" class="${classes(section === "contact" && "active")}">
        <span class="icon"><i class="fa fa-at"></i></span>
        <span class="text">Contact</span>
      </a>
    </div>
  `,
  actions: {
    // Closing site also closes documentation. Opening site can't find
    // documentation already open, since its toggle is only reachable while
    // site's own submenu is showing.
    toggleSite: (attributes) => ({
      ...attributes,
      site: !attributes.site,
      documentation: false,
    }),
    toggleDocumentation: (attributes) => ({
      ...attributes,
      documentation: !attributes.documentation,
    }),
    closeAll: (attributes) => ({
      ...attributes,
      site: false,
      documentation: false,
    }),
  },
  effects: {
    // The nav is the only page content outside `.wrapper`, so "click anywhere
    // outside this island" and "click anywhere inside `.wrapper`" are the same
    // set of clicks - which a delegated listener on this island's own root
    // could never see.
    clickOutside: ({ element }) => {
      const handler = (event: Event): void => {
        if (!element.contains(event.target as Node)) element.closeAll();
      };
      document.addEventListener("click", handler);
      return () => document.removeEventListener("click", handler);
    },
  },
});

const classes = (...names: Array<string | false | null | undefined>): string =>
  names.filter(Boolean).join(" ");
