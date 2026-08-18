import { define, html } from "@merivale/womble";
import { halt } from "@/core/machine.ts";
import { getStatus, machineStore } from "./machine.ts";
import { playPauseMachine } from "./program.ts";

// The RUN and HALT buttons above the tabs, both a function of the machine store
// (./machine.ts) rather than of state of their own.
define("system-transport", {
  attributes: {},

  sources: [machineStore],

  render: () => {
    const { running, playing } = getStatus();
    return html`
      <button title="RUN" on-click="runProgram">
        <i
          class="${playing ? "fa fa-pause" : "fa fa-play"}"
          aria-hidden="true"
        ></i>
      </button>
      <button title="HALT" disabled="${!running}" on-click="haltProgram">
        <i class="fa fa-stop" aria-hidden="true"></i>
      </button>
    `;
  },

  // Both return `undefined`: what they change is the machine's business, and
  // the store notifies this component as part of the change.
  actions: {
    runProgram: (_attributes, { element }) => {
      element.blur();
      playPauseMachine();
      return undefined;
    },
    haltProgram: (_attributes, { element }) => {
      element.blur();
      halt();
      return undefined;
    },
  },
});
