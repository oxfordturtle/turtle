/// <reference lib="dom" />
import { define, html } from "@merivale/womble";
import { attachOutput } from "@/client/adapters/output.ts";
import {
  paneAttributes,
  paneClasses,
  paneFontVariables,
  paneSources,
} from "./tab-pane.ts";

// The Output tab: one `<pre>` a running program writes text into.
//
// Chrome only, exactly as `<canvas-tab>` next door is - the text itself is
// appended straight to the DOM by src/client/adapters/output.ts, which this
// component's mount effect hands the element to. Its only state is the `active`
// prop every pane has: nothing about the Output tab changes except which tab is
// showing.
define("output-tab", {
  attributes: paneAttributes,

  sources: paneSources,

  render: ({ active }) => html`
    <div class="${paneClasses(active, "")}" style="${paneFontVariables()}">
      <pre class="output"></pre>
    </div>
  `,

  effects: {
    machinePort: ({ element }) => {
      attachOutput(element.querySelector("pre.output"));
    },
  },
});
