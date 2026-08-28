import { assertNoWombleLogs, machine, settle } from "../../lib/setup.ts";
import {
  attachRecordingContext,
  isCall,
  isSet,
  pixel,
  type RecordedEntry,
  type RecordingContext,
} from "./lib/recording.ts";
import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

const { attachCanvas, default: canvas } = await import(
  "@/client/adapters/canvas.ts"
);
const { cursors, fonts } = await import("@/core/constants.ts");

// The canvas port (src/client/adapters/canvas.ts): the one adapter that is a
// stream of imperative draw calls rather than state. jsdom has no canvas at
// all, so what a test can assert is the *call sequence* the adapter issues -
// which is the whole of this module's behaviour, since every method's job is
// to translate one machine instruction into 2D-context calls. `./lib/
// recording.ts` supplies the context that records them; layer 3 (the browser
// smoke suite) checks that real Chrome draws pixels from the same calls.

/** The turtle every draw call is issued for, unless a test says otherwise. */
const turtle = (
  overrides: Partial<{ x: number; y: number; t: number; c: string }> = {},
) => ({ x: 10, y: 20, d: 0, a: 360, t: 2, c: "#123456", ...overrides });

let element: HTMLCanvasElement;
let recording: RecordingContext;

/** The recorded entries, with the RGBA snapshots left out of the comparison. */
const entries = (): RecordedEntry[] => recording.entries;

beforeEach(() => {
  element = document.createElement("canvas");
  element.width = 300;
  element.height = 300;
  recording = attachRecordingContext(element);
  attachCanvas(element);
});

// Rule 6: every test ends with Womble having reported nothing.
afterEach(assertNoWombleLogs);

describe("the canvas resolution", () => {
  it("sets the element's own width and height, which is what clears it", () => {
    canvas.setResolution(640, 480);
    assertEquals(element.width, 640);
    assertEquals(element.height, 480);
  });

  it("asks for pixelated scaling below 500 in either dimension, and smooth above", () => {
    canvas.setResolution(1000, 1000);
    assertEquals(element.style.imageRendering, "auto");
    canvas.setResolution(100, 1000);
    assertEquals(element.style.imageRendering, "pixelated");
    canvas.setResolution(1000, 100);
    assertEquals(element.style.imageRendering, "pixelated");
  });

  // The coordinate labels beside the canvas change once per program, so they
  // are state rather than a draw call: this reports them to the machine store
  // and `<canvas-tab>` renders them.
  it("reports the virtual canvas to the machine store rather than drawing it", async () => {
    canvas.setVirtualCanvas(-100, -100, 200, 200);
    await settle();
    assertEquals(machine.getVirtualCanvas(), {
      startx: -100,
      starty: -100,
      sizex: 200,
      sizey: 200,
    });
    assertEquals(entries(), []);
  });
});

describe("the cursor", () => {
  it("takes its CSS from the numbered cursor", () => {
    canvas.setCursor(5);
    assertEquals(element.style.cursor, cursors[5].css);
    assertEquals(cursors[5].css, "move");
  });

  it("falls back to the default cursor for a code outside 0-15", () => {
    canvas.setCursor(-1);
    assertEquals(element.style.cursor, cursors[1].css);
    canvas.setCursor(16);
    assertEquals(element.style.cursor, cursors[1].css);
  });

  it("keeps code 0, which is a real cursor - none at all", () => {
    canvas.setCursor(0);
    assertEquals(element.style.cursor, "none");
  });
});

describe("clearing", () => {
  it("paints the whole element, at its current resolution", () => {
    canvas.setResolution(64, 32);
    canvas.clear("#ffffff");
    assertEquals(entries(), [
      { kind: "set", property: "fillStyle", value: "#ffffff" },
      { kind: "call", method: "fillRect", args: [0, 0, 64, 32] },
    ]);
  });
});

describe("drawing a line", () => {
  it("strokes from the turtle to the given point, in the turtle's colour and thickness", () => {
    canvas.drawLine(turtle(), 100, 200);
    assertEquals(entries(), [
      { kind: "call", method: "beginPath", args: [] },
      { kind: "call", method: "moveTo", args: [10, 20] },
      { kind: "call", method: "lineTo", args: [100, 200] },
      { kind: "set", property: "lineCap", value: "round" },
      { kind: "set", property: "lineWidth", value: 2 },
      { kind: "set", property: "strokeStyle", value: "#123456" },
      { kind: "call", method: "stroke", args: [] },
    ]);
  });

  // The Canvas 2D spec ignores an assignment of zero to lineWidth, so a
  // zero-thickness pen has to be clamped up explicitly; a raised pen is a
  // negative thickness and draws at its magnitude.
  it("clamps a zero thickness up to one, and takes a raised pen's magnitude", () => {
    canvas.drawLine(turtle({ t: 0 }), 1, 1);
    canvas.drawLine(turtle({ t: -7 }), 1, 1);
    const widths = entries().filter(
      (entry) => entry.kind === "set" && entry.property === "lineWidth",
    );
    assertEquals(widths, [
      { kind: "set", property: "lineWidth", value: 1 },
      { kind: "set", property: "lineWidth", value: 7 },
    ]);
  });
});

describe("drawing a polygon", () => {
  it("moves to the first coordinate and lines to the rest, then strokes it open", () => {
    canvas.drawPolygon(
      turtle(),
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      false,
    );
    assertEquals(entries(), [
      { kind: "call", method: "beginPath", args: [] },
      { kind: "call", method: "moveTo", args: [0, 0] },
      { kind: "call", method: "lineTo", args: [10, 0] },
      { kind: "call", method: "lineTo", args: [10, 10] },
      { kind: "set", property: "lineCap", value: "round" },
      { kind: "set", property: "lineWidth", value: 2 },
      { kind: "set", property: "strokeStyle", value: "#123456" },
      { kind: "call", method: "stroke", args: [] },
    ]);
  });

  it("closes the path and fills it in the turtle's colour when asked to fill", () => {
    canvas.drawPolygon(
      turtle(),
      [
        [0, 0],
        [10, 0],
      ],
      true,
    );
    assertEquals(entries().slice(3), [
      { kind: "call", method: "closePath", args: [] },
      { kind: "set", property: "fillStyle", value: "#123456" },
      { kind: "call", method: "fill", args: [] },
    ]);
  });
});

describe("drawing an arc", () => {
  it("is a plain circle when the two radii are equal", () => {
    canvas.drawArc(turtle(), 50, 50, false);
    assertEquals(entries(), [
      { kind: "call", method: "beginPath", args: [] },
      {
        kind: "call",
        method: "arc",
        args: [10, 20, 50, 0, 2 * Math.PI, false],
      },
      { kind: "set", property: "lineWidth", value: 2 },
      { kind: "set", property: "strokeStyle", value: "#123456" },
      { kind: "call", method: "stroke", args: [] },
    ]);
  });

  // An ellipse is the unit circle drawn under a scale transform, which is why
  // the save/restore pair is here and nowhere else in this adapter.
  it("scales the unit circle for an ellipse, restoring the transform after", () => {
    canvas.drawArc(turtle(), 40, 20, true);
    assertEquals(entries(), [
      { kind: "call", method: "beginPath", args: [] },
      { kind: "call", method: "save", args: [] },
      { kind: "call", method: "translate", args: [-30, 0] },
      { kind: "call", method: "scale", args: [40, 20] },
      { kind: "call", method: "arc", args: [1, 1, 1, 0, 2 * Math.PI, false] },
      { kind: "call", method: "restore", args: [] },
      { kind: "set", property: "fillStyle", value: "#123456" },
      { kind: "call", method: "fill", args: [] },
    ]);
  });
});

describe("drawing a box", () => {
  it("fills a rectangle from the turtle to the given corner, in the fill colour", () => {
    canvas.drawBox(turtle(), 110, 220, "#abcdef", false);
    assertEquals(entries(), [
      { kind: "call", method: "beginPath", args: [] },
      { kind: "call", method: "moveTo", args: [10, 20] },
      { kind: "call", method: "lineTo", args: [110, 20] },
      { kind: "call", method: "lineTo", args: [110, 220] },
      { kind: "call", method: "lineTo", args: [10, 220] },
      { kind: "call", method: "closePath", args: [] },
      { kind: "set", property: "fillStyle", value: "#abcdef" },
      { kind: "call", method: "fill", args: [] },
    ]);
  });

  // The border is the turtle's own colour and thickness, unlike the fill.
  it("strokes a border after the fill when asked for one", () => {
    canvas.drawBox(turtle(), 110, 220, "#abcdef", true);
    assertEquals(entries().slice(7), [
      { kind: "call", method: "fill", args: [] },
      { kind: "set", property: "lineCap", value: "round" },
      { kind: "set", property: "lineWidth", value: 2 },
      { kind: "set", property: "strokeStyle", value: "#123456" },
      { kind: "call", method: "stroke", args: [] },
    ]);
  });
});

describe("drawing text", () => {
  /** the last font assignment, which is what `fillText` draws with */
  const finalFont = (): unknown =>
    entries()
      .filter(isSet)
      .findLast((entry) => entry.property === "font")?.value;

  it("hangs the text from the turtle's position, in the turtle's colour", () => {
    canvas.drawText(turtle(), "hello", 0x5, 12);
    assertEquals(entries(), [
      { kind: "set", property: "textBaseline", value: "hanging" },
      { kind: "set", property: "fillStyle", value: "#123456" },
      { kind: "set", property: "font", value: `12pt ${fonts[5].css}` },
      { kind: "call", method: "fillText", args: ["hello", 10, 20] },
    ]);
  });

  it("takes the typeface from the low nibble of the font code", () => {
    canvas.drawText(turtle(), "x", 0xf, 8);
    assertEquals(finalFont(), `8pt ${fonts[0xf].css}`);
  });

  it("prefixes bold and italic from bits 4 and 5, italic outermost", () => {
    canvas.drawText(turtle(), "x", 0x10, 10);
    assertEquals(finalFont(), `bold 10pt ${fonts[0].css}`);
    recording.reset();
    canvas.drawText(turtle(), "x", 0x20, 10);
    assertEquals(finalFont(), `italic 10pt ${fonts[0].css}`);
    recording.reset();
    canvas.drawText(turtle(), "x", 0x30, 10);
    assertEquals(finalFont(), `italic bold 10pt ${fonts[0].css}`);
  });

  // [known limitation] TODO.md 1.5: bits 6 and 7 are decoded and then
  // ignored, so underlined and strikethrough text draws as plain text. The
  // assertion is what the code does, not what it should do - changing it
  // trips this test rather than passing silently.
  it("ignores the underline and strikethrough bits", () => {
    canvas.drawText(turtle(), "x", 0xc0, 10);
    assertEquals(finalFont(), `10pt ${fonts[0].css}`);
  });
});

describe("reading and writing single pixels", () => {
  it("reads a pixel back as one 0xRRGGBB number", () => {
    recording.seedImageData([0x12, 0x34, 0x56, 0xff]);
    assertEquals(canvas.readPixel(7, 9), 0x123456);
    assertEquals(entries(), [
      { kind: "call", method: "getImageData", args: [7, 9, 1, 1] },
    ]);
  });

  it("writes one opaque pixel", () => {
    canvas.writePixel(3, 4, 0x00ff00, false);
    assertEquals(entries(), [
      { kind: "call", method: "createImageData", args: [1, 1] },
      {
        kind: "call",
        method: "putImageData",
        args: [{ data: pixel(0x00ff00) }, 3, 4],
      },
    ]);
  });

  // At a doubled resolution one machine pixel is a 2x2 block, drawn up and to
  // the left of the point itself.
  it("writes a 2x2 block when the resolution is doubled", () => {
    canvas.writePixel(3, 4, 0x00ff00, true);
    const positions = entries()
      .filter(isCall)
      .filter((entry) => entry.method === "putImageData")
      .map((entry) => entry.args.slice(1));
    assertEquals(positions, [
      [3, 4],
      [2, 4],
      [3, 3],
      [2, 3],
    ]);
  });
});

describe("flood filling", () => {
  // A 5x5 image: a ring of BOUNDARY at x or y of 1 or 4, three WHITE pixels
  // inside it and one OTHER pixel, and an untouched outer row and column at 0
  // (which the fill's own `nextX > 0` test can never reach anyway).
  const WHITE = 0xffffff;
  const BOUNDARY = 0x0000ff;
  const OTHER = 0x00ff00;
  const FILL = 0xff0000;

  const image = (): number[] => {
    const data: number[] = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const colour =
          x === 0 || y === 0
            ? WHITE
            : x === 1 || x === 4 || y === 1 || y === 4
              ? BOUNDARY
              : x === 3 && y === 3
                ? OTHER
                : WHITE;
        data.push(...pixel(colour));
      }
    }
    return data;
  };

  /** the 5x5 grid of colours in the snapshot `putImageData` was handed */
  const filled = (): number[][] => {
    const last = entries().filter(isCall).at(-1);
    const data = (last?.args[0] as { data: number[] }).data;
    return [0, 1, 2, 3, 4].map((y) =>
      [0, 1, 2, 3, 4].map((x) => {
        const offset = (y * 5 + x) * 4;
        return (
          data[offset]! * 65536 + data[offset + 1]! * 256 + data[offset + 2]!
        );
      }),
    );
  };

  beforeEach(() => {
    canvas.setResolution(5, 5);
    recording.seedImageData(image());
    recording.reset();
  });

  // Without boundary mode the fill spreads across pixels matching the colour
  // it started on, so the odd pixel inside the ring stops it just as the ring
  // itself does.
  it("spreads over the starting colour only, and puts the whole image back", () => {
    canvas.floodFill(2, 2, FILL, BOUNDARY, false);
    assertEquals(filled(), [
      [WHITE, WHITE, WHITE, WHITE, WHITE],
      [WHITE, BOUNDARY, BOUNDARY, BOUNDARY, BOUNDARY],
      [WHITE, BOUNDARY, FILL, FILL, BOUNDARY],
      [WHITE, BOUNDARY, FILL, OTHER, BOUNDARY],
      [WHITE, BOUNDARY, BOUNDARY, BOUNDARY, BOUNDARY],
    ]);
    assertEquals(entries()[0], {
      kind: "call",
      method: "getImageData",
      args: [0, 0, 5, 5],
    });
  });

  // In boundary mode it spreads over everything that isn't the boundary
  // colour, so the odd pixel is filled too.
  it("spreads over every colour but the boundary's in boundary mode", () => {
    canvas.floodFill(2, 2, FILL, BOUNDARY, true);
    assertEquals(filled(), [
      [WHITE, WHITE, WHITE, WHITE, WHITE],
      [WHITE, BOUNDARY, BOUNDARY, BOUNDARY, BOUNDARY],
      [WHITE, BOUNDARY, FILL, FILL, BOUNDARY],
      [WHITE, BOUNDARY, FILL, FILL, BOUNDARY],
      [WHITE, BOUNDARY, BOUNDARY, BOUNDARY, BOUNDARY],
    ]);
  });
});

// jsdom's own canvas has no 2D context (test/ui/lib/setup.ts makes
// `getContext` return null, which is what a browser without the npm `canvas`
// package does too), and the server has no canvas element at all. Every
// method has to survive both, since the machine draws through this port
// regardless of what rendered it.
describe("with nothing to draw on", () => {
  const drawEverything = (): void => {
    canvas.setResolution(100, 100);
    canvas.clear("#fff");
    canvas.setCursor(3);
    canvas.drawLine(turtle(), 1, 1);
    canvas.drawPolygon(turtle(), [[0, 0]], true);
    canvas.drawArc(turtle(), 1, 2, true);
    canvas.drawBox(turtle(), 1, 1, "#fff", true);
    canvas.drawText(turtle(), "x", 0, 10);
    canvas.writePixel(0, 0, 0, true);
    canvas.floodFill(0, 0, 0, 0, false);
  };

  it("does nothing at all with no canvas attached", () => {
    attachCanvas(null);
    drawEverything();
    assertEquals(canvas.readPixel(0, 0), 0);
    assertEquals(entries(), []);
  });

  it("does nothing but move the cursor with a canvas that has no context", () => {
    // the prototype stub every other canvas in this layer gets
    const contextless = document.createElement("canvas");
    attachCanvas(contextless);
    drawEverything();
    assertEquals(canvas.readPixel(0, 0), 0);
    // the two methods that need only the element still work
    assertEquals(contextless.width, 100);
    assertEquals(contextless.style.cursor, cursors[3].css);
    assertEquals(entries(), []);
  });
});
