/// <reference lib="dom" />
import { define, html } from "@merivale/womble";
import { attachCanvas } from "@/client/adapters/canvas.ts";
import { attachInput } from "@/client/adapters/input.ts";
import { attachConsole } from "@/client/adapters/output.ts";
import { coordinates, getVirtualCanvas, machineStore } from "./machine.ts";
import {
  paneAttributes,
  paneClasses,
  paneFontVariables,
  paneSources,
} from "./tab-pane.ts";

// The Canvas & Console tab: the turtle's canvas, the coordinate labels down its
// two edges, and the console the program prints to underneath.
//
// **The pane is a component; the pixels are not.** This render owns the chrome
// only. Every draw call and every character of console text goes straight to the
// DOM from src/client/adapters. The two are compatible because Womble patches
// rather than replaces: a render touches the holes that moved and leaves the
// `<canvas>` and the `<pre>` alone.
//
// What would break that is a render producing a *different* template, since
// Womble rebuilds from scratch when the strings change - hence one template with
// no branches, and visibility as a class hole.
define("canvas-tab", {
  attributes: paneAttributes,

  sources: [...paneSources, machineStore],

  render: ({ active }) => {
    const { startx, starty, sizex, sizey } = getVirtualCanvas();
    return html`
      <div class="${paneClasses(active, "")}" style="${paneFontVariables()}">
        <div class="canvas">
          <div class="canvas-left">
            <div></div>
            <div class="canvas-coords">${labels(starty, sizey)}</div>
          </div>
          <div class="canvas-right">
            <div class="canvas-coords">${labels(startx, sizex)}</div>
            <div class="canvas-wrapper">
              <canvas width="1000" height="1000"></canvas>
            </div>
          </div>
        </div>
        <pre class="console"></pre>
      </div>
    `;
  },

  effects: {
    // Hands the three adapters that draw here their elements, once this
    // component's first render has made them - which is also what guarantees
    // they hold the nodes on screen rather than the server-rendered ones
    // hydration threw away.
    //
    // Effects re-mount on a reconnect, so this must be safe to run twice: the
    // two `attach*` calls overwrite, and `attachInput` returns its own cleanup.
    machinePorts: ({ element }) => {
      const canvas = element.querySelector("canvas");
      attachCanvas(canvas);
      attachConsole(element.querySelector("pre.console"));
      return attachInput(canvas);
    },
  },
});

const labels = (start: number, size: number) =>
  coordinates(start, size).map(
    (coordinate) => html` <span>${coordinate.toString(10)}</span> `,
  );
