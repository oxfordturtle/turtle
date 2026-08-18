/// <reference lib="dom" />

import type { Canvas, Turtle } from "@/core/machine.ts";
import { cursors, fonts } from "@/core/constants.ts";
import { setVirtualCanvas as reportVirtualCanvas } from "@/islands/turtle-system/machine.ts";

/**
 * The machine's canvas port: a stream of imperative draw calls, and deliberately
 * kept imperative - routing `lineTo()` through a template diff would be a real
 * regression.
 *
 * The element comes from `<canvas-tab>`'s mount effect rather than a query at
 * import time, which is what lets the markup live inside an island at all: an
 * island's first render replaces every node inside it, so a query would leave
 * this adapter holding a detached canvas.
 *
 * The coordinate labels beside the canvas are not written here: they change once
 * per program rather than per draw call, so `setVirtualCanvas` reports them to
 * the machine store and `<canvas-tab>` renders them.
 */

let canvas: HTMLCanvasElement | null = null;
let context: CanvasRenderingContext2D | null = null;

/** Installs the canvas to draw on. Called by `<canvas-tab>`'s mount effect. */
export const attachCanvas = (element: HTMLCanvasElement | null): void => {
  canvas = element;
  context = element?.getContext("2d") ?? null;
};

// The resolution stays here rather than becoming rendered state: assigning
// `canvas.width` clears the canvas, and `reset()` calls this immediately before
// a program starts drawing, so a `width="${...}"` hole would land on the next
// animation frame and wipe whatever had been drawn in between.
const setResolution = (width: number, height: number): void => {
  if (!canvas) return;
  canvas.style.imageRendering =
    width < 500 || height < 500 ? "pixelated" : "auto";
  canvas.width = width;
  canvas.height = height;
};

const setVirtualCanvas = (
  startx: number,
  starty: number,
  sizex: number,
  sizey: number,
): void => {
  reportVirtualCanvas(startx, starty, sizex, sizey);
};

const clear = (colour: string): void => {
  if (!canvas || !context) return;
  context.fillStyle = colour;
  context.fillRect(0, 0, canvas.width, canvas.height);
};

const setCursor = (code: number): void => {
  if (!canvas) return;
  const corrected = code < 0 || code > 15 ? 1 : code;
  canvas.style.cursor = cursors[corrected].css;
};

// the Canvas 2D spec ignores an assignment of zero to lineWidth, leaving it at
// whatever it was, so a zero-thickness pen must be clamped up to 1 explicitly
const strokeWidth = (t: number): number => Math.max(Math.abs(t), 1);

const drawLine = (turtle: Turtle, toX: number, toY: number): void => {
  if (!context) return;
  context.beginPath();
  context.moveTo(turtle.x, turtle.y);
  context.lineTo(toX, toY);
  context.lineCap = "round";
  context.lineWidth = strokeWidth(turtle.t);
  context.strokeStyle = turtle.c;
  context.stroke();
};

const drawPolygon = (
  turtle: Turtle,
  coords: [number, number][],
  fill: boolean,
): void => {
  // bound locally because `context` is reassignable, so TypeScript won't carry
  // the null check into the closure below
  const ctx = context;
  if (!ctx) return;
  ctx.beginPath();
  coords.forEach((coord, index) => {
    if (index === 0) {
      ctx.moveTo(coord[0], coord[1]);
    } else {
      ctx.lineTo(coord[0], coord[1]);
    }
  });
  if (fill) {
    ctx.closePath();
    ctx.fillStyle = turtle.c;
    ctx.fill();
  } else {
    ctx.lineCap = "round";
    ctx.lineWidth = strokeWidth(turtle.t);
    ctx.strokeStyle = turtle.c;
    ctx.stroke();
  }
};

const drawArc = (
  turtle: Turtle,
  radiusX: number,
  radiusY: number,
  fill: boolean,
): void => {
  if (!context) return;
  context.beginPath();
  if (radiusX === radiusY) {
    context.arc(turtle.x, turtle.y, radiusX, 0, 2 * Math.PI, false);
  } else {
    context.save();
    context.translate(turtle.x - radiusX, turtle.y - radiusY);
    context.scale(radiusX, radiusY);
    context.arc(1, 1, 1, 0, 2 * Math.PI, false);
    context.restore();
  }
  if (fill) {
    context.fillStyle = turtle.c;
    context.fill();
  } else {
    context.lineWidth = strokeWidth(turtle.t);
    context.strokeStyle = turtle.c;
    context.stroke();
  }
};

const drawBox = (
  turtle: Turtle,
  toX: number,
  toY: number,
  fillColour: string,
  border: boolean,
): void => {
  if (!context) return;
  context.beginPath();
  context.moveTo(turtle.x, turtle.y);
  context.lineTo(toX, turtle.y);
  context.lineTo(toX, toY);
  context.lineTo(turtle.x, toY);
  context.closePath();
  context.fillStyle = fillColour;
  context.fill();
  if (border) {
    context.lineCap = "round";
    context.lineWidth = strokeWidth(turtle.t);
    context.strokeStyle = turtle.c;
    context.stroke();
  }
};

const drawText = (
  turtle: Turtle,
  text: string,
  font: number,
  size: number,
): void => {
  if (!context) return;
  context.textBaseline = "hanging";
  context.fillStyle = turtle.c;
  context.font = `${size}pt ${fonts[font & 0xf].css}`;
  if ((font & 0x10) > 0) {
    // bold text
    context.font = `bold ${context.font}`;
  }
  if ((font & 0x20) > 0) {
    // italic text
    context.font = `italic ${context.font}`;
  }
  if ((font & 0x40) > 0) {
    // underlined text
    // TODO ...
  }
  if ((font & 0x80) > 0) {
    // strikethrough text
    // TODO ...
  }
  context.fillText(text, turtle.x, turtle.y);
};

const readPixel = (x: number, y: number): number => {
  if (!context) return 0;
  const image = context.getImageData(x, y, 1, 1);
  return image.data[0] * 65536 + image.data[1] * 256 + image.data[2];
};

const writePixel = (
  x: number,
  y: number,
  colour: number,
  doubled: boolean,
): void => {
  if (!context) return;
  const img = context.createImageData(1, 1);
  img.data[0] = (colour >> 16) & 0xff;
  img.data[1] = (colour >> 8) & 0xff;
  img.data[2] = colour & 0xff;
  img.data[3] = 0xff;
  context.putImageData(img, x, y);
  if (doubled) {
    context.putImageData(img, x - 1, y);
    context.putImageData(img, x, y - 1);
    context.putImageData(img, x - 1, y - 1);
  }
};

const floodFill = (
  x: number,
  y: number,
  fillColour: number,
  boundaryColour: number,
  boundaryMode: boolean,
): void => {
  if (!canvas || !context) return;
  const img = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixStack: number[] = [];
  const dx = [0, -1, 1, 0];
  const dy = [-1, 0, 0, 1];
  let i = 0;
  let offset = (y * canvas.width + x) * 4;
  const c3 =
    256 * 256 * img.data[offset] +
    256 * img.data[offset + 1] +
    img.data[offset + 2];
  let nextX: number;
  let nextY: number;
  let nextC: number;
  let test1: boolean;
  let test2: boolean;
  let test3: boolean;
  let tx = x;
  let ty = y;
  pixStack.push(tx);
  pixStack.push(ty);
  while (pixStack.length > 0) {
    ty = pixStack.pop() as number;
    tx = pixStack.pop() as number;
    for (i = 0; i < 4; i += 1) {
      nextX = tx + dx[i];
      nextY = ty + dy[i];
      test1 = nextX > 0 && nextX <= canvas.width;
      test2 = nextY > 0 && nextY <= canvas.height;
      if (test1 && test2) {
        offset = (nextY * canvas.width + nextX) * 4;
        nextC = 256 * 256 * img.data[offset];
        nextC += 256 * img.data[offset + 1];
        nextC += img.data[offset + 2];
        test1 = nextC !== fillColour;
        test2 = nextC !== boundaryColour || !boundaryMode;
        test3 = nextC === c3 || boundaryMode;
        if (test1 && test2 && test3) {
          offset = (nextY * canvas.width + nextX) * 4;
          img.data[offset] = (fillColour & 0xff0000) >> 16;
          img.data[offset + 1] = (fillColour & 0xff00) >> 8;
          img.data[offset + 2] = fillColour & 0xff;
          pixStack.push(nextX);
          pixStack.push(nextY);
        }
      }
    }
  }
  context.putImageData(img, 0, 0);
};

export default {
  setResolution,
  setVirtualCanvas,
  clear,
  setCursor,
  drawLine,
  drawPolygon,
  drawArc,
  drawBox,
  drawText,
  readPixel,
  writePixel,
  floodFill,
} satisfies Canvas;
