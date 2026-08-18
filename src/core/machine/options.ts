import type { MachineOptions } from "./types.ts";

export const defaultMachineOptions: MachineOptions = {
  showCanvasOnRun: true,
  showOutputOnWrite: false,
  showMemoryOnDump: true,
  drawCountMax: 4,
  codeCountMax: 100000,
  smallSize: 60,
  stackSize: 50000,
  traceOnRun: false,
  activateHCLR: true,
  preventStackCollision: true,
  rangeCheckArrays: true,
};
