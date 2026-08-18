import { define, html } from "@merivale/womble";
import {
  getSettings,
  type SettingName,
  setSetting,
} from "@/islands/settings.ts";
import { paneClasses, paneSources, paneAttributes } from "./tab-pane.ts";

// The Run Settings tab: four machine-mode run settings, each a number input
// with a paragraph of explanation under it, inside its own `.option` block -
// different enough from the labelled inputs in the system menu that these stay
// written out here rather than going through the shared `setting-number`
// component, which has no room for the prose and no `min` or `max`.
define("options-tab", {
  attributes: paneAttributes,
  sources: paneSources,
  render: ({ active }) => {
    const { drawCountMax, codeCountMax, smallSize, stackSize } = getSettings();
    return html`
      <div class="${paneClasses(active, "machine")}">
        <div class="option">
          <label>
            Default number of simultaneous drawing commands:
            <input
              type="number"
              min="1"
              max="100"
              .value="${drawCountMax}"
              data-setting="drawCountMax"
              on-change="setNumber"
            />
          </label>
          <p>
            Performing more than one drawing command at a time greatly increases
            drawing speed. Set to 1 to see every drawing change individually
            (slower). Pause and update/noupdate override this default.
          </p>
        </div>
        <div class="option">
          <label>
            Maximum number of commands before forced update:
            <input
              type="number"
              min="0"
              max="10000000"
              .value="${codeCountMax}"
              data-setting="codeCountMax"
              on-change="setNumber"
            />
          </label>
          <p>
            This number sets how many commands to allow before forcing the
            canvas to update. A higher number generally results in faster
            program execution, but some programs can cause the browser (or
            browser tab) to hang if they execute a large number of commands
            without ever updating the canvas.
          </p>
        </div>
        <div class="option">
          <label>
            Resolution at which to scale up the canvas:
            <input
              type="number"
              min="0"
              max="100"
              .value="${smallSize}"
              data-setting="smallSize"
              on-change="setNumber"
            />
          </label>
          <p>
            When the program sets the resolution to this value or less (in
            either dimension), the machine will artificially double the
            resolution, and make everything twice as big. This helps very low
            resolution programs to display more clearly and accurately. Set to 0
            to disable.
          </p>
        </div>
        <div class="option">
          <label>
            Memory Stack size, after which Memory Heap starts:
            <input
              type="number"
              min="100"
              max="1000000"
              .value="${stackSize}"
              data-setting="stackSize"
              on-change="setNumber"
            />
          </label>
          <p>
            The Memory Stack stores the variables of the program and
            subroutines, with string variables represented as pointers to the
            Memory Heap. The Memory Heap lies directly above the Memory Stack,
            and stores the actual strings. The Memory Stack should be
            sufficiently large to avoid the storage of program variables
            overflowing into the Memory Heap.
          </p>
        </div>
      </div>
    `;
  },
  actions: {
    setNumber: (_attributes, { element }) => {
      const input = element as HTMLInputElement;
      setSetting(input.dataset.setting as SettingName, Number(input.value));
      return undefined;
    },
  },
});
