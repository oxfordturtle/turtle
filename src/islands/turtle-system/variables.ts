import { define, html } from "@merivale/womble";
import { paneClasses, paneSources, paneAttributes } from "./tab-pane.ts";

// The Variables tab, which the online system doesn't fill in yet - the parser
// produces the routine and variable definitions it would list, but nothing
// keeps them (see the note at the top of ./program.ts).
//
// It's still a component rather than the plain markup it was, because the two
// things every pane needs - showing when it's the active tab, hiding in a mode
// it doesn't belong to - are what a pane component is *for* (see ./tab-pane.ts).
// Beyond the `active` prop every pane takes, it has no state, so it subscribes
// to nothing.
define("variables-tab", {
  attributes: paneAttributes,
  sources: paneSources,
  render: ({ active }) => html`
    <div class="${paneClasses(active, "expert,machine")}">
      <p>
        Details of program variables and subroutines are not yet available in
        the online system.
      </p>
    </div>
  `,
});
