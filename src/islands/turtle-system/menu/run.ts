import { define, html } from "@merivale/womble";
import { halt, playOrPause, reset } from "@/core/machine.ts";
import "@/islands/setting-controls.ts";
import { getSettings, hiddenUnless } from "@/islands/settings.ts";
import {
  menuSources,
  openSubmenu,
  reportNotImplemented,
  submenu,
} from "../menu.ts";
import { playPauseMachine } from "../program.ts";

// The system menu's Run submenu. The four machine-mode options at the foot
// aren't implemented in the online system, so they render disabled and say so
// when clicked.
define("run-menu", {
  attributes: { open: false },
  sources: menuSources,
  render: ({ open }) => {
    const { mode } = getSettings();
    return submenu(
      { icon: "fa-play", label: "Run", open },
      html`
        <a on-click="runProgram"><span>Run program</span></a>
        <a on-click="haltProgram"><span>Halt program</span></a>
        <a on-click="pauseProgram"><span>Pause program</span></a>
        <a on-click="resetMachine"
          ><span>Reset Canvas, Console and Output</span></a
        >
        <hr class="${hiddenUnless(mode, "normal,expert,machine")}" />
        <setting-checkbox
          setting="showCanvasOnRun"
          label="Show Canvas on RUN"
          modes="normal,expert,machine"
        />
        <setting-checkbox
          setting="showOutputOnWrite"
          label="Show Output tab when text output is generated"
          modes="normal,expert,machine"
        />
        <setting-checkbox
          setting="showMemoryOnDump"
          label="Show memory tab when dumping memory"
          modes="machine"
        />
        <hr class="${hiddenUnless(mode, "expert,machine")}" />
        <setting-checkbox
          setting="traceOnRun"
          label="Trace on run"
          modes="machine"
          disabled
        />
        <a
          class="${hiddenUnless(mode, "machine")}"
          on-click="viewMachineOptions"
        >
          <span>Run Options (screen updating / trace display / memory)</span>
        </a>
        <a
          class="${hiddenUnless(mode, "expert,machine")}"
          on-click="notImplemented"
        >
          <span>Load and Run PCode file (ignoring source code)</span>
        </a>
        <hr class="${hiddenUnless(mode, "machine")}" />
        <setting-checkbox
          setting="activateHCLR"
          label="Auto-delete temporary heap strings (by activating HCLR)"
          modes="machine"
          disabled
        />
        <setting-checkbox
          setting="preventStackCollision"
          label="Prevent memory stack collision with Heap"
          modes="machine"
          disabled
        />
        <setting-checkbox
          setting="rangeCheckArrays"
          label="Range-check all references to array elements"
          modes="machine"
          disabled
        />
      `,
    );
  },
  actions: {
    openSubmenu,
    // `play` and `pause` are both native DOM events, so neither can name an
    // action here.
    runProgram: (): undefined => {
      playPauseMachine();
      return undefined;
    },
    haltProgram: (): undefined => {
      halt();
      return undefined;
    },
    pauseProgram: (): undefined => {
      playOrPause();
      return undefined;
    },
    resetMachine: (): undefined => {
      reset();
      return undefined;
    },
    // Nothing for this component to do: the root answers the announce with
    // `showRunSettings`, which switches tab and closes the menu in one commit.
    viewMachineOptions: (): undefined => undefined,
    notImplemented: reportNotImplemented,
  },
});
