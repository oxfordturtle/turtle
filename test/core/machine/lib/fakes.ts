import type {
  Canvas,
  FileExistence,
  FileOpenMode,
  FileSystem,
  FileTestAction,
  MemoryDump,
  Output,
  StateChange,
  Timers,
  Turtle,
  TurtleProperty,
} from "@/core/machine.ts";

/** One recorded call to a fake port, for tests that want to assert call shape/order directly. */
export type RecordedCall = { method: string; args: unknown[] };

/**
 * Fake `Timers` port.
 *
 * `now()` returns a controllable counter (advance it with `advance(ms)`) -
 * never `Date.now()`, so tests are deterministic. `scheduleCallback` never
 * waits: it queues the callback (ignoring the delay) and returns a handle;
 * `cancelCallback` removes it from the queue. Nothing runs until the test
 * calls `flush()`, which drains the queue in FIFO order - including
 * callbacks that schedule further callbacks (e.g. the runtime re-entering
 * its own `execute` loop) - until it's empty or `maxIterations` is hit
 * (a safety net against a genuinely infinite program, not a normal exit).
 */
export type FakeTimers = Timers & {
  advance(ms: number): void;
  flush(maxIterations?: number): void;
  runNext(): void;
  pendingCount(): number;
};

export const fakeTimers = (): FakeTimers => {
  let clock = 0;
  let nextHandle = 1;
  const pending = new Map<number, () => void>();

  return {
    now: () => clock,
    scheduleCallback: (callback: () => void, _delayMs: number) => {
      const handle = nextHandle++;
      pending.set(handle, callback);
      return handle;
    },
    cancelCallback: (handle: number) => {
      pending.delete(handle);
    },
    advance: (ms: number) => {
      clock += ms;
    },
    pendingCount: () => pending.size,
    runNext: () => {
      const next = pending.entries().next();
      if (next.done) return;
      const [handle, callback] = next.value;
      pending.delete(handle);
      callback();
    },
    flush: (maxIterations = 10000) => {
      let iterations = 0;
      while (pending.size > 0) {
        iterations += 1;
        if (iterations > maxIterations) {
          throw new Error(
            `fakeTimers().flush() exceeded ${maxIterations} iterations - ` +
              "likely a program under test that never halts.",
          );
        }
        const [handle, callback] = pending.entries().next().value as [
          number,
          () => void,
        ];
        pending.delete(handle);
        callback();
      }
    },
  };
};

/**
 * Fake `Canvas` port.
 *
 * Every method call is recorded (in call order) into `.calls`, so tests can
 * assert exactly what the machine asked the canvas to do. `readPixel`,
 * `writePixel`, and `floodFill` are also backed by a real in-memory pixel
 * map keyed by `"x,y"` (defaulting to whatever colour `clear()` last set),
 * so a `pixs`-then-`pixc` round trip in the machine actually round-trips
 * instead of reading back a no-op's default. `floodFill` is a fake, not a
 * real flood-fill algorithm (the real one lives adapter-side, outside
 * `src/core`) - it just records the call and sets the single seed pixel,
 * enough to exercise the machine's call construction.
 */
export type FakeCanvas = Canvas & {
  calls: RecordedCall[];
  pixelAt(x: number, y: number): number;
};

export const fakeCanvas = (): FakeCanvas => {
  const calls: RecordedCall[] = [];
  const pixels = new Map<string, number>();
  let background = 0xffffff;

  const record = (method: string, args: unknown[]) => {
    calls.push({ method, args });
  };

  return {
    calls,
    pixelAt: (x: number, y: number) => pixels.get(`${x},${y}`) ?? background,
    setResolution: (width: number, height: number, doubled: boolean) => {
      record("setResolution", [width, height, doubled]);
    },
    setVirtualCanvas: (
      startx: number,
      starty: number,
      sizex: number,
      sizey: number,
    ) => {
      record("setVirtualCanvas", [startx, starty, sizex, sizey]);
    },
    clear: (colour: string) => {
      record("clear", [colour]);
      const parsed = parseInt(colour.replace("#", ""), 16);
      background = isNaN(parsed) ? background : parsed;
      pixels.clear();
    },
    setCursor: (code: number) => {
      record("setCursor", [code]);
    },
    drawLine: (turtle: Turtle, toX: number, toY: number) => {
      record("drawLine", [turtle, toX, toY]);
    },
    drawPolygon: (
      turtle: Turtle,
      coords: [number, number][],
      fill: boolean,
    ) => {
      record("drawPolygon", [turtle, coords, fill]);
    },
    drawArc: (
      turtle: Turtle,
      radiusX: number,
      radiusY: number,
      fill: boolean,
    ) => {
      record("drawArc", [turtle, radiusX, radiusY, fill]);
    },
    drawBox: (
      turtle: Turtle,
      toX: number,
      toY: number,
      fillColour: string,
      border: boolean,
    ) => {
      record("drawBox", [turtle, toX, toY, fillColour, border]);
    },
    drawText: (turtle: Turtle, text: string, font: number, size: number) => {
      record("drawText", [turtle, text, font, size]);
    },
    readPixel: (x: number, y: number) => {
      record("readPixel", [x, y]);
      return pixels.get(`${x},${y}`) ?? background;
    },
    writePixel: (x: number, y: number, colour: number, doubled: boolean) => {
      record("writePixel", [x, y, colour, doubled]);
      pixels.set(`${x},${y}`, colour);
    },
    floodFill: (
      x: number,
      y: number,
      fillColour: number,
      boundaryColour: number,
      boundaryMode: boolean,
    ) => {
      record("floodFill", [x, y, fillColour, boundaryColour, boundaryMode]);
      pixels.set(`${x},${y}`, fillColour);
    },
  };
};

/**
 * Fake `Output` port.
 *
 * Every method call is recorded (in call order) into `.calls`. On top of
 * that, the fake maintains readable running state derived from those calls,
 * since most tests care about the *result* of a sequence of calls rather
 * than the sequence itself:
 * - `turtleProperties`: last value written per `Turtle` property.
 * - `consoleText` / `outputText`: accumulated text, respecting `configure*`
 *   clears and (for the console) `backspaceConsole`.
 * - `tabs`: every tab passed to `selectTab`, in order (`.at(-1)` for "current").
 * - `stateChanges`: every `StateChange` passed to `notifyStateChange`, in
 *   order - this *is* the machine's event system: state changes are pushed
 *   out through this port rather than raised as DOM events.
 * - `runtimeErrors`: every `Error` passed to `notifyRuntimeError`, in order.
 * - `memoryDumps`: every `MemoryDump` passed to `updateMemoryDisplay`, in order.
 */
export type FakeOutput = Output & {
  calls: RecordedCall[];
  turtleProperties: Partial<Record<TurtleProperty, string | number>>;
  tabs: string[];
  stateChanges: StateChange[];
  runtimeErrors: Error[];
  memoryDumps: MemoryDump[];
  readonly consoleText: string;
  readonly outputText: string;
};

export const fakeOutput = (): FakeOutput => {
  const calls: RecordedCall[] = [];
  const turtleProperties: Partial<Record<TurtleProperty, string | number>> = {};
  const tabs: string[] = [];
  const stateChanges: StateChange[] = [];
  const runtimeErrors: Error[] = [];
  const memoryDumps: MemoryDump[] = [];
  let consoleText = "";
  let outputText = "";

  const record = (method: string, args: unknown[]) => {
    calls.push({ method, args });
  };

  return {
    calls,
    turtleProperties,
    tabs,
    stateChanges,
    runtimeErrors,
    memoryDumps,
    get consoleText() {
      return consoleText;
    },
    get outputText() {
      return outputText;
    },
    updateTurtleProperty: (
      property: TurtleProperty,
      value: string | number,
    ) => {
      record("updateTurtleProperty", [property, value]);
      turtleProperties[property] = value;
    },
    updateMemoryDisplay: (memoryDump: MemoryDump) => {
      record("updateMemoryDisplay", [memoryDump]);
      memoryDumps.push(memoryDump);
    },
    configureConsole: (clear: boolean, colour: string) => {
      record("configureConsole", [clear, colour]);
      if (clear) consoleText = "";
    },
    logToConsole: (text: string) => {
      record("logToConsole", [text]);
      consoleText += text;
    },
    backspaceConsole: () => {
      record("backspaceConsole", []);
      consoleText = consoleText.slice(0, -1);
    },
    configureOutput: (clear: boolean, colour: string) => {
      record("configureOutput", [clear, colour]);
      if (clear) outputText = "";
    },
    writeToOutput: (text: string) => {
      record("writeToOutput", [text]);
      outputText += text;
    },
    selectTab: (tab: string) => {
      record("selectTab", [tab]);
      tabs.push(tab);
    },
    notifyStateChange: (change: StateChange) => {
      record("notifyStateChange", [change]);
      stateChanges.push(change);
    },
    notifyRuntimeError: (error: Error) => {
      record("notifyRuntimeError", [error]);
      runtimeErrors.push(error);
    },
  };
};

/**
 * Fake `FileSystem` port.
 *
 * Every method is `async` and genuinely returns a `Promise` (resolving on
 * the current microtask, same as any real backend eventually would), so
 * exercising it end-to-end through `execute()` needs the calling test to
 * actually `await` - `fakeTimers().flush()` alone only drains *timer*
 * callbacks, not promise continuations. Tests of async PCode handlers
 * should therefore alternate awaiting a microtask turn with flushing, so
 * settled promises' callbacks get a chance to run - `lib/helpers.ts`'s
 * `runFilePcode` is that pattern, packaged.
 *
 * Backed by an in-memory tree (`Map<normalizedPath, FileEntry |
 * DirectoryEntry>`, normalized as slash-separated segments with no leading
 * or trailing slash, `""` meaning the sandboxed base directory itself) plus
 * a handle table shared between open files and in-progress searches (1-10,
 * mirroring the real 1-10 handle space `CLOS`/`OPEN`/`FFND`/`FDIR` share).
 * `seed`/`seedDirectory` let a test set up fixtures directly, without going
 * through `OPEN`/`FWRS` first. Deliberately does *not* reject `..`
 * segments - by design, that sandboxing check is `runtime.ts`'s job, not
 * the port's, so the fake mirrors a real backend in staying agnostic
 * to it.
 */
export type FakeFiles = FileSystem & {
  calls: RecordedCall[];
  seed(path: string, content: string): void;
  seedDirectory(path: string): void;
  currentDirectory(): string;
};

type FileEntry = { kind: "file"; content: string };
type DirectoryEntry = { kind: "directory" };
type FileHandleState = {
  kind: "file";
  path: string;
  mode: FileOpenMode;
  position: number;
};
type SearchHandleState = { kind: "search"; matches: string[]; index: number };

export const fakeFiles = (): FakeFiles => {
  const calls: RecordedCall[] = [];
  const record = (method: string, args: unknown[]) => {
    calls.push({ method, args });
  };

  const tree = new Map<string, FileEntry | DirectoryEntry>();
  tree.set("", { kind: "directory" });
  let cwd = "";
  const handles = new Map<number, FileHandleState | SearchHandleState>();

  const normalize = (path: string): string => {
    const combined = path === "" ? cwd : cwd === "" ? path : `${cwd}/${path}`;
    return combined
      .split("/")
      .filter((s) => s.length > 0 && s !== ".")
      .join("/");
  };

  const parentOf = (normalized: string): string => {
    const i = normalized.lastIndexOf("/");
    return i === -1 ? "" : normalized.slice(0, i);
  };

  const baseName = (normalized: string): string => {
    const i = normalized.lastIndexOf("/");
    return i === -1 ? normalized : normalized.slice(i + 1);
  };

  const escapeRegExpChar = (ch: string): string =>
    /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;

  const globToRegExp = (pattern: string): RegExp => {
    let source = "^";
    for (const ch of pattern) {
      if (ch === "*") source += ".*";
      else if (ch === "?") source += ".";
      else source += escapeRegExpChar(ch);
    }
    return new RegExp(source + "$");
  };

  const firstFreeHandle = (): number => {
    for (let h = 1; h <= 10; h += 1) {
      if (!handles.has(h)) return h;
    }
    return 0;
  };

  // a pattern may combine a directory path with a glob for its final component
  // ("subdir/*.txt") - split that leading directory segment off
  // (if any) and resolve it relative to cwd, same as any other path;
  // the remainder is the glob matched against names within that directory.
  const splitPatternDirectory = (
    pattern: string,
  ): { directory: string; glob: string } => {
    const i = Math.max(pattern.lastIndexOf("/"), pattern.lastIndexOf("\\"));
    return i === -1
      ? { directory: "", glob: pattern }
      : { directory: pattern.slice(0, i), glob: pattern.slice(i + 1) };
  };

  const search = (
    pattern: string,
    handle: number,
    kind: "file" | "directory",
  ): [number, string] => {
    const { directory, glob } = splitPatternDirectory(pattern);
    const searchDir = normalize(directory);
    const matches = [...tree.entries()]
      .filter(
        ([path, entry]) =>
          path !== "" && parentOf(path) === searchDir && entry.kind === kind,
      )
      .map(([path]) => baseName(path))
      .filter((name) => globToRegExp(glob).test(name))
      .sort();
    const useHandle = handle === 0 ? firstFreeHandle() : handle;
    if (useHandle === 0) return [0, ""];
    handles.set(useHandle, {
      kind: "search",
      matches,
      index: matches.length > 0 ? 1 : 0,
    });
    return [useHandle, matches[0] ?? ""];
  };

  return {
    calls,
    currentDirectory: () => cwd,
    seed: (path: string, content: string) => {
      const norm = normalize(path);
      tree.set(norm, { kind: "file", content });
    },
    seedDirectory: (path: string) => {
      const norm = normalize(path);
      tree.set(norm, { kind: "directory" });
    },
    testFile: (path: string, action: FileTestAction) => {
      record("testFile", [path, action]);
      const norm = normalize(path);
      const existedBefore = tree.get(norm)?.kind === "file";
      if (action === "delete" && existedBefore) tree.delete(norm);
      if (action === "create" && !existedBefore) {
        tree.set(norm, { kind: "file", content: "" });
      }
      if (action === "recreate") tree.set(norm, { kind: "file", content: "" });
      const existedAfter = tree.get(norm)?.kind === "file";
      return Promise.resolve<FileExistence>({ existedBefore, existedAfter });
    },
    testDirectory: (path: string, action: FileTestAction) => {
      record("testDirectory", [path, action]);
      const norm = normalize(path);
      const existedBefore = tree.get(norm)?.kind === "directory";
      if (action === "delete" && existedBefore) tree.delete(norm);
      if (action === "create" && !existedBefore) {
        tree.set(norm, { kind: "directory" });
      }
      if (action === "recreate") tree.set(norm, { kind: "directory" });
      const existedAfter = tree.get(norm)?.kind === "directory";
      return Promise.resolve<FileExistence>({ existedBefore, existedAfter });
    },
    changeDirectory: (path: string) => {
      record("changeDirectory", [path]);
      const target = path === "" ? "" : normalize(path);
      if (target === "" || tree.get(target)?.kind === "directory") {
        cwd = target;
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    },
    openFile: (path: string, mode: FileOpenMode) => {
      record("openFile", [path, mode]);
      const norm = normalize(path);
      const existing = tree.get(norm);
      const exists = existing?.kind === "file";
      if ((mode === "read" || mode === "append") && !exists) {
        return Promise.resolve(0);
      }
      if (mode === "write" && exists) return Promise.resolve(0);
      const handle = firstFreeHandle();
      if (handle === 0) return Promise.resolve(0);
      if (mode === "write" || mode === "rewrite") {
        tree.set(norm, { kind: "file", content: "" });
      }
      const content = (tree.get(norm) as FileEntry).content;
      handles.set(handle, {
        kind: "file",
        path: norm,
        mode,
        position: mode === "append" ? content.length : 0,
      });
      return Promise.resolve(handle);
    },
    close: (handle: number) => {
      record("close", [handle]);
      if (handle === 0) handles.clear();
      else handles.delete(handle);
      return Promise.resolve();
    },
    restart: (handle: number) => {
      record("restart", [handle]);
      const entry = handles.get(handle);
      if (entry?.kind === "file") {
        entry.position = 0;
        if (
          entry.mode === "write" ||
          entry.mode === "rewrite" ||
          entry.mode === "append"
        ) {
          tree.set(entry.path, { kind: "file", content: "" });
        }
      }
      return Promise.resolve();
    },
    atEnd: (handle: number) => {
      record("atEnd", [handle]);
      const entry = handles.get(handle);
      if (entry?.kind !== "file") return Promise.resolve(true);
      if (entry.mode !== "read") return Promise.resolve(true);
      const content = (tree.get(entry.path) as FileEntry).content;
      return Promise.resolve(entry.position >= content.length);
    },
    atLineEnd: (handle: number) => {
      record("atLineEnd", [handle]);
      const entry = handles.get(handle);
      if (entry?.kind !== "file") return Promise.resolve(true);
      if (entry.mode !== "read") return Promise.resolve(true);
      const content = (tree.get(entry.path) as FileEntry).content;
      return Promise.resolve(
        entry.position >= content.length || content[entry.position] === "\n",
      );
    },
    readChars: (handle: number, max: number) => {
      record("readChars", [handle, max]);
      const entry = handles.get(handle);
      if (entry?.kind !== "file") return Promise.resolve("");
      const content = (tree.get(entry.path) as FileEntry).content;
      const chars = content.slice(entry.position, entry.position + max);
      entry.position += chars.length;
      return Promise.resolve(chars);
    },
    readLine: (handle: number) => {
      record("readLine", [handle]);
      const entry = handles.get(handle);
      if (entry?.kind !== "file") return Promise.resolve("");
      const content = (tree.get(entry.path) as FileEntry).content;
      const nextBreak = content.indexOf("\n", entry.position);
      const end = nextBreak === -1 ? content.length : nextBreak;
      const line = content.slice(entry.position, end);
      entry.position = nextBreak === -1 ? content.length : nextBreak + 1;
      return Promise.resolve(line);
    },
    writeChars: (handle: number, text: string) => {
      record("writeChars", [handle, text]);
      const entry = handles.get(handle);
      if (entry?.kind === "file") {
        const file = tree.get(entry.path) as FileEntry;
        file.content += text;
        entry.position += text.length;
      }
      return Promise.resolve();
    },
    writeLine: (handle: number, text: string) => {
      record("writeLine", [handle, text]);
      const entry = handles.get(handle);
      if (entry?.kind === "file") {
        const file = tree.get(entry.path) as FileEntry;
        file.content += text + "\n";
        entry.position += text.length + 1;
      }
      return Promise.resolve();
    },
    findFirstFile: (pattern: string, handle: number) => {
      record("findFirstFile", [pattern, handle]);
      return Promise.resolve(search(pattern, handle, "file"));
    },
    findFirstDirectory: (pattern: string, handle: number) => {
      record("findFirstDirectory", [pattern, handle]);
      return Promise.resolve(search(pattern, handle, "directory"));
    },
    findNext: (handle: number) => {
      record("findNext", [handle]);
      const entry = handles.get(handle);
      if (entry?.kind !== "search" || entry.index >= entry.matches.length) {
        return Promise.resolve("");
      }
      const match = entry.matches[entry.index];
      entry.index += 1;
      return Promise.resolve(match);
    },
    renameFile: (oldPath: string, newPath: string) => {
      record("renameFile", [oldPath, newPath]);
      const oldNorm = normalize(oldPath);
      const newNorm = normalize(newPath);
      const entry = tree.get(oldNorm);
      if (entry?.kind !== "file" || tree.has(newNorm)) {
        return Promise.resolve(false);
      }
      tree.delete(oldNorm);
      tree.set(newNorm, entry);
      return Promise.resolve(true);
    },
    moveFile: (oldPath: string, newPath: string) => {
      record("moveFile", [oldPath, newPath]);
      const oldNorm = normalize(oldPath);
      const newNorm = normalize(newPath);
      const entry = tree.get(oldNorm);
      if (entry?.kind !== "file" || tree.has(newNorm)) {
        return Promise.resolve(false);
      }
      tree.delete(oldNorm);
      tree.set(newNorm, entry);
      return Promise.resolve(true);
    },
    copyFile: (oldPath: string, newPath: string) => {
      record("copyFile", [oldPath, newPath]);
      const oldNorm = normalize(oldPath);
      const newNorm = normalize(newPath);
      const entry = tree.get(oldNorm);
      if (entry?.kind !== "file" || tree.has(newNorm)) {
        return Promise.resolve(false);
      }
      tree.set(newNorm, { kind: "file", content: entry.content });
      return Promise.resolve(true);
    },
  };
};
