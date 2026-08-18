import type { Turtle, VirtualCanvas } from "./types.ts";
import { hex } from "./utils.ts";
import { getTurtle } from "./memory.ts";

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

export const turtx = (virtualCanvas: VirtualCanvas, x: number): number => {
  const exact =
    ((x - virtualCanvas.startx) * virtualCanvas.width) / virtualCanvas.sizex;
  return virtualCanvas.doubled ? Math.round(exact) + 1 : Math.round(exact);
};

export const turty = (virtualCanvas: VirtualCanvas, y: number): number => {
  const exact =
    ((y - virtualCanvas.starty) * virtualCanvas.height) / virtualCanvas.sizey;
  return virtualCanvas.doubled ? Math.round(exact) + 1 : Math.round(exact);
};

export const turtt = (virtualCanvas: VirtualCanvas, t: number): number => {
  return virtualCanvas.doubled ? t * 2 : t;
};

export const vcoords = (
  virtualCanvas: VirtualCanvas,
  coords: [number, number],
): [number, number] => [
  turtx(virtualCanvas, coords[0]),
  turty(virtualCanvas, coords[1]),
];

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
