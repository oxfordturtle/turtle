import type { Turtle, VirtualCanvas } from "./types.ts";
import { hex } from "./colour.ts";
import { getTurtle } from "./memory.ts";

/**
 * The turtle as the canvas and output ports want it: position mapped into real
 * pixels, thickness scaled with the resolution, colour as a hex string.
 */
export const turtle = (virtualCanvas: VirtualCanvas): Turtle => {
  const t = getTurtle();
  return {
    x: turtx(virtualCanvas, t.x),
    y: turty(virtualCanvas, t.y),
    d: t.d,
    a: t.a,
    t: turtt(virtualCanvas, t.t),
    c: hex(t.c),
  };
};

/** a virtual x coordinate to a real one; `virtx` is the inverse */
export const turtx = (virtualCanvas: VirtualCanvas, x: number): number => {
  const exact =
    ((x - virtualCanvas.startx) * virtualCanvas.width) / virtualCanvas.sizex;
  return virtualCanvas.doubled ? Math.round(exact) + 1 : Math.round(exact);
};

/** a virtual y coordinate to a real one; `virty` is the inverse */
export const turty = (virtualCanvas: VirtualCanvas, y: number): number => {
  const exact =
    ((y - virtualCanvas.starty) * virtualCanvas.height) / virtualCanvas.sizey;
  return virtualCanvas.doubled ? Math.round(exact) + 1 : Math.round(exact);
};

/** pen thickness in real pixels: a doubled canvas draws twice as thick */
export const turtt = (virtualCanvas: VirtualCanvas, t: number): number => {
  return virtualCanvas.doubled ? t * 2 : t;
};

/** a remembered [x, y] pair to real pixels, for the polygon operators */
export const vcoords = (
  virtualCanvas: VirtualCanvas,
  coords: [number, number],
): [number, number] => [
  turtx(virtualCanvas, coords[0]),
  turty(virtualCanvas, coords[1]),
];

/**
 * A real x coordinate back to a virtual one, for reporting where the mouse is.
 * Floors rather than rounds: the answer names the virtual cell the pixel falls
 * in, so every real pixel maps to exactly one of them.
 */
export const virtx = (
  canvasLeft: number,
  canvasWidth: number,
  virtualCanvas: VirtualCanvas,
  x: number,
): number => {
  const exact =
    ((x - canvasLeft) * virtualCanvas.sizex) / canvasWidth +
    virtualCanvas.startx;
  return Math.floor(exact);
};

/** a real y coordinate back to a virtual one; floors, as `virtx` does */
export const virty = (
  canvasTop: number,
  canvasHeight: number,
  virtualCanvas: VirtualCanvas,
  y: number,
): number => {
  const exact =
    ((y - canvasTop) * virtualCanvas.sizey) / canvasHeight +
    virtualCanvas.starty;
  return Math.floor(exact);
};
