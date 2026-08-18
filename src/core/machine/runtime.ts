import { colours, PCode } from "@/core/constants.ts";
import * as memory from "./memory.ts";
import type {
  Canvas,
  FileExistence,
  FileOpenMode,
  FileSystem,
  FileTestAction,
  MachineOptions,
  Output,
  Timers,
} from "./types.ts";
import { MachineError } from "./utils.ts";
import { input, ports, setPorts, state, vcanvas } from "./state.ts";
import { hex, randomNumber } from "./utils.ts";
import { turtle, turtx, turty, vcoords } from "./vcanvas.ts";

export const reset = (): void => {
  vcanvas.startx = 0;
  vcanvas.starty = 0;
  vcanvas.sizex = 1000;
  vcanvas.sizey = 1000;
  vcanvas.width = 1000;
  vcanvas.height = 1000;
  vcanvas.doubled = false;
  const { canvas, output } = ports;
  canvas.setResolution(1000, 1000, false);
  output.configureConsole(true, "#FFFFFF");
  output.configureOutput(true, "#FFFFFF");
  output.updateTurtleProperty("x", 500);
  output.updateTurtleProperty("y", 500);
  output.updateTurtleProperty("d", 0);
  output.updateTurtleProperty("a", 360);
  output.updateTurtleProperty("t", 2);
  output.updateTurtleProperty("c", "#000");
  canvas.setVirtualCanvas(0, 0, 1000, 1000);
};

export const run = (
  pcode: number[][],
  options: MachineOptions,
  timers: Timers,
  output: Output,
  canvas: Canvas,
  files: FileSystem,
): void => {
  input.pcode = pcode;
  input.options = options;
  setPorts({ timers, output, canvas, files });
  reset();
  state.line = 0;
  state.code = 0;
  // invalidates any async port call still in flight from a previous run; see
  // suspendFor
  state.runToken += 1;
  if (options.showCanvasOnRun) {
    output.selectTab("canvas");
  }
  memory.init(options);
  state.startTime = timers.now();
  state.lastClickTime = -Infinity;
  state.update = true;
  state.keyecho = true;
  state.seed = timers.now();
  state.pcodeHalt = -1;
  state.trueValue = 1;
  state.running = true;
  state.paused = false;
  output.notifyStateChange("played");
  execute();
};

export const halt = (): void => {
  if (state.running) {
    const { canvas, output } = ports;
    canvas.setCursor(1);
    state.running = false;
    state.paused = false;
    output.notifyStateChange("halted");
  }
};

export const isRunning = (): boolean => {
  return state.running;
};

export const playOrPause = (): void => {
  if (state.running) {
    const { output } = ports;
    if (state.paused) {
      state.paused = false;
      output.notifyStateChange("unpaused");
    } else {
      state.paused = true;
      output.notifyStateChange("paused");
    }
  }
};

// A Python list (fixed address via LIAD, or heap via LIHP) is a contiguous
// block in `main`, unlike a fixed array's nested/pointer-chained layout -
// LINS/LREM need a single run of cells to shift:
//   main[base]         = current length (element count)
//   main[base + 1..3]  = capacity of dimensions 1-3 (0 if unused)
//   main[base + 4]     = max string length per element (0 for integer lists;
//                        stored for fidelity to LIAD/LIHP's `size` operand,
//                        but unused)
//   main[base + 5 ...] = element storage, flat, row-major
// An element cell is a plain integer or a pointer to an independently
// allocated string, so LAPP/LCPY/LEXT/LINS/LMUL/LREV move raw cells without
// knowing the element kind. Only LIDX/LREM (equality - a string element
// compares by content, not pointer) and LPRT (formatting) need it.
const LIST_HEADER_SIZE = 5;

const decodeLp = (
  lp: number,
): { elementKind: "integer" | "string"; dimensions: number } => ({
  elementKind: lp % 16 === 5 ? "string" : "integer",
  dimensions: 1 + Math.floor(lp / 16),
});

const decodeSize = (
  size: number,
): { dim1: number; dim2: number; dim3: number; dim4: number } => ({
  dim1: size & 0x7ff,
  dim2: (size >>> 11) & 0x3ff,
  dim3: (size >>> 21) & 0x3f,
  dim4: (size >>> 27) & 0x1f,
});

const listCapacityFromDims = (
  dim1: number,
  dim2: number,
  dim3: number,
): number => dim1 * (dim2 || 1) * (dim3 || 1);

const listLength = (base: number): number => memory.main[base];

const setListLength = (base: number, length: number): void => {
  memory.main[base] = length;
};

const listCapacity = (base: number): number =>
  listCapacityFromDims(
    memory.main[base + 1],
    memory.main[base + 2],
    memory.main[base + 3],
  );

const listElement = (base: number, index: number): number =>
  memory.main[base + LIST_HEADER_SIZE + index];

const setListElement = (base: number, index: number, value: number): void => {
  memory.main[base + LIST_HEADER_SIZE + index] = value;
};

/**
 * Iterates rather than using `memory.zero`'s recursion: list capacities run
 * to tens of thousands of cells, unlike the small fixed program-variable
 * regions `memory.zero` is used for, so recursing would risk a stack overflow.
 */
const writeListHeader = (
  base: number,
  dim1: number,
  dim2: number,
  dim3: number,
  dim4: number,
  length: number,
): void => {
  memory.main[base] = length;
  memory.main[base + 1] = dim1;
  memory.main[base + 2] = dim2;
  memory.main[base + 3] = dim3;
  memory.main[base + 4] = dim4;
  const capacity = listCapacityFromDims(dim1, dim2, dim3);
  for (let i = 0; i < capacity; i += 1) {
    memory.main[base + LIST_HEADER_SIZE + i] = 0;
  }
};

/** mirrors memory.makeHeapString's heapTemp/heapMax bookkeeping */
const allocateHeapList = (
  dim1: number,
  dim2: number,
  dim3: number,
  dim4: number,
  length: number,
): number => {
  const base = memory.getHeapTemp() + 1;
  const capacity = listCapacityFromDims(dim1, dim2, dim3);
  memory.setHeapTemp(base + LIST_HEADER_SIZE + capacity - 1);
  writeListHeader(base, dim1, dim2, dim3, dim4, length);
  memory.setHeapMax(memory.getHeapTemp());
  return base;
};

const listCapacityExceededError = (capacity: number): MachineError =>
  new MachineError(
    `List has reached its maximum capacity of ${capacity} items.`,
  );

// the machine's integers are 32-bit signed, matching the original system
const MAXINT = 0x7fffffff;
const MININT = -0x80000000;

// mirrors Pascal's initdefstringsize (SystemConstants.pas); STRINGSIZE isn't
// implemented here, so unlike the original there's no way to change it at
// runtime
const DEFAULT_STRING_SIZE = 64;

// mirrors Pascal's maxreturnstack/maxsubregstack/maxmemstack (RunTypes.pas);
// checked before every push so recursion fails with a clean error rather than
// however an unbounded JS array eventually fails
const MAX_CALL_STACK_DEPTH = 1000;

const callStackOverflowError = (name: string): MachineError =>
  new MachineError(
    `${name} stack overflow. Probable cause is unterminated recursion.`,
  );

const checkOverflow = (result: number): number => {
  if (result > MAXINT || result < MININT) {
    throw new MachineError("Numerical overflow.");
  }
  return result;
};

/** NaN unless the *entire* string is consumed, matching Pascal's StrToInt - JS's parseInt would silently ignore trailing garbage */
const parseFullInt = (s: string, hexPrefix: string): number => {
  if (s.startsWith(hexPrefix)) {
    const digits = s.slice(hexPrefix.length);
    return /^[0-9a-fA-F]+$/.test(digits) ? parseInt(digits, 16) : NaN;
  }
  return /^[+-]?\d+$/.test(s) ? parseInt(s, 10) : NaN;
};

/** a string-kind element is a pointer, so equality compares content, not pointers */
const listElementsEqual = (
  elementKind: "integer" | "string",
  a: number,
  b: number,
): boolean =>
  elementKind === "string"
    ? memory.getHeapString(a) === memory.getHeapString(b)
    : a === b;

/**
 * The manual equivalent of the bottom of execute()'s while loop, for any case
 * that `return`s early to suspend execution (RDLN, TDET, WAIT, and the file
 * operators) rather than falling through to the loop's own advancement.
 */
const advancePastCurrentInstruction = (): void => {
  state.code += 1;
  if (state.code === input.pcode[state.line].length) {
    state.line += 1;
    state.code = 0;
  }
};

/**
 * Jumps to the nearest enclosing TRY block if one is active, else halts and
 * reports. Shared by execute()'s try/catch and suspendFor's rejection path.
 */
const handleExecutionError = (error: unknown): void => {
  if (memory.tryStack.length !== 0) {
    const [xcptLine, stackHeight] = memory.tryStack.pop()!;
    state.line = xcptLine;
    state.code = 0;
    // an error thrown mid-expression would otherwise leave partial operands
    // behind (Pascal restores trystack[].stackheight the same way)
    memory.stack.length = stackHeight;
  } else {
    halt();
    ports.output.notifyRuntimeError(error as Error);
  }
};

/**
 * Suspends execute()'s loop until `promise` settles, then resumes - the
 * mechanism the whole filesystem operator set is built on. Bails out without
 * touching memory if a new run() has started in the meantime (state.runToken):
 * a stale promise from a superseded run must never mutate the new run's state.
 */
const suspendFor = <T>(
  promise: Promise<T>,
  onValue: (value: T) => void,
): void => {
  const token = state.runToken;
  promise.then(
    (value) => {
      if (state.runToken !== token) return;
      try {
        onValue(value);
      } catch (error) {
        handleExecutionError(error);
        execute();
        return;
      }
      execute();
    },
    (error) => {
      if (state.runToken !== token) return;
      handleExecutionError(error);
      execute();
    },
  );
};

/**
 * Rejects any ".." segment. The sandboxing check lives here rather than in the
 * FileSystem port or its adapters so that it holds whatever the backend is.
 */
const assertSafePath = (path: string): void => {
  if (path.split(/[/\\]/).some((segment) => segment === "..")) {
    throw new MachineError(`File paths cannot contain "..".`);
  }
};

/**
 * A FILE/DIRY notification level: 0 silent, 1 informs, 2 warns, 3 stops with an
 * error. The original desktop system had a modal message window for levels 1
 * and 2; mapping both onto console text is this system's choice, not the spec's.
 */
const applyNotification = (tier: number, message: string): void => {
  switch (tier) {
    case 1:
      ports.output.logToConsole(`${message}\n`);
      break;
    case 2:
      ports.output.logToConsole(`Warning: ${message}\n`);
      break;
    case 3:
      throw new MachineError(message);
  }
};

/**
 * Shared by PCode.file and PCode.diry, which decode the same `code` bitfield:
 * action in bits 0-1, notification levels in bits 2-3 (did not exist) and 4-5
 * (existed), before/after existence reported back in bits 6-7.
 */
const testPathAndNotify = (
  path: string,
  code: number,
  test: (path: string, action: FileTestAction) => Promise<FileExistence>,
  kind: "file" | "directory",
): void => {
  const action: FileTestAction = (
    ["enquire", "delete", "create", "recreate"] as const
  )[code & 3];
  const label = kind === "file" ? "File" : "Directory";
  advancePastCurrentInstruction();
  suspendFor(test(path, action), ({ existedBefore, existedAfter }) => {
    const tier = existedBefore ? (code & 48) >> 4 : (code & 12) >> 2;
    const message = existedBefore
      ? `${label} "${path}" already exists.`
      : `${label} "${path}" does not exist.`;
    applyNotification(tier, message);
    memory.stack.push(
      (code & 0b00111111) | (existedBefore ? 64 : 0) | (existedAfter ? 128 : 0),
    );
  });
};

/** Runs pcode until a draw/instruction budget is spent, then reschedules itself. */
export const execute = (): void => {
  if (!state.running) {
    return;
  }

  if (state.paused) {
    const { timers } = ports;
    timers.scheduleCallback(execute, 1);
    return;
  }

  state.detectActive = false;
  state.readlineTimeoutID = 0;

  memory.delayedHeapClear();

  const { pcode, options } = input;
  const { timers, output, canvas, files } = ports;
  let drawCount = 0;
  let codeCount = 0;
  let n1: number | undefined;
  let n2: number | undefined;
  let n3: number | undefined;
  let n4: number | undefined;
  let n5: number | undefined;
  let bool1: boolean;
  let bool2: boolean;
  let s1: string;
  let s2: string;
  let s3: string;
  let r: number;
  let g: number;
  let b: number;
  try {
    while (
      drawCount < options.drawCountMax &&
      codeCount <= options.codeCountMax
    ) {
      switch (pcode[state.line][state.code]) {
        // basic stack operations
        case PCode.null:
          break;

        case PCode.drop:
          n1 = memory.stack.pop();
          if (n1 === undefined) {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.dupl:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.stack.push(n1, n1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.swap:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(n2, n1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.rota:
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            memory.stack.push(n2, n3, n1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.roll:
          // n counts from the top of the stack (after n itself is popped), not
          // from the bottom of the never-reset evaluation-stack array
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            if (n1 > 0) {
              [n2] = memory.stack.splice(memory.stack.length - n1, 1);
              memory.stack.push(n2);
            } else if (n1 < 0) {
              n2 = memory.stack.pop();
              if (n2 !== undefined) {
                memory.stack.splice(memory.stack.length - (-n1 - 1), 0, n2);
              } else {
                throw new MachineError("Argument to ROLL cannot be zero.");
              }
            } else {
              throw new MachineError("Argument to ROLL cannot be zero.");
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.pick:
          // 1-indexed from the top, so PICK 1 behaves like DUPL (as in Pascal).
          // Currently unreachable from the compiler.
          n1 = pcode[state.line][state.code + 1];
          n2 = memory.stack[memory.stack.length - n1];
          memory.stack.push(n2);
          state.code += 1;
          break;

        // operators on stack value
        case PCode.incr:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.stack.push(n1 + 1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.decr:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.stack.push(n1 - 1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.neg:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.stack.push(-n1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.abs:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.stack.push(Math.abs(n1));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.sign:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.stack.push(Math.sign(n1));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // random numbers
        case PCode.rand:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            n2 = randomNumber(state.seed++);
            memory.stack.push(Math.floor(n2 * Math.abs(n1)));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.seed:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            if (n1 === 0) {
              // reseed from the clock, per the spec - not re-echo the old seed
              state.seed = timers.now();
              memory.stack.push(state.seed);
            } else {
              state.seed = n1;
              memory.stack.push(n1);
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // maximum integer
        case PCode.mxin:
          memory.stack.push(Math.pow(2, 31) - 1);
          break;

        // true value
        case PCode.true:
          n1 = pcode[state.line][state.code + 1];
          state.trueValue = n1;
          state.code += 1;
          break;

        // Boolean (bitwise) operators
        // The pcode reference describes SHFT as a 3-value rotate; only the
        // 2-value plain-shift subset Pascal's shl/shr need is implemented, with
        // Win_TurtleRun.pas's pcShft polarity (non-negative = left, negative =
        // right by the absolute value), which is what commands.ts assumes.
        case PCode.shft:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            if (n2 >= 0) {
              memory.stack.push(n1 << n2);
            } else {
              memory.stack.push(n1 >> -n2);
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.not:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.stack.push(~n1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.and:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(n1 & n2);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.or:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(n1 | n2);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.xor:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(n1 ^ n2);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // lazy Boolean operators
        case PCode.andl:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(n1 && n2);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.orl:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(n1 || n2);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // binary integer operators
        case PCode.plus:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(checkOverflow(n1 + n2));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.subt:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(checkOverflow(n1 - n2));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.mult:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(checkOverflow(n1 * n2));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.divr:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            if (n2 === 0) {
              throw new MachineError("Cannot divide by zero.");
            }
            n3 = n1 / n2;
            memory.stack.push(Math.round(n3));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.div:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            if (n2 === 0) {
              throw new MachineError("Cannot divide by zero.");
            }
            n3 = n1 / n2;
            memory.stack.push(n3 > 0 ? Math.floor(n3) : Math.ceil(n3));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.mod:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(n1 % n2);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // floored integer division
        case PCode.divf:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            if (n2 === 0) {
              throw new MachineError("Cannot divide by zero.");
            }
            n3 = n1 / n2;
            memory.stack.push(Math.floor(n3));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.modf:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(n1 - Math.floor(n1 / n2) * n2);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // pseudo-real number operators
        case PCode.divm:
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            memory.stack.push(Math.round((n1 / n2) * n3));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // linear interpolation: a+(b-a)*t/scale, rounded (Win_TurtleRun.pas's
        // pcLerp)
        case PCode.lerp:
          n4 = memory.stack.pop();
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (
            n1 !== undefined &&
            n2 !== undefined &&
            n3 !== undefined &&
            n4 !== undefined
          ) {
            memory.stack.push(Math.round(n1 + ((n2 - n1) * n3) / n4));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.hyp:
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            memory.stack.push(Math.round(Math.sqrt(n1 * n1 + n2 * n2) * n3));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // a^(1/b)*mult, rounded (Win_TurtleRun.pas's pcRoot); SQR compiles to
        // this with a constant 2 for b
        case PCode.root:
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            memory.stack.push(Math.round(Math.pow(n1, 1 / n2) * n3));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // (a/b)^(c/d)*mult, rounded (Win_TurtleRun.pas's pcPowr)
        case PCode.powr:
          n5 = memory.stack.pop();
          n4 = memory.stack.pop();
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (
            n1 !== undefined &&
            n2 !== undefined &&
            n3 !== undefined &&
            n4 !== undefined &&
            n5 !== undefined
          ) {
            memory.stack.push(Math.round(Math.pow(n1 / n2, n3 / n4) * n5));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.log:
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            memory.stack.push(Math.round((Math.log(n1 / n2) / Math.LN10) * n3));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.alog:
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            memory.stack.push(Math.round(Math.pow(10, n1 / n2) * n3));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.ln:
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            memory.stack.push(Math.round(Math.log(n1 / n2) * n3));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.exp:
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            memory.stack.push(Math.round(Math.exp(n1 / n2) * n3));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.sin:
          n4 = memory.stack.pop();
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          if (n2 !== undefined && n3 !== undefined && n4 !== undefined) {
            n1 = ((n2 / n3) * (2 * Math.PI)) / memory.getTurtA();
            memory.stack.push(Math.round(Math.sin(n1) * n4));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.cos:
          n4 = memory.stack.pop();
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          if (n2 !== undefined && n3 !== undefined && n4 !== undefined) {
            n1 = ((n2 / n3) * (2 * Math.PI)) / memory.getTurtA();
            memory.stack.push(Math.round(Math.cos(n1) * n4));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.tan:
          n4 = memory.stack.pop();
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          if (n2 !== undefined && n3 !== undefined && n4 !== undefined) {
            n1 = ((n2 / n3) * (2 * Math.PI)) / memory.getTurtA();
            memory.stack.push(Math.round(Math.tan(n1) * n4));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.asin:
          n4 = memory.stack.pop();
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          if (n2 !== undefined && n3 !== undefined && n4 !== undefined) {
            n1 = memory.getTurtA() / (2 * Math.PI);
            memory.stack.push(Math.round(Math.asin(n2 / n3) * n4 * n1));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.acos:
          n4 = memory.stack.pop();
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          if (n2 !== undefined && n3 !== undefined && n4 !== undefined) {
            n1 = memory.getTurtA() / (2 * Math.PI);
            memory.stack.push(Math.round(Math.acos(n2 / n3) * n4 * n1));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.atan:
          n4 = memory.stack.pop();
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          if (n2 !== undefined && n3 !== undefined && n4 !== undefined) {
            n1 = memory.getTurtA() / (2 * Math.PI);
            memory.stack.push(Math.round(Math.atan2(n2, n3) * n4 * n1));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.pi:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.stack.push(Math.round(Math.PI * n1));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // integer/Boolean comparison operators
        case PCode.eqal:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(n1 === n2 ? state.trueValue : 0);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.noeq:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(n1 !== n2 ? state.trueValue : 0);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.less:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(n1 < n2 ? state.trueValue : 0);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.more:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(n1 > n2 ? state.trueValue : 0);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.lseq:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(n1 <= n2 ? state.trueValue : 0);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.mreq:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(n1 >= n2 ? state.trueValue : 0);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.maxi:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(Math.max(n1, n2));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.mini:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.stack.push(Math.min(n1, n2));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // string comparison operators
        case PCode.seql:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            s2 = memory.getHeapString(n2);
            s1 = memory.getHeapString(n1);
            memory.stack.push(s1 === s2 ? state.trueValue : 0);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.sneq:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            s2 = memory.getHeapString(n2);
            s1 = memory.getHeapString(n1);
            memory.stack.push(s1 !== s2 ? state.trueValue : 0);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.sles:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            s2 = memory.getHeapString(n2);
            s1 = memory.getHeapString(n1);
            memory.stack.push(s1 < s2 ? state.trueValue : 0);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.smor:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            s2 = memory.getHeapString(n2);
            s1 = memory.getHeapString(n1);
            memory.stack.push(s1 > s2 ? state.trueValue : 0);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.sleq:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            s2 = memory.getHeapString(n2);
            s1 = memory.getHeapString(n1);
            memory.stack.push(s1 <= s2 ? state.trueValue : 0);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.smeq:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            s2 = memory.getHeapString(n2);
            s1 = memory.getHeapString(n1);
            memory.stack.push(s1 >= s2 ? state.trueValue : 0);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.smax:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            s2 = memory.getHeapString(n2);
            s1 = memory.getHeapString(n1);
            memory.makeHeapString(s2 > s1 ? s2 : s1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.smin:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            s2 = memory.getHeapString(n2);
            s1 = memory.getHeapString(n1);
            memory.makeHeapString(s2 < s1 ? s2 : s1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // string operators
        case PCode.case:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            s1 = memory.getHeapString(n1);
            switch (n2) {
              case 1:
                memory.makeHeapString(s1.toLowerCase());
                break;
              case 2:
                memory.makeHeapString(s1.toUpperCase());
                break;
              case 3:
                if (s1.length > 0) {
                  memory.makeHeapString(
                    s1[0].toUpperCase() + s1.slice(1).toLowerCase(),
                  );
                } else {
                  memory.makeHeapString(s1);
                }
                break;
              case 4:
                s1 = s1
                  .split(" ")
                  .map((x) =>
                    x.length > 0
                      ? x[0].toUpperCase() + x.slice(1).toLowerCase()
                      : x,
                  )
                  .join(" ");
                memory.makeHeapString(s1);
                break;
              case 5:
                s1 = s1
                  .split("")
                  .map((x) =>
                    x === x.toLowerCase() ? x.toUpperCase() : x.toLowerCase(),
                  )
                  .join("");
                memory.makeHeapString(s1);
                break;
              default:
                // this should be impossible
                memory.makeHeapString(s1);
                break;
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.copy:
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            s1 = memory.getHeapString(n1);
            memory.makeHeapString(s1.substr(n2 - 1, n3));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.dels:
          n4 = memory.stack.pop();
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          if (n2 !== undefined && n3 !== undefined && n4 !== undefined) {
            s2 = memory.getHeapString(n2);
            s1 = s2.substr(0, n3 - 1) + s2.substr(n3 - 1 + n4);
            memory.makeHeapString(s1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.inss:
          n4 = memory.stack.pop();
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          if (n2 !== undefined && n3 !== undefined && n4 !== undefined) {
            s3 = memory.getHeapString(n3);
            s2 = memory.getHeapString(n2);
            s1 = s3.substr(0, n4 - 1) + s2 + s3.substr(n4 - 1);
            memory.makeHeapString(s1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.poss:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            s2 = memory.getHeapString(n2);
            s1 = memory.getHeapString(n1);
            memory.stack.push(s2.indexOf(s1) + 1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.repl:
          n4 = memory.stack.pop();
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (
            n1 !== undefined &&
            n2 !== undefined &&
            n3 !== undefined &&
            n4 !== undefined
          ) {
            s3 = memory.getHeapString(n3);
            s2 = memory.getHeapString(n2);
            s1 = memory.getHeapString(n1);
            // s2 is a literal find-string, never a regex: a RegExp built from
            // it would misread metacharacters in perfectly valid plain text
            if (n4 < 1) {
              // one split/join pass over the *original* s1, so it can't loop
              // forever when s3 contains s2 (replacing "a" with "aa")
              s1 = s2 === "" ? s1 : s1.split(s2).join(s3);
            } else if (s2 !== "") {
              // splitting the *original* s1 up front stops a later replacement
              // re-matching text an earlier one just inserted
              const parts = s1.split(s2);
              const replaceCount = Math.min(n4, parts.length - 1);
              s1 =
                parts.slice(0, replaceCount + 1).join(s3) +
                (parts.length > replaceCount + 1
                  ? s2 + parts.slice(replaceCount + 1).join(s2)
                  : "");
            }
            memory.makeHeapString(s1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.scat:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            s2 = memory.getHeapString(n2);
            s1 = memory.getHeapString(n1);
            memory.makeHeapString(s1 + s2);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.slen:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.stack.push(memory.main[n1]);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.smul:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            s1 = memory.getHeapString(n1);
            memory.makeHeapString(s1.repeat(Math.max(n2, 0)));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.spad:
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            s2 = memory.getHeapString(n2);
            s1 = memory.getHeapString(n1);
            const width = Math.min(Math.abs(n3), DEFAULT_STRING_SIZE);
            if (s2.length === 0 && s1.length < width) {
              // an empty pad string would make the loop below never terminate
              throw new MachineError(
                "Cannot pad a string with an empty string.",
              );
            }
            while (s1.length + s2.length <= width) {
              if (n3 < 0) {
                s1 = s1 + s2;
              } else {
                s1 = s2 + s1;
              }
            }
            memory.makeHeapString(s1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.trim:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            s1 = memory.getHeapString(n1);
            memory.makeHeapString(s1.trim());
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // python string tests
        case PCode.ctst:
          // peeks rather than pops: the compiler reuses the tested value
          n1 = memory.stack[memory.stack.length - 1];
          if (n1 !== undefined) {
            s1 = memory.getHeapString(n1);
            if (s1.length !== 1) {
              throw new MachineError("String is not a character."); // TODO: better error message
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.ernf:
          // peeks rather than pops: the compiler reuses the tested value
          n1 = memory.stack[memory.stack.length - 1];
          if (n1 !== undefined) {
            if (n1 < 0) {
              throw new MachineError("Not found."); // TODO: better error message
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // string/array/list bound test
        case PCode.test:
          n2 = memory.stack[memory.stack.length - 1]; // leave the stack unchanged
          n1 = memory.stack[memory.stack.length - 2];
          if (n1 !== undefined && n2 !== undefined) {
            if (n1 < 0 || n1 >= memory.main[n2]) {
              // TODO: make range check a runtime option
              throw new MachineError(
                `Array index out of range (${n1}, ${memory.main[n2]}).`,
              );
            }
          }
          break;

        // exception handling
        case PCode.try:
          state.code += 1;
          n1 = pcode[state.line][state.code];
          if (n1 === 0 && memory.tryStack.length > 0) {
            memory.tryStack.pop();
          } else if (n1 > 0) {
            memory.tryStack.push([n1, memory.stack.length]);
          }
          break;

        case PCode.xcpt:
          // nothing to do here, this is just an anchor for TRY to jump to
          break;

        // list operators (Python) - see the list layout comment above
        case PCode.lapp:
          // lp is unused: appending never needs to know the element kind
          state.code += 1;
          n2 = memory.stack.pop(); // obj (value to append)
          n1 = memory.stack.pop(); // ^list
          if (n1 !== undefined && n2 !== undefined) {
            const length = listLength(n1);
            const capacity = listCapacity(n1);
            if (length >= capacity) {
              throw listCapacityExceededError(capacity);
            }
            setListElement(n1, length, n2);
            setListLength(n1, length + 1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.lcpy:
          // lp is unused: raw cells are copied regardless of element kind
          state.code += 1;
          // TOS is the *source* and the second value the destination - the
          // opposite of what the pcode reference's "| ^to ^from |" stack row
          // suggests, but what its prose says
          n2 = memory.stack.pop(); // source (row's "^to", TOS)
          n1 = memory.stack.pop(); // destination (row's "^from", second)
          if (n1 !== undefined && n2 !== undefined) {
            const sourceLength = listLength(n2);
            const destCapacity = listCapacity(n1);
            if (sourceLength > destCapacity) {
              throw listCapacityExceededError(destCapacity);
            }
            for (let i = 0; i < sourceLength; i += 1) {
              setListElement(n1, i, listElement(n2, i));
            }
            setListLength(n1, sourceLength);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.lext:
          // lp is unused: raw cells are copied regardless of element kind
          state.code += 1;
          n2 = memory.stack.pop(); // ^addlist (source items)
          n1 = memory.stack.pop(); // ^list (target, extended in place)
          if (n1 !== undefined && n2 !== undefined) {
            const addLength = listLength(n2);
            const targetLength = listLength(n1);
            const targetCapacity = listCapacity(n1);
            const combinedLength = targetLength + addLength;
            // checked up front so a capacity failure can't leave the list
            // half-extended
            if (combinedLength > targetCapacity) {
              throw listCapacityExceededError(targetCapacity);
            }
            for (let i = 0; i < addLength; i += 1) {
              setListElement(n1, targetLength + i, listElement(n2, i));
            }
            setListLength(n1, combinedLength);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.lidx:
          n3 = pcode[state.line][state.code + 1]; // lp
          state.code += 1;
          n2 = memory.stack.pop(); // obj
          n1 = memory.stack.pop(); // ^list
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            const { elementKind } = decodeLp(n3);
            const length = listLength(n1);
            let index = -1;
            for (let i = 0; i < length; i += 1) {
              if (listElementsEqual(elementKind, listElement(n1, i), n2)) {
                index = i;
                break;
              }
            }
            // 0-indexed, so "not found" is -1 - not string POSS's 1-indexed
            // 0-for-not-found convention
            memory.stack.push(index);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.lins:
          // lp is unused: raw cells are shifted regardless of element kind
          state.code += 1;
          n3 = memory.stack.pop(); // obj
          n2 = memory.stack.pop(); // posn
          n1 = memory.stack.pop(); // ^list
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            const length = listLength(n1);
            const capacity = listCapacity(n1);
            if (length >= capacity) {
              throw listCapacityExceededError(capacity);
            }
            // like real Python list.insert(), an out-of-range position clamps
            // rather than errors
            const posn =
              n2 < 0 ? Math.max(0, length + n2) : Math.min(n2, length);
            for (let i = length; i > posn; i -= 1) {
              setListElement(n1, i, listElement(n1, i - 1));
            }
            setListElement(n1, posn, n3);
            setListLength(n1, length + 1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.lmul:
          n3 = pcode[state.line][state.code + 1]; // lp
          state.code += 1;
          n2 = memory.stack.pop(); // n (multiplier)
          n1 = memory.stack.pop(); // ^list
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            // negative n behaves like Python's `list * n`, i.e. as 0
            const sourceLength = listLength(n1);
            const multiplier = Math.max(0, n2);
            const newLength = multiplier * sourceLength;
            const base = allocateHeapList(newLength, 0, 0, 0, newLength);
            for (let i = 0; i < newLength; i += 1) {
              setListElement(base, i, listElement(n1, i % sourceLength));
            }
            memory.stack.push(base);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.lprt:
          n2 = pcode[state.line][state.code + 1]; // lp
          state.code += 1;
          n1 = memory.stack.pop(); // ^list
          if (n1 !== undefined && n2 !== undefined) {
            const { elementKind } = decodeLp(n2);
            const length = listLength(n1);
            const parts: string[] = [];
            for (let i = 0; i < length; i += 1) {
              const value = listElement(n1, i);
              // Python repr() convention: single-quoted, comma-space-separated
              parts.push(
                elementKind === "string"
                  ? `'${memory.getHeapString(value)}'`
                  : value.toString(10),
              );
            }
            memory.makeHeapString(`[${parts.join(", ")}]`);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.lrem:
          n3 = pcode[state.line][state.code + 1]; // lp
          state.code += 1;
          n2 = memory.stack.pop(); // obj
          n1 = memory.stack.pop(); // ^list
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            const { elementKind } = decodeLp(n3);
            const length = listLength(n1);
            let index = -1;
            for (let i = 0; i < length; i += 1) {
              if (listElementsEqual(elementKind, listElement(n1, i), n2)) {
                index = i;
                break;
              }
            }
            // silent no-op if obj isn't present
            if (index > -1) {
              for (let i = index; i < length - 1; i += 1) {
                setListElement(n1, i, listElement(n1, i + 1));
              }
              setListLength(n1, length - 1);
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.ldel:
          // lp is unused: raw cells are shifted regardless of element kind.
          // Unlike x[i] read/write or real Python, a negative index is not
          // normalized to count from the end - it is simply invalid, as in the
          // Delphi original's listdel.
          state.code += 1;
          n2 = memory.stack.pop(); // index
          n1 = memory.stack.pop(); // ^list
          if (n1 !== undefined && n2 !== undefined) {
            const length = listLength(n1);
            if (n2 < 0 || n2 >= length) {
              throw new MachineError('Invalid list index in ".del" method.');
            }
            for (let i = n2; i < length - 1; i += 1) {
              setListElement(n1, i, listElement(n1, i + 1));
            }
            setListLength(n1, length - 1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.lrev:
          // lp is unused: raw cells are reversed regardless of element kind
          state.code += 1;
          n1 = memory.stack.pop(); // ^list
          if (n1 !== undefined) {
            const length = listLength(n1);
            for (let i = 0, j = length - 1; i < j; i += 1, j -= 1) {
              const swapValue = listElement(n1, i);
              setListElement(n1, i, listElement(n1, j));
              setListElement(n1, j, swapValue);
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.liad:
          n2 = pcode[state.line][state.code + 1]; // size
          state.code += 1;
          n1 = memory.stack.pop(); // ^addr
          if (n1 !== undefined && n2 !== undefined) {
            const { dim1, dim2, dim3, dim4 } = decodeSize(n2);
            writeListHeader(n1, dim1, dim2, dim3, dim4, 0);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.lihp: {
          n1 = pcode[state.line][state.code + 1]; // size
          const { dim1, dim2, dim3, dim4 } = decodeSize(n1);
          memory.stack.push(allocateHeapList(dim1, dim2, dim3, dim4, 0));
          state.code += 1;
          break;
        }

        // file processing - every FileSystem call suspends execute() via
        // suspendFor rather than returning synchronously
        case PCode.chdr: {
          n1 = memory.stack.pop(); // ^dpath
          if (n1 === undefined) {
            throw new MachineError("Stack operation called on empty stack.");
          }
          s1 = memory.getHeapString(n1);
          assertSafePath(s1);
          advancePastCurrentInstruction();
          // failure is a silent no-op: CHDR pushes nothing, and no commands.ts
          // caller inspects a result
          suspendFor(files.changeDirectory(s1), () => {});
          return;
        }

        case PCode.file: {
          n2 = memory.stack.pop(); // code
          n1 = memory.stack.pop(); // ^fname
          if (n1 === undefined || n2 === undefined) {
            throw new MachineError("Stack operation called on empty stack.");
          }
          s1 = memory.getHeapString(n1);
          assertSafePath(s1);
          testPathAndNotify(
            s1,
            n2,
            (path, action) => files.testFile(path, action),
            "file",
          );
          return;
        }

        case PCode.open: {
          n2 = memory.stack.pop(); // code (mode)
          n1 = memory.stack.pop(); // ^fname
          if (n1 === undefined || n2 === undefined) {
            throw new MachineError("Stack operation called on empty stack.");
          }
          s1 = memory.getHeapString(n1);
          assertSafePath(s1);
          const modeByCode: Record<number, FileOpenMode> = {
            1: "read",
            2: "append",
            3: "write",
            4: "rewrite",
          };
          const mode: FileOpenMode | undefined = modeByCode[n2];
          advancePastCurrentInstruction();
          if (mode === undefined) {
            // an out-of-range mode is user-program input (the generic openFile
            // command forwards one), so it fails like any other open failure
            memory.stack.push(0);
            execute();
            return;
          }
          suspendFor(files.openFile(s1, mode), (handle) => {
            memory.stack.push(handle);
          });
          return;
        }

        case PCode.clos:
          n1 = memory.stack.pop(); // handle
          if (n1 === undefined) {
            throw new MachineError("Stack operation called on empty stack.");
          }
          advancePastCurrentInstruction();
          suspendFor(files.close(n1), () => {});
          return;

        case PCode.fbeg:
          n1 = memory.stack.pop(); // handle
          if (n1 === undefined) {
            throw new MachineError("Stack operation called on empty stack.");
          }
          advancePastCurrentInstruction();
          suspendFor(files.restart(n1), () => {});
          return;

        case PCode.eof:
          n1 = memory.stack.pop(); // handle
          if (n1 === undefined) {
            throw new MachineError("Stack operation called on empty stack.");
          }
          advancePastCurrentInstruction();
          suspendFor(files.atEnd(n1), (atEnd) => {
            memory.stack.push(atEnd ? state.trueValue : 0);
          });
          return;

        case PCode.eoln:
          n1 = memory.stack.pop(); // handle
          if (n1 === undefined) {
            throw new MachineError("Stack operation called on empty stack.");
          }
          advancePastCurrentInstruction();
          suspendFor(files.atLineEnd(n1), (atLineEnd) => {
            memory.stack.push(atLineEnd ? state.trueValue : 0);
          });
          return;

        case PCode.frds:
          n2 = memory.stack.pop(); // max
          n1 = memory.stack.pop(); // handle
          if (n1 === undefined || n2 === undefined) {
            throw new MachineError("Stack operation called on empty stack.");
          }
          advancePastCurrentInstruction();
          suspendFor(files.readChars(n1, n2), (chars) => {
            memory.makeHeapString(chars);
          });
          return;

        case PCode.frln:
          n1 = memory.stack.pop(); // handle
          if (n1 === undefined) {
            throw new MachineError("Stack operation called on empty stack.");
          }
          advancePastCurrentInstruction();
          suspendFor(files.readLine(n1), (line) => {
            memory.makeHeapString(line);
          });
          return;

        case PCode.fwrs:
          n2 = memory.stack.pop(); // ^s
          n1 = memory.stack.pop(); // handle
          if (n1 === undefined || n2 === undefined) {
            throw new MachineError("Stack operation called on empty stack.");
          }
          s1 = memory.getHeapString(n2);
          advancePastCurrentInstruction();
          suspendFor(files.writeChars(n1, s1), () => {});
          return;

        case PCode.fwln:
          n2 = memory.stack.pop(); // ^s
          n1 = memory.stack.pop(); // handle
          if (n1 === undefined || n2 === undefined) {
            throw new MachineError("Stack operation called on empty stack.");
          }
          s1 = memory.getHeapString(n2);
          advancePastCurrentInstruction();
          suspendFor(files.writeLine(n1, s1), () => {});
          return;

        // remaining file processing (directory/search/move)
        case PCode.diry: {
          n2 = memory.stack.pop(); // code
          n1 = memory.stack.pop(); // ^dname
          if (n1 === undefined || n2 === undefined) {
            throw new MachineError("Stack operation called on empty stack.");
          }
          s1 = memory.getHeapString(n1);
          assertSafePath(s1);
          testPathAndNotify(
            s1,
            n2,
            (path, action) => files.testDirectory(path, action),
            "directory",
          );
          return;
        }

        case PCode.ffnd: {
          n2 = memory.stack.pop(); // ^fpatt
          n1 = memory.stack.pop(); // handle
          if (n1 === undefined || n2 === undefined) {
            throw new MachineError("Stack operation called on empty stack.");
          }
          s1 = memory.getHeapString(n2);
          // a pattern may combine a directory path with a glob ("subdir\*.txt");
          // assertSafePath checks every separated segment, so the glob needs no
          // splitting out first
          assertSafePath(s1);
          advancePastCurrentInstruction();
          suspendFor(files.findFirstFile(s1, n1), ([handle, match]) => {
            memory.stack.push(handle);
            memory.makeHeapString(match);
          });
          return;
        }

        case PCode.fdir: {
          n2 = memory.stack.pop(); // ^dpatt
          n1 = memory.stack.pop(); // handle
          if (n1 === undefined || n2 === undefined) {
            throw new MachineError("Stack operation called on empty stack.");
          }
          s1 = memory.getHeapString(n2);
          assertSafePath(s1);
          advancePastCurrentInstruction();
          suspendFor(files.findFirstDirectory(s1, n1), ([handle, match]) => {
            memory.stack.push(handle);
            memory.makeHeapString(match);
          });
          return;
        }

        case PCode.fnxt:
          n1 = memory.stack.pop(); // handle
          if (n1 === undefined) {
            throw new MachineError("Stack operation called on empty stack.");
          }
          advancePastCurrentInstruction();
          suspendFor(files.findNext(n1), (match) => {
            memory.makeHeapString(match);
          });
          return;

        case PCode.fmov: {
          n3 = memory.stack.pop(); // v
          n2 = memory.stack.pop(); // ^new
          n1 = memory.stack.pop(); // ^old
          if (n1 === undefined || n2 === undefined || n3 === undefined) {
            throw new MachineError("Stack operation called on empty stack.");
          }
          const oldPath = memory.getHeapString(n1);
          const newPath = memory.getHeapString(n2);
          // both paths are checked whatever v is, per the pcode reference's
          // "which is done in all cases"
          assertSafePath(oldPath);
          assertSafePath(newPath);
          const v = n3;
          advancePastCurrentInstruction();
          const pushResult = (ok: boolean) => {
            memory.stack.push(ok ? state.trueValue : 0);
          };
          switch (v) {
            case 1:
              suspendFor(files.renameFile(oldPath, newPath), pushResult);
              break;
            case 2:
              suspendFor(files.moveFile(oldPath, newPath), pushResult);
              break;
            case 3:
              suspendFor(files.copyFile(oldPath, newPath), pushResult);
              break;
            default:
              memory.stack.push(0);
              execute();
          }
          return;
        }

        // type conversion operators
        case PCode.ctos:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.makeHeapString(String.fromCharCode(n1));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.sasc:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            s1 = memory.getHeapString(n1);
            if (s1.length === 0) {
              memory.stack.push(0);
            } else {
              memory.stack.push(s1.charCodeAt(0));
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.itos:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.makeHeapString(n1.toString(10));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.hexs:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            // unsigned first, so -1 is "FFFFFFFF" rather than "-1"
            s1 = (n1 >>> 0).toString(16).toUpperCase();
            while (s1.length < n2) {
              s1 = "0" + s1;
            }
            memory.makeHeapString(s1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.sval:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            s1 = memory.getHeapString(n1);
            // coding parameter: 0="#", 1="$", 2="&", 3="0x"
            s2 = ["#", "$", "&", "0x"][n2] ?? "#";
            n3 = parseFullInt(s1, s2);
            if (isNaN(n3)) {
              throw new MachineError(`Cannot parse ${s1} to integer.`);
            } else {
              memory.stack.push(n3);
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.svdf:
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            s1 = memory.getHeapString(n1);
            // coding parameter: 0="#", 1="$", 2="&", 3="0x"
            s2 = ["#", "$", "&", "0x"][n3] ?? "#";
            n4 = parseFullInt(s1, s2);
            memory.stack.push(isNaN(n4) ? n2 : n4);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.qtos:
          n4 = memory.stack.pop();
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          if (n2 !== undefined && n3 !== undefined && n4 !== undefined) {
            if (n3 === 0) {
              throw new MachineError("Cannot divide by zero.");
            }
            n1 = n2 / n3;
            memory.makeHeapString(n1.toFixed(n4));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.qval:
          n3 = memory.stack.pop(); // default
          n2 = memory.stack.pop(); // multiplier
          n1 = memory.stack.pop(); // string address
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            s1 = memory.getHeapString(n1);
            n4 = parseFloat(s1);
            memory.stack.push(isNaN(n4) ? n3 : Math.round(n4 * n2));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // debugging and tracing
        case PCode.trac:
          memory.stack.pop(); // not implemented
          break;

        case PCode.memw:
          memory.stack.pop(); // not implemented
          break;

        case PCode.dump:
          output.updateMemoryDisplay(memory.dump());
          if (options.showMemoryOnDump) {
            output.selectTab("memory");
          }
          break;

        case PCode.pcoh:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            state.pcodeHalt = n1;
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.poke:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.main[n1] = n2;
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // canvas state
        case PCode.canv:
          n4 = memory.stack.pop();
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (
            n1 !== undefined &&
            n2 !== undefined &&
            n3 !== undefined &&
            n4 !== undefined
          ) {
            // a dimension of 1 pixel or less is a silent no-op, as in the
            // original system
            if (n3 > 1 && n4 > 1) {
              n5 = turtx(vcanvas, memory.getTurtX());
              const physY = turty(vcanvas, memory.getTurtY());
              vcanvas.startx = n1;
              vcanvas.starty = n2;
              vcanvas.sizex = n3;
              vcanvas.sizey = n4;
              canvas.setVirtualCanvas(n1, n2, n3, n4);
              // remapped into the new mapping so the turtle stays where it
              // visually was; heading is left untouched
              memory.setTurtX(
                Math.round((n5 * vcanvas.sizex) / vcanvas.width) +
                  vcanvas.startx,
              );
              memory.setTurtY(
                Math.round((physY * vcanvas.sizey) / vcanvas.height) +
                  vcanvas.starty,
              );
              output.updateTurtleProperty("x", memory.getTurtX());
              output.updateTurtleProperty("y", memory.getTurtY());
              memory.coords.push([memory.getTurtX(), memory.getTurtY()]);
              drawCount = options.drawCountMax; // force update
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.reso:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            if (Math.min(n1, n2) <= options.smallSize) {
              n1 *= 2;
              n2 *= 2;
              vcanvas.doubled = true;
            } else {
              vcanvas.doubled = false;
            }
            vcanvas.width = n1;
            vcanvas.height = n2;
            canvas.setResolution(n1, n2, vcanvas.doubled);
            canvas.clear("#FFFFFF");
            drawCount = options.drawCountMax; // force update
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.udat:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            bool1 = n1 !== 0;
            state.update = bool1;
            if (bool1) {
              drawCount = options.drawCountMax; // force update
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // basic turtle settings
        case PCode.home:
          // truncating division, matching Pascal's "cvminx + (canvasx div 2)"
          n1 = vcanvas.startx + Math.floor(vcanvas.sizex / 2);
          n2 = vcanvas.starty + Math.floor(vcanvas.sizey / 2);
          memory.setTurtX(n1);
          memory.setTurtY(n2);
          memory.setTurtD(0);
          output.updateTurtleProperty("x", memory.getTurtX());
          output.updateTurtleProperty("y", memory.getTurtY());
          output.updateTurtleProperty("d", memory.getTurtD());
          memory.coords.push([memory.getTurtX(), memory.getTurtY()]);
          break;

        case PCode.setx:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.setTurtX(n1);
            output.updateTurtleProperty("x", n1);
            memory.coords.push([memory.getTurtX(), memory.getTurtY()]);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.sety:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.setTurtY(n1);
            output.updateTurtleProperty("y", n1);
            memory.coords.push([memory.getTurtX(), memory.getTurtY()]);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.setd:
          n2 = memory.stack.pop();
          if (n2 !== undefined) {
            n1 = n2 % memory.getTurtA();
            memory.setTurtD(n1);
            output.updateTurtleProperty("d", n1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.angl:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            if (memory.getTurtA() === 0) {
              // only before angles is set for the first time
              memory.setTurtA(n1);
            }
            if (n1 === 0) {
              // never let angles be set to zero
              throw new MachineError("Angles cannot be set to zero.");
            }
            n2 = Math.round(n1 + (memory.getTurtD() * n1) / memory.getTurtA());
            memory.setTurtD(n2 % n1);
            memory.setTurtA(n1);
            output.updateTurtleProperty("d", n2 % n1);
            output.updateTurtleProperty("a", n1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.thik:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            n2 = Math.abs(n1);
            bool1 = n1 < 0;
            bool2 = memory.getTurtT() < 0;
            if (bool1) {
              memory.setTurtT(bool2 ? n2 : -n2);
            } else {
              memory.setTurtT(bool2 ? -n2 : n2);
            }
            output.updateTurtleProperty("t", memory.getTurtT());
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.pen:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            bool1 = n1 !== 0; // pen up or down
            n2 = Math.abs(memory.getTurtT()); // current thickness
            n3 = bool1 ? n2 : -n2; // positive or negative depending on whether pen is down or up
            memory.setTurtT(n3);
            output.updateTurtleProperty("t", n3);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.colr:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.setTurtC(n1);
            output.updateTurtleProperty("c", hex(n1));
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // turtle movement
        case PCode.toxy:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.setTurtX(n1);
            memory.setTurtY(n2);
            output.updateTurtleProperty("x", n1);
            output.updateTurtleProperty("y", n2);
            memory.coords.push([n1, n2]);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.mvxy:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            n2 += memory.getTurtY();
            n1 += memory.getTurtX();
            memory.setTurtX(n1);
            memory.setTurtY(n2);
            output.updateTurtleProperty("x", n1);
            output.updateTurtleProperty("y", n2);
            memory.coords.push([n1, n2]);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.drxy:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            n2 += memory.getTurtY();
            n1 += memory.getTurtX();
            if (memory.getTurtT() >= 0) {
              canvas.drawLine(
                turtle(vcanvas),
                turtx(vcanvas, n1),
                turty(vcanvas, n2),
              );
              if (state.update) {
                drawCount += 1;
              }
            }
            memory.setTurtX(n1);
            memory.setTurtY(n2);
            output.updateTurtleProperty("x", n1);
            output.updateTurtleProperty("y", n2);
            memory.coords.push([n1, n2]);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.fwrd:
          n3 = memory.stack.pop(); // distance
          if (n3 !== undefined) {
            n4 = memory.getTurtD(); // turtle direction
            n2 = Math.cos((n4 * Math.PI) / (memory.getTurtA() / 2));
            n2 = -Math.round(n2 * n3);
            n2 += memory.getTurtY();
            n1 = Math.sin((n4 * Math.PI) / (memory.getTurtA() / 2));
            n1 = Math.round(n1 * n3);
            n1 += memory.getTurtX();
            if (memory.getTurtT() >= 0) {
              canvas.drawLine(
                turtle(vcanvas),
                turtx(vcanvas, n1),
                turty(vcanvas, n2),
              );
              if (state.update) {
                drawCount += 1;
              }
            }
            memory.setTurtX(n1);
            memory.setTurtY(n2);
            output.updateTurtleProperty("x", n1);
            output.updateTurtleProperty("y", n2);
            memory.coords.push([n1, n2]);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.back:
          n3 = memory.stack.pop(); // distance
          if (n3 !== undefined) {
            n4 = memory.getTurtD(); // turtle direction
            n2 = Math.cos((n4 * Math.PI) / (memory.getTurtA() / 2));
            n2 = Math.round(n2 * n3);
            n2 += memory.getTurtY();
            n1 = Math.sin((n4 * Math.PI) / (memory.getTurtA() / 2));
            n1 = -Math.round(n1 * n3);
            n1 += memory.getTurtX();
            if (memory.getTurtT() >= 0) {
              canvas.drawLine(
                turtle(vcanvas),
                turtx(vcanvas, n1),
                turty(vcanvas, n2),
              );
              if (state.update) {
                drawCount += 1;
              }
            }
            memory.setTurtX(n1);
            memory.setTurtY(n2);
            output.updateTurtleProperty("x", n1);
            output.updateTurtleProperty("y", n2);
            memory.coords.push([n1, n2]);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.left:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            n3 = memory.getTurtA();
            n2 = (memory.getTurtD() + n3 - (n1 % n3)) % n3;
            memory.setTurtD(n2);
            output.updateTurtleProperty("d", n2);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.rght:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            n3 = memory.getTurtA();
            n2 = (memory.getTurtD() + n3 + (n1 % n3)) % n3;
            memory.setTurtD(n2);
            output.updateTurtleProperty("d", n2);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.turn:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            if (Math.abs(n2) >= Math.abs(n1)) {
              n3 = Math.atan(-n1 / n2);
              if (n2 > 0) {
                n3 += Math.PI;
              } else if (n1 < 0) {
                n3 += 2;
                n3 *= Math.PI;
              }
            } else {
              n3 = Math.atan(n2 / n1);
              if (n1 > 0) {
                n3 += Math.PI;
              } else {
                n3 += 3;
                n3 *= Math.PI;
              }
              n3 /= 2;
            }
            n3 =
              Math.round((n3 * memory.getTurtA()) / Math.PI / 2) %
              memory.getTurtA();
            memory.setTurtD(n3);
            output.updateTurtleProperty("d", n3);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // fills and colours
        case PCode.blnk:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            canvas.clear(hex(n1));
            if (state.update) {
              drawCount += 1;
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.rcol:
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            canvas.floodFill(
              turtx(vcanvas, n1),
              turty(vcanvas, n2),
              n3,
              0,
              false,
            );
            if (state.update) {
              drawCount += 1;
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.fill:
          n4 = memory.stack.pop();
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (
            n1 !== undefined &&
            n2 !== undefined &&
            n3 !== undefined &&
            n4 !== undefined
          ) {
            canvas.floodFill(
              turtx(vcanvas, n1),
              turty(vcanvas, n2),
              n3,
              n4,
              true,
            );
            if (state.update) {
              drawCount += 1;
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.pixc:
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          if (n2 !== undefined && n3 !== undefined) {
            const colour = canvas.readPixel(
              turtx(vcanvas, n2),
              turty(vcanvas, n3),
            );
            memory.stack.push(colour);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.pixs:
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            canvas.writePixel(
              turtx(vcanvas, n1),
              turty(vcanvas, n2),
              n3,
              vcanvas.doubled,
            );
            if (state.update) {
              drawCount += 1;
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.rgb:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            n1 = n1 % 50;
            if (n1 <= 0) {
              n1 += 50;
            }
            n1 = colours[n1 - 1].value;
            memory.stack.push(n1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.mixc:
          n4 = memory.stack.pop(); // second proportion
          n3 = memory.stack.pop(); // first proportion
          n2 = memory.stack.pop(); // second colour
          n1 = memory.stack.pop(); // first colour
          if (
            n1 !== undefined &&
            n2 !== undefined &&
            n3 !== undefined &&
            n4 !== undefined
          ) {
            r = Math.round(
              (Math.floor(n1 / 0x10000) * n3 + Math.floor(n2 / 0x10000) * n4) /
                (n3 + n4),
            );
            g = Math.round(
              (Math.floor((n1 & 0xff00) / 0x100) * n3 +
                Math.floor((n2 & 0xff00) / 0x100) * n4) /
                (n3 + n4),
            );
            b = Math.round(((n1 & 0xff) * n3 + (n2 & 0xff) * n4) / (n3 + n4));
            memory.stack.push(r * 0x10000 + g * 0x100 + b);
          }
          break;

        // drawing shapes
        case PCode.rmbr:
          memory.coords.push([memory.getTurtX(), memory.getTurtY()]);
          break;

        case PCode.frgt:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.coords.length = Math.max(0, memory.coords.length - n1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.poly:
          n3 = memory.stack.pop();
          if (n3 !== undefined) {
            // fewer than 2 points draws nothing, matching the original system
            if (n3 >= 2) {
              n2 = memory.coords.length;
              n1 = n3 > n2 ? 0 : n2 - n3;
              canvas.drawPolygon(
                turtle(vcanvas),
                memory.coords.slice(n1, n2).map(vcoords.bind(null, vcanvas)),
                false,
              );
              if (state.update) {
                drawCount += 1;
              }
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.pfil:
          n3 = memory.stack.pop();
          if (n3 !== undefined) {
            // fewer than 2 points draws nothing, matching the original system
            if (n3 >= 2) {
              n2 = memory.coords.length;
              n1 = n3 > n2 ? 0 : n2 - n3;
              canvas.drawPolygon(
                turtle(vcanvas),
                memory.coords.slice(n1, n2).map(vcoords.bind(null, vcanvas)),
                true,
              );
              if (state.update) {
                drawCount += 1;
              }
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.circ:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            canvas.drawArc(
              turtle(vcanvas),
              turtx(vcanvas, n1 + vcanvas.startx),
              turty(vcanvas, n1 + vcanvas.starty),
              false,
            );
            if (state.update) {
              drawCount += 1;
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.blot:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            canvas.drawArc(
              turtle(vcanvas),
              turtx(vcanvas, n1 + vcanvas.startx),
              turty(vcanvas, n1 + vcanvas.starty),
              true,
            );
            if (state.update) {
              drawCount += 1;
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.elps:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            canvas.drawArc(
              turtle(vcanvas),
              turtx(vcanvas, n1 + vcanvas.startx),
              turty(vcanvas, n2 + vcanvas.starty),
              false,
            );
            if (state.update) {
              drawCount += 1;
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.eblt:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            canvas.drawArc(
              turtle(vcanvas),
              turtx(vcanvas, n1 + vcanvas.startx),
              turty(vcanvas, n2 + vcanvas.starty),
              true,
            );
            if (state.update) {
              drawCount += 1;
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.box:
          n4 = memory.stack.pop();
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (
            n1 !== undefined &&
            n2 !== undefined &&
            n3 !== undefined &&
            n4 !== undefined
          ) {
            bool1 = n4 !== 0;
            n2 += memory.getTurtY();
            n1 += memory.getTurtX();
            canvas.drawBox(
              turtle(vcanvas),
              turtx(vcanvas, n1),
              turty(vcanvas, n2),
              hex(n3),
              bool1,
            );
            if (state.update) {
              drawCount += 1;
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // loading the (evaluation) stack
        case PCode.ldin:
          n1 = pcode[state.line][state.code + 1];
          memory.stack.push(n1);
          state.code += 1;
          break;

        case PCode.ldvg:
          n1 = pcode[state.line][state.code + 1];
          memory.stack.push(memory.peek(n1));
          state.code += 1;
          break;

        case PCode.ldvv:
          n1 = pcode[state.line][state.code + 1];
          n2 = pcode[state.line][state.code + 2];
          memory.stack.push(memory.main[memory.main[n1] + n2]);
          state.code += 2;
          break;

        case PCode.ldvr:
          n1 = pcode[state.line][state.code + 1];
          n2 = pcode[state.line][state.code + 2];
          memory.stack.push(memory.main[memory.main[memory.main[n1] + n2]]);
          state.code += 2;
          break;

        case PCode.ldag:
          n1 = pcode[state.line][state.code + 1];
          memory.stack.push(n1);
          state.code += 1;
          break;

        case PCode.ldav:
          n1 = pcode[state.line][state.code + 1];
          n2 = pcode[state.line][state.code + 2];
          memory.stack.push(memory.main[n1] + n2);
          state.code += 2;
          break;

        case PCode.lstr:
          state.code += 1;
          n1 = pcode[state.line][state.code]; // length of the string
          n2 = state.code + n1; // end of the string
          s1 = "";
          while (state.code < n2) {
            state.code += 1;
            s1 += String.fromCharCode(pcode[state.line][state.code]);
          }
          memory.makeHeapString(s1);
          break;

        // storing from the (evaluation) stack
        case PCode.stvg:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.main[pcode[state.line][state.code + 1]] = n1;
            state.code += 1;
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.stvv:
          n1 = pcode[state.line][state.code + 1];
          n2 = pcode[state.line][state.code + 2];
          n3 = memory.stack.pop();
          if (n3 !== undefined) {
            memory.main[memory.main[n1] + n2] = n3;
            state.code += 2;
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.stvr:
          n1 = pcode[state.line][state.code + 1];
          n2 = pcode[state.line][state.code + 2];
          n3 = memory.stack.pop();
          if (n3 !== undefined) {
            memory.main[memory.main[memory.main[n1] + n2]] = n3;
            state.code += 2;
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // pointer and string/array operations
        case PCode.lptr:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.stack.push(memory.main[n1]);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.sptr:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.main[n2] = n1;
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.zptr:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            memory.zero(n1, n2);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.cptr:
          n3 = memory.stack.pop(); // length
          n2 = memory.stack.pop(); // target
          n1 = memory.stack.pop(); // source
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            memory.copy(n1, n2, n3);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.cstr:
          n2 = memory.stack.pop(); // target
          n1 = memory.stack.pop(); // source
          if (n1 !== undefined && n2 !== undefined) {
            n4 = memory.main[n2 - 1] - 1; // maximum length available in target
            n3 = memory.main[n1]; // length of source
            n5 = Math.min(n3, n4); // truncated length actually copied
            memory.main[n2] = n5; // record the truncated length, not the source's
            memory.copy(n1 + 1, n2 + 1, n5); // copy only the character data
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.hstr:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            s1 = memory.getHeapString(n1);
            memory.makeHeapString(s1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // flow control
        case PCode.jump:
          state.line = pcode[state.line][state.code + 1] - 1;
          state.code = -1;
          break;

        case PCode.ifno:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            if (n1 === 0) {
              state.line = pcode[state.line][state.code + 1] - 1;
              state.code = -1;
            } else {
              state.code += 1;
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.halt:
          halt();
          return;

        case PCode.subr:
          if (memory.returnStack.length >= MAX_CALL_STACK_DEPTH) {
            throw callStackOverflowError("Subroutine return");
          }
          if (memory.getHeapGlobal() === -1) {
            memory.setHeapGlobal(memory.getHeapPerm());
          }
          memory.returnStack.push(state.line + 1);
          state.line = pcode[state.line][state.code + 1] - 1;
          state.code = -1;
          break;

        case PCode.retn:
          n1 = memory.returnStack.pop();
          if (n1 !== undefined) {
            state.line = n1;
            state.code = -1;
          } else {
            throw new MachineError("RETN called on empty return stack.");
          }
          break;

        case PCode.pssr:
          if (memory.subroutineStack.length >= MAX_CALL_STACK_DEPTH) {
            throw callStackOverflowError("Subroutine register");
          }
          memory.subroutineStack.push(pcode[state.line][state.code + 1]);
          state.code += 1;
          break;

        case PCode.plsr:
          memory.subroutineStack.pop();
          break;

        case PCode.psrj:
          memory.stack.push(state.line + 1);
          break;

        case PCode.plrj:
          memory.returnStack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            // n1 already accounts for the "+1" psrj pushed (as subr/retn do);
            // subtracting again would jump back to the call site itself
            state.line = n1;
            state.code = -1;
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // memory management
        case PCode.ldmt:
          // the *value* on top of the memory stack (whatever STMT last stored),
          // not the stack's length; -1 means nothing has been claimed yet
          memory.stack.push(
            memory.memoryStack.length > 0
              ? memory.memoryStack[memory.memoryStack.length - 1]
              : -1,
          );
          break;

        case PCode.stmt:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            memory.memoryStack.push(n1);
            memory.setStackTop(n1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.memc:
          if (memory.memoryStack.length >= MAX_CALL_STACK_DEPTH) {
            throw callStackOverflowError("Memory pointer");
          }
          n1 = pcode[state.line][state.code + 1];
          n2 = pcode[state.line][state.code + 2];
          n3 = memory.memoryStack.pop();
          if (n3 !== undefined) {
            if (n3 + n2 > options.stackSize) {
              throw new MachineError(
                "Memory stack has overflowed into memory heap. Probable cause is unterminated recursion.",
              );
            }
            memory.memoryStack.push(memory.main[n1]);
            memory.setStackTop(memory.main[n1]);
            memory.main[n1] = n3;
            memory.memoryStack.push(n3 + n2);
            memory.setStackTop(n3 + n2);
            state.code += 2;
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.memr:
          memory.memoryStack.pop();
          n1 = pcode[state.line][state.code + 1];
          n2 = memory.memoryStack.pop();
          if (n2 !== undefined) {
            memory.memoryStack.push(memory.main[n1]);
            memory.setStackTop(memory.main[n1]);
            memory.main[n1] = n2;
            state.code += 1;
          } else {
            throw new MachineError("MEMR called on empty memory stack.");
          }
          break;

        case PCode.hfix:
          memory.heapFix();
          break;

        case PCode.hclr:
          if (options.activateHCLR) {
            memory.heapClear();
          }
          break;

        case PCode.hrst:
          memory.heapReset();
          break;

        // input
        case PCode.stat:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            if (-11 <= n1 && n1 < 0) {
              memory.stack.push(memory.query[-n1]);
            } else if (0 < n1 && n1 < 256) {
              memory.stack.push(memory.keys[n1]);
            } else {
              memory.stack.push(0);
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.iclr:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            if (-11 <= n1 && n1 < 0) {
              memory.query[-n1] = -1;
            } else if (n1 === 0) {
              // reset the keybuffer's read and write pointers
              memory.main[memory.main[1] + 1] = memory.main[1] + 3;
              memory.main[memory.main[1] + 2] = memory.main[1] + 3;
            } else if (0 < n1 && n1 < 256) {
              memory.keys[n1] = -1;
            } else if (n1 === 256) {
              memory.keys.fill(-1);
              memory.query.fill(-1);
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.bufr:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            // a ring buffer of n1 usable slots, backed by n1+1 physical cells
            // so a full buffer's write pointer can be told from an empty one.
            // Layout (which input.ts's keybuffer logic also assumes):
            // main[f]=last content cell, main[f+1]=read ptr, main[f+2]=write
            // ptr, both starting at f+3 and wrapping back to it.
            const size = Math.max(n1, 0);
            const f = memory.getHeapTemp() + 1;
            const firstContentCell = f + 3;
            const lastContentCell = f + size + 3;
            memory.main[f] = lastContentCell;
            memory.main[f + 1] = firstContentCell;
            memory.main[f + 2] = firstContentCell;
            memory.main.fill(0, firstContentCell, lastContentCell + 1);
            memory.setHeapTemp(lastContentCell);
            memory.setHeapMax(memory.getHeapTemp());
            memory.stack.push(f);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.read:
          n1 = memory.stack.pop(); // maximum number of characters to read
          n2 = memory.main[1]; // the address of the buffer
          n3 = memory.main[memory.main[1]]; // the address of the end of the buffer
          s1 = ""; // the string read from the buffer
          r = memory.main[n2 + 1];
          g = memory.main[n2 + 2];
          if (n1 !== undefined) {
            if (n1 === 0) {
              while (r !== g) {
                s1 += String.fromCharCode(memory.main[r]);
                r = r < n3 ? r + 1 : n2 + 3; // loop back to the start
              }
            } else {
              while (r !== g && s1.length < n1) {
                s1 += String.fromCharCode(memory.main[r]);
                if (r < n3) {
                  r += 1;
                } else {
                  r = n2 + 3; // loop back to the start
                }
              }
              memory.main[n2 + 1] = r;
            }
            memory.makeHeapString(s1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.rdln:
          n1 = Math.pow(2, 31) - 1; // as long as possible
          advancePastCurrentInstruction();
          state.readlineTimeoutID = timers.scheduleCallback(execute, n1);
          return;

        case PCode.tdet:
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            if (-11 <= n1 && n1 < 256) {
              memory.stack.push(0);
              advancePastCurrentInstruction();
              state.detectInputcode = n1;
              state.detectActive = true;
              n3 = n2 === 0 ? Math.pow(2, 31) - 1 : n2; // 0 means "as long as possible"
              state.detectTimeoutID = timers.scheduleCallback(execute, n3);
            } else {
              throw new MachineError(
                `Detect called with invalid input state.code: ${n1}.`,
              );
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          return;

        case PCode.curs:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            canvas.setCursor(n1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        // text output
        case PCode.kech:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            bool1 = n1 !== 0;
            state.keyecho = bool1;
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.outp:
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            bool2 = n3 !== 0;
            bool1 = n1 !== 0;
            output.configureOutput(bool1, hex(n2));
            if (bool2) {
              output.selectTab("output");
            } else {
              output.selectTab("canvas");
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.cons:
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          if (n2 !== undefined && n3 !== undefined) {
            bool1 = n2 !== 0;
            output.configureConsole(bool1, hex(n3));
          }
          break;

        case PCode.disp:
          n3 = memory.stack.pop();
          n2 = memory.stack.pop();
          n1 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
            s1 = memory.getHeapString(n1);
            canvas.drawText(turtle(vcanvas), s1, n2, n3);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.writ:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            s1 = memory.getHeapString(n1);
            output.writeToOutput(s1);
            output.logToConsole(s1);
            if (options.showOutputOnWrite) {
              output.selectTab("output");
            }
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.newl:
          output.writeToOutput("\n");
          output.logToConsole("\n");
          break;

        // timing
        case PCode.time:
          n1 = timers.now();
          n1 = n1 - state.startTime;
          memory.stack.push(n1);
          break;

        case PCode.tset:
          n1 = timers.now();
          n2 = memory.stack.pop();
          if (n1 !== undefined && n2 !== undefined) {
            state.startTime = n1 - n2;
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          break;

        case PCode.wait:
          n1 = memory.stack.pop();
          if (n1 !== undefined) {
            advancePastCurrentInstruction();
            timers.scheduleCallback(execute, n1);
          } else {
            throw new MachineError("Stack operation called on empty stack.");
          }
          return;

        // anything else is an error
        default:
          throw new MachineError(
            `Unknown PCode 0x${pcode[state.line][state.code].toString(
              16,
            )} at line ${state.line}, code ${state.code}.`,
          );
      }
      codeCount += 1;
      state.code += 1;
      if (!pcode[state.line]) {
        throw new MachineError(
          "The program has tried to jump to a line that does not exist. This is either a bug in our compiler, or in your assembled code.",
        );
      }
      if (state.pcodeHalt === state.line) {
        halt();
        return;
      }
      if (state.code === pcode[state.line].length) {
        // line wrap
        state.line += 1;
        state.code = 0;
      }
    }
  } catch (error) {
    handleExecutionError(error);
  }
  // scheduling rather than recursing lets this function return, so the canvas
  // is painted before the next block runs
  timers.scheduleCallback(execute, 0);
};
