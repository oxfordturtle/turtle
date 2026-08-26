// deno-coverage-ignore-file -- type declarations only: erased at compile time, so no
// test can ever load this module at runtime.

export type RuntimeInput = {
  pcode: ReadonlyArray<ReadonlyArray<number>>;
  options: MachineOptions;
};

export type MachineOptions = Readonly<{
  showCanvasOnRun: boolean;
  showOutputOnWrite: boolean;
  showMemoryOnDump: boolean;
  drawCountMax: number;
  codeCountMax: number;
  smallSize: number;
  stackSize: number;
  traceOnRun: boolean;
  activateHCLR: boolean;
  preventStackCollision: boolean;
  rangeCheckArrays: boolean;
}>;

export type OutboundPorts = {
  timers: Timers;
  canvas: Canvas;
  output: Output;
  files: FileSystem;
};

export type Timers = Readonly<{
  now(): number;
  scheduleCallback(callback: () => void, delayMs: number): number;
  cancelCallback(handle: number): void;
}>;

export type Canvas = Readonly<{
  setResolution(width: number, height: number, doubled: boolean): void;
  setVirtualCanvas(
    startx: number,
    starty: number,
    sizex: number,
    sizey: number,
  ): void;
  clear(colour: string): void;
  setCursor(code: number): void;
  drawLine(turtle: Turtle, toX: number, toY: number): void;
  drawPolygon(turtle: Turtle, coords: [number, number][], fill: boolean): void;
  drawArc(
    turtle: Turtle,
    radiusX: number,
    radiusY: number,
    fill: boolean,
  ): void;
  drawBox(
    turtle: Turtle,
    toX: number,
    toY: number,
    fillColour: string,
    border: boolean,
  ): void;
  drawText(turtle: Turtle, text: string, font: number, size: number): void;
  readPixel(x: number, y: number): number;
  writePixel(x: number, y: number, colour: number, doubled: boolean): void;
  floodFill(
    x: number,
    y: number,
    fillColour: number,
    boundaryColour: number,
    boundaryMode: boolean,
  ): void;
}>;

export type Output = Readonly<{
  updateTurtleProperty<Property extends TurtleProperty>(
    property: Property,
    value: Property extends "c" ? string : number,
  ): void;
  updateMemoryDisplay(memoryDump: MemoryDump): void;
  configureConsole(clear: boolean, colour: string): void;
  logToConsole(text: string): void;
  backspaceConsole(): void;
  configureOutput(clear: boolean, colour: string): void;
  writeToOutput(text: string): void;
  selectTab(tab: string): void;
  notifyStateChange(change: StateChange): void;
  notifyRuntimeError(error: Error): void;
}>;

export type StateChange = "played" | "paused" | "unpaused" | "halted";

export type FileTestAction = "enquire" | "delete" | "create" | "recreate";
export type FileOpenMode = "read" | "append" | "write" | "rewrite";
export type FileExistence = { existedBefore: boolean; existedAfter: boolean };

/**
 * Every method returns a Promise, because the intended backend (OPFS) is
 * asynchronous; the runtime suspends and resumes around each call (runtime.ts's
 * suspendFor). No browser adapter exists yet - src/client/index.ts installs a
 * no-op.
 */
export type FileSystem = Readonly<{
  // tests/creates/deletes a file or directory at `path`, relative to the port's
  // own current-directory state. Existence before and after is reported as
  // data; runtime.ts decides what to tell the user about it.
  testFile(path: string, action: FileTestAction): Promise<FileExistence>;
  testDirectory(path: string, action: FileTestAction): Promise<FileExistence>;

  // changes the current directory. Resolves to false (leaving the current
  // directory unchanged) if `path` doesn't exist.
  changeDirectory(path: string): Promise<boolean>;

  // opens a file, resolving to a handle in 1..10, or 0 if opening failed
  // (mode "read"/"append" and the file doesn't exist; mode "write" and the
  // file already exists; or all 10 handles are already in use).
  openFile(path: string, mode: FileOpenMode): Promise<number>;

  // closes a handle - file or search alike. handle=0 closes every open
  // handle (files and in-progress searches together).
  close(handle: number): Promise<void>;

  // restarts a file from the beginning: rewinds a file open for reading,
  // or truncates one open for writing.
  restart(handle: number): Promise<void>;

  atEnd(handle: number): Promise<boolean>; // EOF - trivially true if open for writing
  atLineEnd(handle: number): Promise<boolean>; // EOLN - trivially true if open for writing

  readChars(handle: number, max: number): Promise<string>; // FRDS; may return fewer than `max` at EOF
  readLine(handle: number): Promise<string>; // FRLN; excludes the line terminator
  writeChars(handle: number, text: string): Promise<void>; // FWRS
  writeLine(handle: number, text: string): Promise<void>; // FWLN; appends a line terminator

  // starts a glob search. `handle` is 0 to allocate a new one, or an existing
  // one to reuse. Resolves to the handle used and the first match ("" if none).
  findFirstFile(
    pattern: string,
    handle: number,
  ): Promise<[handle: number, match: string]>;
  findFirstDirectory(
    pattern: string,
    handle: number,
  ): Promise<[handle: number, match: string]>;
  findNext(handle: number): Promise<string>; // "" once the search is exhausted

  renameFile(oldPath: string, newPath: string): Promise<boolean>;
  moveFile(oldPath: string, newPath: string): Promise<boolean>;
  copyFile(oldPath: string, newPath: string): Promise<boolean>;
}>;

export type RuntimeState = {
  running: boolean;
  paused: boolean;
  line: number;
  code: number;
  detectInputcode: number;
  detectActive: boolean;
  detectTimeoutID: number;
  readlineTimeoutID: number;
  startTime: number;
  // when the last mouse click happened, for the next click's double-click
  // check. Kept out of `memory.query` because query[11] is \mousekey - the
  // last button/key pressed - which updateMouseDown and updateKeyDown both
  // overwrite. -Infinity means "no click yet in this run"
  lastClickTime: number;
  update: boolean;
  keyecho: boolean;
  seed: number;
  trueValue: number;
  pcodeHalt: number;
  // bumped by every run(), and captured by an async port call's continuation,
  // so a promise from a superseded run can recognise itself as stale
  runToken: number;
};

/**
 * Everything an operator needs that is not module-global state: the outbound
 * ports, the run's options, and the four things only `execute()`'s own loop can
 * do for it.
 *
 * Built **once per `execute()` call, never per instruction.** The loop runs up
 * to `options.codeCountMax` (100,000) instructions per block, and an allocation
 * on that path costs whole seconds - see MACHINE_REFACTOR.md's Phase 2 record,
 * where a tuple-returning pop helper made the example suite 11-17x slower.
 */
export type Cycle = Readonly<{
  options: MachineOptions;
  canvas: Canvas;
  output: Output;
  timers: Timers;
  files: FileSystem;

  /** reads the next inline operand, advancing the program counter past it */
  operand(): number;

  /** records a draw against this block's draw budget */
  drew(): void;

  /**
   * Spends the draw budget outright, ending the block after this instruction so
   * the canvas is repainted before the next one starts.
   */
  forceUpdate(): void;

  /**
   * Stops the loop and returns from `execute()` without rescheduling it. For an
   * operator that has already advanced the program counter itself and arranged
   * its own resumption - via `suspendFor`, or a timer callback.
   */
  suspend(): void;
}>;

export type VirtualCanvas = {
  startx: number;
  starty: number;
  sizex: number;
  sizey: number;
  width: number;
  height: number;
  doubled: boolean;
};

export type Turtle = {
  x: number;
  y: number;
  d: number;
  a: number;
  t: number;
  c: string;
};

export type TurtleProperty = keyof Turtle;

/**
 * The turtle exactly as `main` stores it, with `c` still a raw colour value.
 * `Turtle` is the outward-facing shape the canvas and output ports see, in
 * which `c` has been formatted as a hex string.
 */
export type TurtleState = Omit<Turtle, "c"> & { c: number };

export type MemoryDump = {
  stack: number[];
  heap: number[];
  heapBase: number;
};
