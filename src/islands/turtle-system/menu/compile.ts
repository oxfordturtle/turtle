import { define, html } from "@merivale/womble";
import "@/islands/setting-controls.ts";
import { getSettings, hiddenUnless } from "@/islands/settings.ts";
import {
  menuSources,
  openSubmenu,
  reportNotImplemented,
  submenu,
} from "../menu.ts";
import { compileCurrentFile } from "../program.ts";

// The system menu's Compile submenu. The seven machine-mode compiler options at
// the foot of it aren't implemented in the online system, so they render
// disabled and report that when clicked.
define("compile-menu", {
  attributes: { open: false },
  sources: menuSources,
  render: ({ open }) => {
    const { mode } = getSettings();
    return submenu(
      {
        icon: "fa-code",
        label: "Compile",
        open,
        hidden: hiddenUnless(mode, "expert,machine"),
      },
      html`
        <a on-click="compileProgram"
          ><span>Compile to Turtle Machine PCode</span></a
        >
        <hr />
        <a on-click="notImplemented"
          ><span>Save Turtle Machine PCode file (JSON)</span></a
        >
        <a class="${hiddenUnless(mode, "machine")}" on-click="notImplemented">
          <span>Save Turtle Machine PCode file (binary)</span>
        </a>
        <hr class="${hiddenUnless(mode, "machine")}" />
        <setting-checkbox
          setting="setupDefaultKeyBuffer"
          label="Automatically set up default key buffer (length 32)"
          modes="machine"
          disabled
        />
        <setting-checkbox
          setting="turtleAttributesAsGlobals"
          label="Treat Turtle attributes as global variables"
          modes="machine"
          disabled
        />
        <setting-checkbox
          setting="initialiseLocals"
          label="Initialise local variables (to zero/false)"
          modes="machine"
          disabled
        />
        <setting-checkbox
          setting="allowCSTR"
          label="Allow quick string parameter copying with CSTR"
          modes="machine"
          disabled
        />
        <hr class="${hiddenUnless(mode, "machine")}" />
        <setting-checkbox
          setting="separateReturnStack"
          label="Turtle machine using separate Return Stack"
          modes="machine"
          disabled
        />
        <setting-checkbox
          setting="separateMemoryControlStack"
          label="Turtle machine using separate Memory Control Stack"
          modes="machine"
          disabled
        />
        <setting-checkbox
          setting="separateSubroutineRegisterStack"
          label="Turtle machine using Subroutine Register Stack"
          modes="machine"
          disabled
        />
      `,
    );
  },
  actions: {
    openSubmenu,
    compileProgram: (): undefined => {
      compileCurrentFile();
      return undefined;
    },
    notImplemented: reportNotImplemented,
  },
});
