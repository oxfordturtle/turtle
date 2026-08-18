import { define, html } from "@merivale/womble";
import { getTurtle, machineStore } from "./machine.ts";

// The turtle property displays above the tabs, with the RUN and HALT buttons
// beside them.
//
// These are the app's highest-frequency displays: the machine reports a turtle
// property on most of its turtle instructions. Rendering them is affordable only
// because the machine store coalesces its notifications to one animation frame
// (see ./machine.ts), so a program drawing flat out re-renders this component
// sixty times a second and each render patches six text holes. Keeping the
// values in the store also keeps them out of the DOM as attributes, which at
// this update rate matters.
define("turtle-properties", {
  attributes: {},

  sources: [machineStore],

  render: () => {
    const { x, y, d, a, t, c } = getTurtle();
    return html`
      <div class="turtle-properties">
        <system-transport />
        <div class="turtle-property">
          <span class="turtle-label">X</span>
          <span class="turtle-value">${x.toString(10)}</span>
        </div>
        <div class="turtle-property">
          <span class="turtle-label">Y</span>
          <span class="turtle-value">${y.toString(10)}</span>
        </div>
        <div class="turtle-property">
          <span class="turtle-label"
            ><i class="fa fa-compass" aria-hidden="true"></i
          ></span>
          <span class="turtle-value">${d.toString(10)}/${a.toString(10)}</span>
        </div>
        <div class="turtle-property">
          <span class="turtle-label"
            ><i class="fa fa-pen" aria-hidden="true"></i
          ></span>
          <span class="turtle-value turtle-pen">${thickness(t)}</span>
        </div>
        <div class="turtle-property">
          <span class="turtle-label"
            ><i class="fa fa-palette" aria-hidden="true"></i
          ></span>
          <span class="turtle-value turtle-colour" style="${`background: ${c}`}"
            >${c}</span
          >
        </div>
      </div>
    `;
  },
});

/** A raised pen is a negative thickness, and shown in brackets. */
const thickness = (t: number): string =>
  t < 0 ? `(${Math.abs(t).toString(10)})` : Math.abs(t).toString(10);
