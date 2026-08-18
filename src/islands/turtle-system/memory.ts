/// <reference lib="dom" />
import { define, html } from "@merivale/womble";
import { dump } from "@/core/machine.ts";
import { getMemory, machineStore, setMemory } from "./machine.ts";
import { paneClasses, paneSources, paneAttributes } from "./tab-pane.ts";

// The Memory tab: the machine's stack and heap, ten bytes to a row.
//
// A dump arrives two ways - the user pressing the button, and the program
// running a DUMP instruction, which the machine reports through its output port.
// Both go through the machine store, so this component just displays whatever
// the last dump was.
define("memory-tab", {
  attributes: paneAttributes,

  sources: [...paneSources, machineStore],

  render: ({ active }) => {
    const { stack, heap, heapBase } = getMemory();
    return html`
      <div class="${paneClasses(active, "expert,machine")}">
        <div class="system-buttons">
          <button on-click="showCurrentState">Show Current State</button>
        </div>
        <div class="memory-container">
          <table>
            <thead>
              <tr>
                <td>Stack</td>
                ${offsets}
              </tr>
            </thead>
            <tbody>
              ${rows(stack, 0)}
            </tbody>
          </table>
        </div>
        <div class="memory-container">
          <table>
            <thead>
              <tr>
                <td>Heap</td>
                ${offsets}
              </tr>
            </thead>
            <tbody>
              ${rows(heap, heapBase)}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // Returns `undefined`: the dump goes into the store, and the store notifies
  // this component as part of the change.
  actions: {
    showCurrentState: (_attributes, { element }) => {
      element.blur();
      setMemory(dump());
      return undefined;
    },
  },
});

const wrap = 10;

const offsets = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(
  (offset) => html` <th>+${offset}</th> `,
);

/** The bytes in rows of ten, each labelled with the address it starts at. */
const rows = (bytes: number[], base: number) => {
  const lines = [];
  for (let start = 0; start < bytes.length; start += wrap) {
    lines.push(html`
      <tr>
        <th>${(base + start).toString(10)}</th>
        ${bytes
          .slice(start, start + wrap)
          .map((byte) => html` <td>${byte.toString(10)}</td> `)}
      </tr>
    `);
  }
  return lines;
};
