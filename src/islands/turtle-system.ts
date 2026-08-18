/// <reference lib="dom" />
import { type CustomElement, define, definition, html } from "@merivale/womble";
import { classes } from "./lib.ts";
import { getSettings, hiddenUnless, settingsStore } from "./settings.ts";
import "./language-select.ts";

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
// **Chrome state lives here** because more than one child needs it. Settings do
// not: they are a store, because the language and mode are read on the
// documentation pages too, where no system app exists. Nor does file state.
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
    fullscreen: false,
  },

  sources: [settingsStore],

  render: ({ menu, submenu, tab, fullscreen }) => {
    const { mode } = getSettings();
    return html`
      <header class="system-header">
        <button aria-label="system menu" on-click="toggleMenu">
          <i class="fa fa-bars" aria-hidden="true"></i>
        </button>
        <div class="controls" on-click="closeMenu">
          <select aria-label="tab" on-change="chooseTab">
            ${tabs.map(
              (candidate) => html`
                <option
                  value="${candidate.id}"
                  class="${candidate.modes === ""
                    ? ""
                    : hiddenUnless(mode, candidate.modes)}"
                  .selected="${candidate.id === tab}"
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
              <canvas-tab active="${tab === "canvas"}" />
              <output-tab active="${tab === "output"}" />
              <usage-tab active="${tab === "usage"}" />
              <comments-tab active="${tab === "comments"}" />
              <syntax-tab active="${tab === "syntax"}" />
              <variables-tab active="${tab === "variables"}" />
              <pcode-tab active="${tab === "pcode"}" />
              <memory-tab active="${tab === "memory"}" />
              <options-tab active="${tab === "options"}" />
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

    // `<body>` is outside this island, so its class is set imperatively; the
    // button's own icon is a function of state
    toggleFullscreen: (attributes) => {
      document.body.classList.toggle("fullscreen", !attributes.fullscreen);
      return { fullscreen: !attributes.fullscreen };
    },

    // Falls back to the Canvas if the mode has just changed to one the current
    // tab doesn't belong to. Asked for by the page-wide mode-visibility pass,
    // which can't work it out itself - see ./turtle-system/commands.ts.
    validateTab: (attributes) => {
      const { mode } = getSettings();
      const current = tabs.find((candidate) => candidate.id === attributes.tab);
      if (
        current &&
        (current.modes === "" || current.modes.split(",").includes(mode))
      ) {
        return undefined;
      }
      return { tab: "canvas" };
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
