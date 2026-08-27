import { define, html } from "@merivale/womble";
import "@/islands/setting-controls.ts";
import {
  getSettings,
  hiddenUnless,
  resetDefaults,
} from "@/islands/settings.ts";
import { menuSources, openSubmenu, submenu } from "../menu.ts";

// The system menu's Options submenu, which is settings all the way down —
// including the command link at the bottom, which calls the settings store
// rather than doing anything this component does itself.
//
// The three auto-on-load options aren't implemented in the online system, so
// they render disabled and report that when clicked.
define("options-menu", {
  attributes: { open: false },
  sources: menuSources,
  render: ({ open }) => {
    const { mode } = getSettings();
    return submenu(
      { icon: "fa-cogs", label: "Options", open },
      html`
        ${canvasStartSizes.map(
          (size) => html`
            <setting-radio
              setting="canvasStartSize"
              group="canvasStartSize"
              value="${size}"
              numeric
              label="${canvasStartSizeLabel(size)}"
            />
          `,
        )}
        <hr class="${hiddenUnless(mode, "expert,machine")}" />
        <setting-checkbox
          setting="autoCompileOnLoad"
          label="Auto-Compile on loading"
          modes="expert,machine"
          disabled
        />
        <setting-checkbox
          setting="autoRunOnLoad"
          label="Auto-Run on loading"
          modes="expert,machine"
          disabled
        />
        <setting-checkbox
          setting="autoFormatOnLoad"
          label="Auto-Format on loading"
          modes="expert,machine"
          disabled
        />
        <hr />
        <a on-click="resetSettings"><span>Reset settings to default</span></a>
      `,
    );
  },
  actions: {
    openSubmenu,
    resetSettings: (): undefined => {
      resetDefaults();
      return undefined;
    },
  },
});

// Strings, because a hole is only ever a whole attribute value in an `html`
// template — `label="Start programs with ${size}x..."` would be a hole mixed
// with static text, which Womble doesn't support, so the label is built here.
const canvasStartSizes = ["500", "1000", "2000"];

const canvasStartSizeLabel = (size: string): string =>
  `Start programs with ${size}x${size} Canvas and Resolution`;
