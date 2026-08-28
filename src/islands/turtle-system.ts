/// <reference lib="dom" />
import { type CustomElement, define, definition, html } from "@merivale/womble";
import { classes } from "./lib.ts";
import {
  getSettings,
  hiddenUnless,
  setSetting,
  settingsStore,
} from "./settings.ts";
import "./language-select.ts";
import "./site-menu.ts";

// The Turtle System's root component: its `render` *is* the structure of the
// IDE, so this one file says what the app is made of.
//
// **The render is deliberately static markup.** Womble reuses DOM whenever a
// template's strings match, so re-rendering on every menu toggle is cheap and
// the nested islands keep their own state - but a hole that swapped a whole
// subtree would tear them down and mount them again, losing their effects. All
// the variation here is in attribute holes, or inside the nested components.
// `<canvas-tab>` holds everything a program has drawn, and survives a re-render
// of this component only because nothing here can move it.
//
// **Ephemeral chrome state lives here** because more than one child needs it and
// nothing should remember it: which menu is open, and which tab was last chosen.
// Settings do not: they are a store, because the language and mode are read on
// the documentation pages too, where no system app exists. Nor does file state.
//
// `fullscreen` used to be an attribute here, and is now a setting - it is a
// preference someone expects to still be in force tomorrow, and being a cookie
// field is what lets the server put `fullscreen` on `<body>` in the first place,
// rather than the whole page being laid out twice.
//
// **The header carries a second `<site-menu>`.** Fullscreen hides the real site
// nav - the system is covering the space it occupied - so the same island is
// rendered again inside the system's own top bar, and the stylesheet shows
// whichever copy belongs to the current state (style/screen/system/header.css).
// It is rendered unconditionally, like everything else here: a hole that came
// and went would tear the island down and mount it again, losing the
// click-outside listener it installs, so `display: none` is what keeps the copy
// out of the page - and out of the accessibility tree - the rest of the time.
// `section` is hardcoded because this component only ever renders on the index
// route, and `page` is read only for the documentation sub-links, so its default
// is already the right answer.
//
// **The menu button carries both of its icons** for the same reason, and the
// stylesheet picks between them: in fullscreen the button is the top left corner
// of the page - the place the site nav's logo would occupy - so it wears the
// turtle there and the bars everywhere else.
//
// Written through `definition()` rather than passed straight to `define()` so
// that its type can be named, which is what gives
// `document.querySelector("turtle-system")` the methods
// ./turtle-system/commands.ts calls on it from outside this subtree.
const turtleSystem = definition({
  // A component's `attributes` is its default state, so `tab: "canvas"` is both
  // "a string attribute" and "the Canvas is what a fresh system shows".
  attributes: {
    menu: false,
    submenu: "",
    tab: "canvas",
  },

  sources: [settingsStore],

  render: ({ menu, submenu, tab }) => {
    const { mode, fullscreen } = getSettings();
    // what the user last chose, resolved against what this mode actually has
    const shown = shownTab(tab, mode);
    return html`
      <header class="system-header">
        <div class="system-header-left">
          <button aria-label="system menu" on-click="toggleMenu">
            <i class="fa fa-bars" aria-hidden="true"></i>
            <img class="logo" src="/images/turtle.png" alt="" />
          </button>
          <div class="site-nav-left system-site-nav" on-click="closeMenu">
            <site-menu section="index" />
          </div>
        </div>
        <div class="controls" on-click="closeMenu">
          <select aria-label="tab" on-change="chooseTab">
            ${tabs.map(
              (candidate) => html`
                <option
                  value="${candidate.id}"
                  class="${candidate.modes === ""
                    ? ""
                    : hiddenUnless(mode, candidate.modes)}"
                  .selected="${candidate.id === shown}"
                >
                  ${candidate.label}
                </option>
              `,
            )}
          </select>
          <language-select />
          <button
            title="${fullscreen ? "Expand down" : "Maximize"}"
            on-click="toggleFullscreen"
          >
            <i
              class="${fullscreen ? "fa fa-compress" : "fa fa-expand"}"
              aria-hidden="true"
            ></i>
          </button>
        </div>
      </header>
      <div class="system-body">
        <nav class="${classes("system-menu", menu && "open")}">
          <file-menu
            open="${submenu === "file"}"
            on-openSubmenu="openSubmenu"
            on-newProgram="closeMenu"
            on-newSkeletonProgram="closeMenu"
            on-openProgram="closeMenu"
            on-saveProgram="closeMenu"
            on-closeProgram="closeMenu"
          />
          <edit-menu
            open="${submenu === "edit"}"
            on-openSubmenu="openSubmenu"
            on-selectAllCode="closeMenu"
            on-storeCopy="closeMenu"
            on-restoreCopy="closeMenu"
          />
          <view-menu
            open="${submenu === "view"}"
            on-openSubmenu="openSubmenu"
          />
          <compile-menu
            open="${submenu === "compile"}"
            on-openSubmenu="openSubmenu"
            on-compileProgram="closeMenu"
          />
          <run-menu
            open="${submenu === "run"}"
            on-openSubmenu="openSubmenu"
            on-runProgram="closeMenu"
            on-haltProgram="closeMenu"
            on-pauseProgram="closeMenu"
            on-resetMachine="closeMenu"
            on-viewMachineOptions="showRunSettings"
          />
          <options-menu
            open="${submenu === "options"}"
            on-openSubmenu="openSubmenu"
          />
          <examples-menu
            open="${submenu === "examples"}"
            on-openSubmenu="openSubmenu"
            on-openExample="closeMenu"
          />
        </nav>
        <main class="system-main" on-click="closeMenu">
          <section class="system-section left">
            <system-filename />
            <system-editor />
          </section>
          <section class="system-section right">
            <turtle-properties />
            <div class="system-tabs">
              <canvas-tab active="${shown === "canvas"}" />
              <output-tab active="${shown === "output"}" />
              <usage-tab active="${shown === "usage"}" />
              <comments-tab active="${shown === "comments"}" />
              <syntax-tab active="${shown === "syntax"}" />
              <variables-tab active="${shown === "variables"}" />
              <pcode-tab active="${shown === "pcode"}" />
              <memory-tab active="${shown === "memory"}" />
              <options-tab active="${shown === "options"}" />
            </div>
          </section>
        </main>
      </div>
    `;
  },

  actions: {
    // the hamburger; closing the base menu closes every submenu with it
    toggleMenu: (attributes) => (attributes.menu ? closed : { menu: true }),

    // answers both the work area's own click and the announce a submenu makes
    // when one of its commands has run
    closeMenu: (attributes) => (attributes.menu ? closed : undefined),

    // Announced by each submenu's toggle link. *Which* submenu is read off the
    // element the event came from, since an announced event carries no payload.
    // "Opening one closes its siblings" falls out of `submenu` being one string.
    openSubmenu: (attributes, { element }) => {
      const name = element.localName.replace(/-menu$/, "");
      return {
        menu: true,
        submenu: attributes.submenu === name ? "" : name,
      };
    },

    chooseTab: (_attributes, { element }) => ({
      tab: (element as HTMLSelectElement).value,
    }),

    // From outside the subtree, as a method on this element (see
    // ./turtle-system/commands.ts). Which tab is a declared parameter, so the
    // call is type-checked against it and the value arrives parsed.
    selectTab: {
      params: { tab: "" },
      run: (_attributes, { params }) => ({
        ...closed,
        tab: params.tab as string,
      }),
    },

    // the Run menu's "Run Options" link, which announces and leaves the tab to
    // us
    showRunSettings: () => ({ ...closed, tab: "options" }),

    // A setting now, so this is the same call any other control makes. The
    // `<body>` class follows from src/client/passes.ts, which is where the two
    // settings that live on `<body>` are kept in step with the store.
    toggleFullscreen: () => {
      setSetting("fullscreen", !getSettings().fullscreen);
      return undefined;
    },
  },
  // No effects. Everything commanded from outside this subtree is a plain
  // method call on this element (./turtle-system/commands.ts), and every pane
  // takes `active` as a prop, so committing the action is the whole job.
});

define("turtle-system", turtleSystem);

declare global {
  interface HTMLElementTagNameMap {
    "turtle-system": CustomElement<typeof turtleSystem>;
  }
}

// Every chrome field at rest: what closing the menu means, and the base of what
// selecting a tab from a menu link means.
const closed = { menu: false, submenu: "" };

/**
 * Which tab is actually on show: the one last chosen, unless this mode hasn't
 * got it, in which case the Canvas.
 *
 * **Derived rather than corrected.** The `tab` attribute keeps whatever was
 * chosen even while a mode hides it, so leaving Expert mode and coming back
 * brings the PCode tab back with it. It also means nothing outside this
 * component has to notice a mode change on its behalf, which is what the old
 * `validateTab` method and the page-wide mode sweep existed to do.
 */
const shownTab = (tab: string, mode: string): string => {
  const current = tabs.find((candidate) => candidate.id === tab);
  const allowed =
    current !== undefined &&
    (current.modes === "" || current.modes.split(",").includes(mode));
  return allowed ? tab : "canvas";
};

// The tab <select>'s options, and with them the set of tab ids. An empty
// `modes` means every mode.
const tabs = [
  { id: "canvas", label: "Canvas & Console", modes: "" },
  { id: "output", label: "Output", modes: "" },
  { id: "usage", label: "Usage", modes: "normal,expert,machine" },
  { id: "comments", label: "Comments", modes: "expert,machine" },
  { id: "syntax", label: "Syntax", modes: "expert,machine" },
  { id: "pcode", label: "PCode", modes: "expert,machine" },
  { id: "memory", label: "Memory", modes: "expert,machine" },
  { id: "options", label: "Run Settings", modes: "machine" },
];
