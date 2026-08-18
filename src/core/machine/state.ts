import { defaultMachineOptions } from "./options.ts";
import {
  OutboundPorts,
  RuntimeInput,
  RuntimeState,
  VirtualCanvas,
} from "./types.ts";

export const input: RuntimeInput = {
  pcode: [],
  options: defaultMachineOptions,
};

/**
 * The machine's outbound ports. Deliberately undefined until `setPorts`, which
 * `run()` calls before executing anything. A host that calls `reset()` without
 * ever calling `run()` - the UI's "Reset machine" does exactly this - must call
 * `setPorts` itself first.
 */
export let ports: OutboundPorts;

export const setPorts = (newPorts: OutboundPorts): void => {
  ports = newPorts;
};

export const state: RuntimeState = {
  running: false,
  paused: false,
  line: 0,
  code: 0,
  detectInputcode: 0,
  detectActive: false,
  detectTimeoutID: 0,
  readlineTimeoutID: 0,
  startTime: 0,
  lastClickTime: -Infinity,
  update: false,
  keyecho: false,
  seed: 0,
  trueValue: 1,
  pcodeHalt: -1,
  runToken: 0,
};

export const vcanvas: VirtualCanvas = {
  startx: 0,
  starty: 0,
  sizex: 0,
  sizey: 0,
  width: 0,
  height: 0,
  doubled: false,
};
