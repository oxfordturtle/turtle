export { halt, isRunning, playOrPause, reset, run } from "./machine/runtime.ts";
export {
  updateKeyDown,
  updateKeyUp,
  updateMouseDown,
  updateMouseMove,
  updateMouseUp,
} from "./machine/input.ts";
export { MachineError } from "./machine/error.ts";
export { setPorts } from "./machine/state.ts";
export { dump } from "./machine/memory.ts";
export { defaultMachineOptions } from "./machine/options.ts";
export type {
  Canvas,
  FileExistence,
  FileOpenMode,
  FileSystem,
  FileTestAction,
  MachineOptions,
  MemoryDump,
  OutboundPorts,
  Output,
  StateChange,
  Timers,
  Turtle,
  TurtleProperty,
} from "./machine/types.ts";
