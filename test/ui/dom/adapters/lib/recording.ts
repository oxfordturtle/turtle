/**
 * A recording fake of the 2D canvas context, for the adapter tests.
 *
 * jsdom has no real canvas: `test/ui/lib/setup.ts` stubs
 * `HTMLCanvasElement.prototype.getContext` to return null, which is the
 * degraded mode the canvas adapter is written to cope with. To see what the
 * adapter would actually draw, a test patches `getContext` on one specific
 * element (via `attachRecordingContext`) to hand back one of these instead:
 * an object that records every method call and every property assignment, in
 * the exact order the adapter issued them, so a test can assert the full call
 * sequence rather than "something happened".
 *
 * Image data is the one piece of two-way traffic: `seedImageData` installs
 * the pixels the next `getImageData` returns (for `readPixel`/`floodFill`),
 * and recorded `putImageData` entries carry a plain-array *snapshot* of the
 * data at call time, so a later mutation of the same ImageData object can't
 * falsify an assertion.
 */

export type RecordedEntry =
  | { kind: "call"; method: string; args: unknown[] }
  | { kind: "set"; property: string; value: unknown };

/** Narrows to a recorded method call, for reading one back out of `entries`. */
export const isCall = (
  entry: RecordedEntry,
): entry is Extract<RecordedEntry, { kind: "call" }> => entry.kind === "call";

/** Narrows to a recorded property assignment. */
export const isSet = (
  entry: RecordedEntry,
): entry is Extract<RecordedEntry, { kind: "set" }> => entry.kind === "set";

export type RecordingContext = {
  /** every method call and property assignment, oldest first */
  readonly entries: RecordedEntry[];
  /** the fake itself, typed as the real thing for the adapter's benefit */
  readonly context: CanvasRenderingContext2D;
  /** empties `entries`, so a test can set up and then assert from a clean slate */
  reset(): void;
  /** installs the RGBA bytes the next `getImageData` call returns */
  seedImageData(data: number[]): void;
};

const METHODS = [
  "beginPath",
  "moveTo",
  "lineTo",
  "stroke",
  "fill",
  "closePath",
  "arc",
  "save",
  "restore",
  "translate",
  "scale",
  "fillRect",
  "fillText",
] as const;

const PROPERTIES = [
  "fillStyle",
  "strokeStyle",
  "lineWidth",
  "lineCap",
  "font",
  "textBaseline",
] as const;

export const recordingContext = (): RecordingContext => {
  const entries: RecordedEntry[] = [];
  const values: Record<string, unknown> = {};
  let seeded: number[] | null = null;

  const target: Record<string, unknown> = {};

  for (const method of METHODS) {
    target[method] = (...args: unknown[]): void => {
      entries.push({ kind: "call", method, args });
    };
  }

  // assignments are recorded AND stored: `drawText` reads `context.font` back
  // to build "bold ..." on top of what it just set
  for (const property of PROPERTIES) {
    Object.defineProperty(target, property, {
      get: () => values[property],
      set: (value: unknown) => {
        values[property] = value;
        entries.push({ kind: "set", property, value });
      },
    });
  }

  target.getImageData = (
    x: number,
    y: number,
    width: number,
    height: number,
  ): { width: number; height: number; data: Uint8ClampedArray } => {
    entries.push({
      kind: "call",
      method: "getImageData",
      args: [x, y, width, height],
    });
    const data = seeded
      ? Uint8ClampedArray.from(seeded)
      : new Uint8ClampedArray(width * height * 4);
    return { width, height, data };
  };

  target.createImageData = (
    width: number,
    height: number,
  ): { width: number; height: number; data: Uint8ClampedArray } => {
    entries.push({
      kind: "call",
      method: "createImageData",
      args: [width, height],
    });
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
  };

  target.putImageData = (
    image: { data: Uint8ClampedArray },
    x: number,
    y: number,
  ): void => {
    entries.push({
      kind: "call",
      method: "putImageData",
      args: [{ data: Array.from(image.data) }, x, y],
    });
  };

  return {
    entries,
    context: target as unknown as CanvasRenderingContext2D,
    reset: () => {
      entries.length = 0;
    },
    seedImageData: (data: number[]) => {
      seeded = data;
    },
  };
};

/**
 * Patches `getContext` on this one element to return a fresh recording fake,
 * leaving the prototype stub (and so every other canvas) alone.
 */
export const attachRecordingContext = (
  canvas: HTMLCanvasElement,
): RecordingContext => {
  const recording = recordingContext();
  canvas.getContext = (() =>
    recording.context) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  return recording;
};

/** The RGBA bytes for one pixel of a 0xRRGGBB colour, as the adapter writes them. */
export const pixel = (colour: number): number[] => [
  (colour >> 16) & 0xff,
  (colour >> 8) & 0xff,
  colour & 0xff,
  0xff,
];
