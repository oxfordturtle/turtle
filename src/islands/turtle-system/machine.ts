/// <reference lib="dom" />
import type {
  MemoryDump,
  StateChange,
  TurtleProperty,
} from "@/core/machine.ts";
import { store } from "@merivale/womble";

/**
 * What the running machine is telling the UI: where the turtle is, whether the
 * program is running, and the memory image when something asks for one.
 *
 * **What deliberately does _not_ come through here**: the canvas pixels and the
 * console/output text. Those stream at a rate no re-render can follow, so they
 * stay imperative in the adapters (src/client/adapters/).
 *
 * **No side effects at import time**, so an island module is free to import it,
 * including one that renders on a page with no system app on it at all.
 */

// ------------------------------------------------------------------ the store

/**
 * **Coalesced**, unlike ./program.ts's. `setTurtleProperty` is called from
 * inside the machine's instruction loop, so a running program produces thousands
 * of these a second; Womble re-renders inline on a notification, so `coalesce`
 * notifies once an animation frame instead. The commit itself stays immediate,
 * so a flush always renders the latest values rather than a queue of stale ones.
 *
 * Never seeded: a page starts at what `reset()` shows, and there is nothing a
 * request could know that would improve on it.
 */
export const machineStore = store("machine", {
  coalesce: true,
  state: {
    // The turtle's own properties, as the machine last reported them. The
    // initial values are the ones `reset()` sets, so a page that has never run
    // anything shows what a page that has just been reset shows.
    turtle: { x: 500, y: 500, d: 0, a: 360, t: 2, c: "#000" },
    // Whether a program is loaded and running (i.e. whether HALT does
    // anything), and whether it's running *unpaused* (which is when RUN offers
    // to pause it).
    status: { running: false, playing: false },
    // The virtual canvas the program has asked for, which is what the
    // coordinate labels down the side of the canvas are derived from.
    vcanvas: { startx: 0, starty: 0, sizex: 1000, sizey: 1000 },
    // The last memory image dumped, either by the user pressing the Memory
    // tab's button or by the program running a DUMP instruction.
    memory: { stack: [], heap: [], heapBase: 0 } as MemoryDump,
  },
  actions: {
    // a store merges one level deep, so writing one turtle property means
    // rebuilding the whole `turtle` field
    writeTurtleProperty: (
      state,
      { property, value }: { property: TurtleProperty; value: string | number },
    ) => ({ turtle: { ...state.turtle, [property]: value } }),
    writeStatus: (_state, change: StateChange) => ({
      status: statuses[change],
    }),
    writeVirtualCanvas: (
      _state,
      vcanvas: { startx: number; starty: number; sizex: number; sizey: number },
    ) => ({ vcanvas }),
    writeMemory: (_state, dump: MemoryDump) => ({ memory: dump }),
  },
});

/** Registers a listener, called after every change below. Returns an unsubscribe. */
export const subscribe = machineStore.subscribe;

// ------------------------------------------------------------- the readers

export const getTurtle = (): {
  x: number;
  y: number;
  d: number;
  a: number;
  t: number;
  c: string;
} => machineStore.get("turtle");

export const getStatus = (): { running: boolean; playing: boolean } =>
  machineStore.get("status");

export const getVirtualCanvas = (): {
  startx: number;
  starty: number;
  sizex: number;
  sizey: number;
} => machineStore.get("vcanvas");

export const getMemory = (): MemoryDump => machineStore.get("memory");

/**
 * The five labels down one edge of the canvas: the start of the range, three
 * quarters of the way across it, and the last addressable pixel. The quarters
 * are fractions of `size` offset from `start`, so they stay evenly spaced
 * across the visible range wherever the canvas begins.
 */
export const coordinates = (start: number, size: number): number[] => [
  start,
  Math.round(start + size / 4),
  Math.round(start + size / 2),
  Math.round(start + (size / 4) * 3),
  Math.round(start + size - 1),
];

// ------------------------------------------------------------- the writers
//
// Each is a thin wrapper over one `dispatch`, so the machine's adapters keep
// writing to the names and signatures the port declares.
//
// `setTurtleProperty`'s generic earns its place: `dispatch` takes exactly what
// the action declared, so a bare dispatch would widen `value` to
// `string | number` and lose its correlation with the property name.

/** One turtle property, from the machine's output port. */
export const setTurtleProperty = <Property extends TurtleProperty>(
  property: Property,
  value: Property extends "c" ? string : number,
): void => {
  machineStore.dispatch("writeTurtleProperty", { property, value });
};

/** RUN, HALT, and the pause/resume the machine reports as it happens. */
export const setStatus = (change: StateChange): void => {
  machineStore.dispatch("writeStatus", change);
};

const statuses: Record<StateChange, { running: boolean; playing: boolean }> = {
  played: { running: true, playing: true },
  paused: { running: true, playing: false },
  unpaused: { running: true, playing: true },
  halted: { running: false, playing: false },
};

/** The virtual canvas, from the machine's canvas port. */
export const setVirtualCanvas = (
  startx: number,
  starty: number,
  sizex: number,
  sizey: number,
): void => {
  machineStore.dispatch("writeVirtualCanvas", { startx, starty, sizex, sizey });
};

/** A memory image, from the DUMP instruction or the Memory tab's own button. */
export const setMemory = (dump: MemoryDump): void => {
  machineStore.dispatch("writeMemory", dump);
};
