import { colours } from "@/core/constants.ts";
import type { Cycle } from "../types.ts";
import { hex } from "../colour.ts";
import * as memory from "../memory.ts";
import { state, vcanvas } from "../state.ts";
import { turtle, turtx, turty, vcoords } from "../vcanvas.ts";

/** POLY/PFIL: draws the last `count` remembered coordinates as one polygon */
const drawPolygon = (cycle: Cycle, count: number, filled: boolean): void => {
  // fewer than 2 points draws nothing, matching the original system
  if (count >= 2) {
    const end = memory.coords.length;
    const start = count > end ? 0 : end - count;
    cycle.canvas.drawPolygon(
      turtle(vcanvas),
      memory.coords.slice(start, end).map(vcoords.bind(null, vcanvas)),
      filled,
    );
    cycle.drew();
  }
};

/** CIRC/BLOT/ELPS/EBLT: draws an arc of the given radii, centred on the turtle */
const drawArc = (
  cycle: Cycle,
  radiusX: number,
  radiusY: number,
  filled: boolean,
): void => {
  cycle.canvas.drawArc(
    turtle(vcanvas),
    turtx(vcanvas, radiusX + vcanvas.startx),
    turty(vcanvas, radiusY + vcanvas.starty),
    filled,
  );
  cycle.drew();
};

// canvas state

export const canv = (cycle: Cycle): void => {
  const sizey = memory.popValue();
  const sizex = memory.popValue();
  const starty = memory.popValue();
  const startx = memory.popValue();
  // a dimension of 1 pixel or less is a silent no-op, as in the original system
  if (sizex > 1 && sizey > 1) {
    const physX = turtx(vcanvas, memory.getTurtX());
    const physY = turty(vcanvas, memory.getTurtY());
    vcanvas.startx = startx;
    vcanvas.starty = starty;
    vcanvas.sizex = sizex;
    vcanvas.sizey = sizey;
    cycle.canvas.setVirtualCanvas(startx, starty, sizex, sizey);
    // remapped into the new mapping so the turtle stays where it visually was;
    // heading is left untouched
    memory.setTurtX(
      Math.round((physX * vcanvas.sizex) / vcanvas.width) + vcanvas.startx,
    );
    memory.setTurtY(
      Math.round((physY * vcanvas.sizey) / vcanvas.height) + vcanvas.starty,
    );
    cycle.output.updateTurtleProperty("x", memory.getTurtX());
    cycle.output.updateTurtleProperty("y", memory.getTurtY());
    memory.coords.push([memory.getTurtX(), memory.getTurtY()]);
    cycle.forceUpdate();
  }
};

export const reso = (cycle: Cycle): void => {
  const requestedHeight = memory.popValue();
  const requestedWidth = memory.popValue();
  let width = requestedWidth;
  let height = requestedHeight;
  if (Math.min(width, height) <= cycle.options.smallSize) {
    width *= 2;
    height *= 2;
    vcanvas.doubled = true;
  } else {
    vcanvas.doubled = false;
  }
  vcanvas.width = width;
  vcanvas.height = height;
  cycle.canvas.setResolution(width, height, vcanvas.doubled);
  cycle.canvas.clear("#FFFFFF");
  cycle.forceUpdate();
};

export const udat = (cycle: Cycle): void => {
  const update = memory.popValue() !== 0;
  state.update = update;
  if (update) {
    cycle.forceUpdate();
  }
};

// fills and colours

export const blnk = (cycle: Cycle): void => {
  cycle.canvas.clear(hex(memory.popValue()));
  cycle.drew();
};

export const rcol = (cycle: Cycle): void => {
  const colour = memory.popValue();
  const y = memory.popValue();
  const x = memory.popValue();
  cycle.canvas.floodFill(
    turtx(vcanvas, x),
    turty(vcanvas, y),
    colour,
    0,
    false,
  );
  cycle.drew();
};

export const fill = (cycle: Cycle): void => {
  const boundary = memory.popValue();
  const colour = memory.popValue();
  const y = memory.popValue();
  const x = memory.popValue();
  cycle.canvas.floodFill(
    turtx(vcanvas, x),
    turty(vcanvas, y),
    colour,
    boundary,
    true,
  );
  cycle.drew();
};

export const pixc = (cycle: Cycle): void => {
  const y = memory.popValue();
  const x = memory.popValue();
  memory.stack.push(
    cycle.canvas.readPixel(turtx(vcanvas, x), turty(vcanvas, y)),
  );
};

export const pixs = (cycle: Cycle): void => {
  const colour = memory.popValue();
  const y = memory.popValue();
  const x = memory.popValue();
  cycle.canvas.writePixel(
    turtx(vcanvas, x),
    turty(vcanvas, y),
    colour,
    vcanvas.doubled,
  );
  cycle.drew();
};

export const rgb = (): void => {
  // 1-indexed into the palette, wrapping in both directions
  let index = memory.popValue() % colours.length;
  if (index <= 0) {
    index += colours.length;
  }
  // the two lines above put `index` in 1..colours.length, so the subscript
  // cannot miss; a runtime guard here would be a branch no test could reach
  memory.stack.push(colours[index - 1]!.value);
};

export const mixc = (): void => {
  const secondProportion = memory.popValue();
  const firstProportion = memory.popValue();
  const secondColour = memory.popValue();
  const firstColour = memory.popValue();
  const total = firstProportion + secondProportion;
  const r = Math.round(
    (Math.floor(firstColour / 0x10000) * firstProportion +
      Math.floor(secondColour / 0x10000) * secondProportion) /
      total,
  );
  const g = Math.round(
    (Math.floor((firstColour & 0xff00) / 0x100) * firstProportion +
      Math.floor((secondColour & 0xff00) / 0x100) * secondProportion) /
      total,
  );
  const b = Math.round(
    ((firstColour & 0xff) * firstProportion +
      (secondColour & 0xff) * secondProportion) /
      total,
  );
  memory.stack.push(r * 0x10000 + g * 0x100 + b);
};

// drawing shapes

export const rmbr = (): void => {
  memory.coords.push([memory.getTurtX(), memory.getTurtY()]);
};

export const frgt = (): void => {
  const count = memory.popValue();
  memory.coords.length = Math.max(0, memory.coords.length - count);
};

export const poly = (cycle: Cycle): void => {
  drawPolygon(cycle, memory.popValue(), false);
};

export const pfil = (cycle: Cycle): void => {
  drawPolygon(cycle, memory.popValue(), true);
};

export const circ = (cycle: Cycle): void => {
  const radius = memory.popValue();
  drawArc(cycle, radius, radius, false);
};

export const blot = (cycle: Cycle): void => {
  const radius = memory.popValue();
  drawArc(cycle, radius, radius, true);
};

export const elps = (cycle: Cycle): void => {
  const radiusY = memory.popValue();
  const radiusX = memory.popValue();
  drawArc(cycle, radiusX, radiusY, false);
};

export const eblt = (cycle: Cycle): void => {
  const radiusY = memory.popValue();
  const radiusX = memory.popValue();
  drawArc(cycle, radiusX, radiusY, true);
};

export const box = (cycle: Cycle): void => {
  const filled = memory.popValue() !== 0;
  const colour = memory.popValue();
  const dy = memory.popValue();
  const dx = memory.popValue();
  cycle.canvas.drawBox(
    turtle(vcanvas),
    turtx(vcanvas, memory.getTurtX() + dx),
    turty(vcanvas, memory.getTurtY() + dy),
    hex(colour),
    filled,
  );
  cycle.drew();
};
