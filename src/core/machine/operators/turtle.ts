import type { Cycle } from "../types.ts";
import { hex } from "../colour.ts";
import { MachineError } from "../error.ts";
import * as memory from "../memory.ts";
import { vcanvas } from "../state.ts";
import { turtle, turtx, turty } from "../vcanvas.ts";

/**
 * The shared tail of TOXY/MVXY/DRXY/FWRD/BACK: moves the turtle to (x, y),
 * drawing the line first if `draw` is set and the pen is down, then notifying
 * the output port and recording the coordinate.
 *
 * The line has to be drawn *before* turtx/turty move, because `turtle()` reads
 * the turtle's current position for the line's start point.
 */
const moveTo = (cycle: Cycle, x: number, y: number, draw: boolean): void => {
  if (draw && memory.getTurtT() >= 0) {
    cycle.canvas.drawLine(
      turtle(vcanvas),
      turtx(vcanvas, x),
      turty(vcanvas, y),
    );
    cycle.drew();
  }
  memory.setTurtX(x);
  memory.setTurtY(y);
  cycle.output.updateTurtleProperty("x", x);
  cycle.output.updateTurtleProperty("y", y);
  memory.coords.push([x, y]);
};

/** the turtle's heading in radians */
const heading = (): number =>
  (memory.getTurtD() * Math.PI) / (memory.getTurtA() / 2);

/** sets the turtle's direction and tells the output port about it */
const setDirection = (cycle: Cycle, direction: number): void => {
  memory.setTurtD(direction);
  cycle.output.updateTurtleProperty("d", direction);
};

// basic turtle settings

export const home = (cycle: Cycle): void => {
  // truncating division, matching Pascal's "cvminx + (canvasx div 2)"
  memory.setTurtX(vcanvas.startx + Math.floor(vcanvas.sizex / 2));
  memory.setTurtY(vcanvas.starty + Math.floor(vcanvas.sizey / 2));
  memory.setTurtD(0);
  cycle.output.updateTurtleProperty("x", memory.getTurtX());
  cycle.output.updateTurtleProperty("y", memory.getTurtY());
  cycle.output.updateTurtleProperty("d", memory.getTurtD());
  memory.coords.push([memory.getTurtX(), memory.getTurtY()]);
};

export const setx = (cycle: Cycle): void => {
  const x = memory.popValue();
  memory.setTurtX(x);
  cycle.output.updateTurtleProperty("x", x);
  memory.coords.push([memory.getTurtX(), memory.getTurtY()]);
};

export const sety = (cycle: Cycle): void => {
  const y = memory.popValue();
  memory.setTurtY(y);
  cycle.output.updateTurtleProperty("y", y);
  memory.coords.push([memory.getTurtX(), memory.getTurtY()]);
};

export const setd = (cycle: Cycle): void => {
  setDirection(cycle, memory.popValue() % memory.getTurtA());
};

export const angl = (cycle: Cycle): void => {
  const angles = memory.popValue();
  if (memory.getTurtA() === 0) {
    // only before angles is set for the first time
    memory.setTurtA(angles);
  }
  if (angles === 0) {
    // never let angles be set to zero
    throw new MachineError("Angles cannot be set to zero.");
  }
  const direction = Math.round(
    angles + (memory.getTurtD() * angles) / memory.getTurtA(),
  );
  memory.setTurtD(direction % angles);
  memory.setTurtA(angles);
  cycle.output.updateTurtleProperty("d", direction % angles);
  cycle.output.updateTurtleProperty("a", angles);
};

export const thik = (cycle: Cycle): void => {
  const setting = memory.popValue();
  const thickness = Math.abs(setting);
  const penWasUp = memory.getTurtT() < 0;
  if (setting < 0) {
    memory.setTurtT(penWasUp ? thickness : -thickness);
  } else {
    memory.setTurtT(penWasUp ? -thickness : thickness);
  }
  cycle.output.updateTurtleProperty("t", memory.getTurtT());
};

export const pen = (cycle: Cycle): void => {
  const penDown = memory.popValue() !== 0;
  const thickness = Math.abs(memory.getTurtT());
  // the sign of turtt is the pen: negative is up, positive is down
  const turtt = penDown ? thickness : -thickness;
  memory.setTurtT(turtt);
  cycle.output.updateTurtleProperty("t", turtt);
};

export const colr = (cycle: Cycle): void => {
  const colour = memory.popValue();
  memory.setTurtC(colour);
  cycle.output.updateTurtleProperty("c", hex(colour));
};

// turtle movement

export const toxy = (cycle: Cycle): void => {
  const y = memory.popValue();
  const x = memory.popValue();
  moveTo(cycle, x, y, false);
};

export const mvxy = (cycle: Cycle): void => {
  const dy = memory.popValue();
  const dx = memory.popValue();
  moveTo(cycle, memory.getTurtX() + dx, memory.getTurtY() + dy, false);
};

export const drxy = (cycle: Cycle): void => {
  const dy = memory.popValue();
  const dx = memory.popValue();
  moveTo(cycle, memory.getTurtX() + dx, memory.getTurtY() + dy, true);
};

export const fwrd = (cycle: Cycle): void => {
  const distance = memory.popValue();
  const radians = heading();
  moveTo(
    cycle,
    memory.getTurtX() + Math.round(Math.sin(radians) * distance),
    memory.getTurtY() - Math.round(Math.cos(radians) * distance),
    true,
  );
};

export const back = (cycle: Cycle): void => {
  const distance = memory.popValue();
  const radians = heading();
  moveTo(
    cycle,
    memory.getTurtX() - Math.round(Math.sin(radians) * distance),
    memory.getTurtY() + Math.round(Math.cos(radians) * distance),
    true,
  );
};

export const left = (cycle: Cycle): void => {
  const angles = memory.getTurtA();
  const turn = memory.popValue();
  setDirection(cycle, (memory.getTurtD() + angles - (turn % angles)) % angles);
};

export const rght = (cycle: Cycle): void => {
  const angles = memory.getTurtA();
  const turn = memory.popValue();
  setDirection(cycle, (memory.getTurtD() + angles + (turn % angles)) % angles);
};

export const turn = (cycle: Cycle): void => {
  const y = memory.popValue();
  const x = memory.popValue();
  let radians: number;
  if (Math.abs(y) >= Math.abs(x)) {
    radians = Math.atan(-x / y);
    if (y > 0) {
      radians += Math.PI;
    } else if (x < 0) {
      radians += 2;
      radians *= Math.PI;
    }
  } else {
    radians = Math.atan(y / x);
    if (x > 0) {
      radians += Math.PI;
    } else {
      radians += 3;
      radians *= Math.PI;
    }
    radians /= 2;
  }
  setDirection(
    cycle,
    Math.round((radians * memory.getTurtA()) / Math.PI / 2) % memory.getTurtA(),
  );
};
