import { define, html } from "@merivale/womble";
import modes from "@/client/constants/modes.ts";
import "@/islands/setting-controls.ts";
import { menuSources, openSubmenu, submenu } from "../menu.ts";

// The system menu's View submenu: the editor and output fonts, and the four
// mode radios. Every control in it is one of the shared `setting-*` components
// (src/islands/setting-controls.ts), which read and write the settings store
// themselves — so this component supplies only the list of what's in it, and
// the shared chrome around it.
define("view-menu", {
  attributes: { open: false },
  sources: menuSources,
  render: ({ open }) =>
    submenu(
      { icon: "fa-glasses", label: "View", open },
      html`
        <setting-select
          setting="editorFontFamily"
          label="Font family for editor:"
          options="${fonts.join(",")}"
        />
        <setting-number
          setting="editorFontSize"
          label="Font size for editor (px):"
        />
        <hr />
        <setting-select
          setting="outputFontFamily"
          label="Font family for output:"
          options="${fonts.join(",")}"
        />
        <setting-number
          setting="outputFontSize"
          label="Font size for output (px):"
        />
        <hr />
        ${modes.map(
          (name) => html`
            <setting-radio
              setting="mode"
              group="mode"
              value="${name}"
              label="${modeLabels[name]}"
            />
          `,
        )}
      `,
    ),
  actions: { openSubmenu },
});

const fonts = ["Consolas", "Courier", "Lucida Sans Typewriter", "Monospace"];

const modeLabels: Record<string, string> = {
  simple: "Simple Mode",
  normal: "Normal Mode",
  expert: "Expert Mode",
  machine: "Machine Mode",
};
