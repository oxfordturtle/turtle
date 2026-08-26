import type { MachineOptions, MemoryDump, TurtleState } from "./types.ts";
import { MachineError } from "./error.ts";

export const main: number[] = [];
export const keys: number[] = [];
export const query: number[] = [];

export const coords: [number, number][] = [];
export const stack: number[] = [];
export const memoryStack: number[] = [];
export const returnStack: number[] = [];
export const subroutineStack: number[] = [];
// each entry is [xcptLine, stackHeight] - stackHeight is the evaluation
// stack's height at the moment TRY registered the handler, restored on
// catch (matching Pascal's trystack[].stackheight)
export const tryStack: [number, number][] = [];

let stackTop = 0;
let heapGlobal = 0;
let heapBase = 0;
let heapTemp = 0;
let heapPerm = 0;
let heapMax = 0;
let heapClearPending = false;

const turtxIndex = 1;
const turtyIndex = 2;
const turtdIndex = 3;
const turtaIndex = 4;
const turttIndex = 5;
const turtcIndex = 6;

/**
 * The evaluation stack's typed accessors. Every operator that consumes operands
 * goes through these rather than calling `stack.pop()` and testing for
 * `undefined` itself: the check is identical in every case, and concentrating
 * it here is what makes it a single branch the coverage gate can actually see.
 *
 * There is deliberately no `popPair`/`popTriple` returning several values at
 * once. A tuple-returning helper reads better, but it allocates an array per
 * instruction, and `execute()` runs up to `options.codeCountMax` instructions
 * per block: measured on the example suite, the array-heavy programs ran 11-17x
 * slower with one (`BASIC/Cellular/IteratedPD.tbas`, 1.1s -> 18.5s). Operators
 * that need several operands call `popValue` once each, in pop order - which
 * also removes any chance of silently reversing a subtraction's operands.
 */

/** pops one value, throwing if the evaluation stack is empty */
export const popValue = (): number => {
  const value = stack.pop();
  if (value === undefined) {
    throw new MachineError("Stack operation called on empty stack.");
  }
  return value;
};

/**
 * Reads the value `depth` below the top of the stack without popping it,
 * throwing if the stack is not that deep. CTST and ERNF test a value the
 * compiler goes on to reuse, so they must not consume it.
 */
export const peekValue = (depth = 0): number => {
  const value = stack.at(-1 - depth);
  if (value === undefined) {
    throw new MachineError("Stack operation called on empty stack.");
  }
  return value;
};

/**
 * Pops the memory stack, throwing if it is empty.
 *
 * MEMC reports the *evaluation* stack's message here even though it is the
 * memory stack that ran out - preserved verbatim, because `errors.test.ts` and
 * the example snapshots both record the exact text.
 */
export const popMemoryStack = (): number => {
  const value = memoryStack.pop();
  if (value === undefined) {
    throw new MachineError("Stack operation called on empty stack.");
  }
  return value;
};

/**
 * Pops a pointer and resolves it through getHeapString.
 *
 * Only for an operator whose string is its *deepest* operand, so that the
 * resolution still happens after every other operand has been popped:
 * getHeapString frees the temporary heap above the string it reads, so when two
 * pointers are involved the shallower must be resolved first. Those operators
 * pop both pointers and call getHeapString themselves, in that order.
 */
export const popString = (): string => {
  return getHeapString(popValue());
};

export const init = (options: MachineOptions): void => {
  main.length = 0x200000;
  keys.length = 0x100;
  query.length = 0x10;
  main.fill(0);
  keys.fill(-1);
  query.fill(-1);
  coords.length = 0;
  stack.length = 0;
  memoryStack.length = 0;
  returnStack.length = 0;
  subroutineStack.length = 0;
  tryStack.length = 0;
  stackTop = 0;
  heapGlobal = -1;
  heapBase = options.stackSize - 1;
  heapTemp = heapBase;
  heapPerm = heapTemp;
  heapMax = heapTemp;
  heapClearPending = false;
};

/**
 * Reads one word of main memory, throwing if the address is outside it.
 *
 * The mirror of `popValue`, and the reason it exists: `main[address]` is every
 * bit as out-of-bounds-prone as `stack.pop()`, but until
 * `noUncheckedIndexedAccess` was turned on it was the half of the pair the type
 * checker let through unguarded. `init()` sizes `main` to its full 0x200000
 * words and zero-fills them, so the only address that can miss is one outside
 * that range - an unassigned or corrupted pointer - which used to read
 * `undefined` and poison every sum downstream with NaN. Concentrating the check
 * here keeps it a single branch the coverage gate can see.
 *
 * Writes need no equivalent: assigning past the end of a JS array grows it, and
 * `main` is only ever indexed by an address the machine itself produced.
 */
export const peek = (address: number): number => {
  const value = main[address];
  if (value === undefined) {
    throw new MachineError(`Memory address out of range (${address}).`);
  }
  return value;
};

/**
 * The input arrays' read accessors.
 *
 * Unlike `main`, these two cannot be missed by accident: `init()` sizes and
 * fills them, and every code that reaches them has already been checked against
 * the STAT/ICLR/TDET protocol's bounds (`QUERY_CODE_MIN`..`KEY_CODE_COUNT`) or
 * is one of `input.ts`'s own named `QUERY_*` constants. A runtime guard here
 * would be a branch no test could reach, so the assertion states the invariant
 * instead - once, rather than at each of the ten call sites.
 *
 * The one code not checked anywhere is the `keyCode` a keyup carries straight
 * from the DOM. A keyup above 255 with no keydown before it would read past the
 * array; that is the pre-existing behaviour, not something the assertion
 * introduced, and it stores a NaN exactly as it always has.
 */
export const readQuery = (code: number): number => query[code]!;

export const readKey = (code: number): number => keys[code]!;

export const peekAddressOffset = (address: number, offset: number): number => {
  return peek(peek(address) + offset);
};

export const pokeAddressOffset = (
  address: number,
  offset: number,
  value: number,
): void => {
  main[peek(address) + offset] = value;
};

export const getTurtX = (): number => {
  return peekAddressOffset(0, turtxIndex);
};

export const getTurtY = (): number => {
  return peekAddressOffset(0, turtyIndex);
};

export const getTurtD = (): number => {
  return peekAddressOffset(0, turtdIndex);
};

export const getTurtA = (): number => {
  return peekAddressOffset(0, turtaIndex);
};

export const getTurtT = (): number => {
  return peekAddressOffset(0, turttIndex);
};

export const getTurtC = (): number => {
  return peekAddressOffset(0, turtcIndex);
};

export const setTurtX = (turtx: number): void => {
  pokeAddressOffset(0, turtxIndex, turtx);
};

export const setTurtY = (turty: number): void => {
  pokeAddressOffset(0, turtyIndex, turty);
};

export const setTurtD = (turtd: number): void => {
  pokeAddressOffset(0, turtdIndex, turtd);
};

export const setTurtA = (turta: number): void => {
  pokeAddressOffset(0, turtaIndex, turta);
};

export const setTurtT = (turtt: number): void => {
  pokeAddressOffset(0, turttIndex, turtt);
};

export const setTurtC = (turtc: number): void => {
  pokeAddressOffset(0, turtcIndex, turtc);
};

export const getTurtle = (): TurtleState => {
  return {
    x: getTurtX(),
    y: getTurtY(),
    d: getTurtD(),
    a: getTurtA(),
    t: getTurtT(),
    c: getTurtC(),
  };
};

export const getHeapGlobal = (): number => {
  return heapGlobal;
};

export const setHeapGlobal = (value: number): void => {
  heapGlobal = value;
};

export const getHeapPerm = (): number => {
  return heapPerm;
};

export const setStackTop = (value: number): void => {
  stackTop = Math.max(value, stackTop);
};

export const getHeapTemp = (): number => {
  return heapTemp;
};

export const setHeapTemp = (value: number): void => {
  heapTemp = value;
};

export const setHeapMax = (value: number): void => {
  heapMax = Math.max(value, heapMax);
};

export const heapFix = (): void => {
  heapPerm = heapTemp;
};

export const heapClear = (): void => {
  // deferred while the evaluation stack is non-empty: a part-evaluated
  // expression may still be holding pointers into the temporary heap
  if (stack.length === 0) {
    heapTemp = heapPerm;
  } else {
    heapClearPending = true;
  }
};

export const delayedHeapClear = (): void => {
  if (heapClearPending) {
    heapClearPending = false;
    heapClear();
  }
};

/** resets the heap to its true base, discarding global heap strings and the keyboard buffer too */
export const heapReset = (): void => {
  heapTemp = heapBase;
  heapPerm = heapBase;
  main[1] = 0; // delete keyboard buffer
};

export const makeHeapString = (string: string): void => {
  const stringArray = Array.from(string).map((c) => c.charCodeAt(0));
  stack.push(heapTemp + 1);
  heapTemp += 1;
  main[heapTemp] = string.length;
  for (const code of stringArray) {
    heapTemp += 1;
    main[heapTemp] = code;
  }
  heapMax = Math.max(heapTemp, heapMax);
};

export const getHeapString = (address: number): string => {
  if (address === 0) {
    throw new MachineError("String pointer unassigned.");
  }
  const length = peek(address);
  const start = address + 1;
  const charArray = main.slice(start, start + length);
  const string = charArray.map((c) => String.fromCharCode(c)).join("");
  // Reading a *temporary* heap string frees it and everything allocated after
  // it: an expression's intermediate strings are dead once consumed. Only a
  // within-statement optimisation - HCLR is what actually stops a
  // string-building loop exhausting the heap.
  //
  // The bound is strict. `address + length + 1 > heapPerm` would also catch the
  // *last permanent* string, whose final character sits exactly at heapPerm, so
  // reading it would rewind heapTemp and reclaim live temporaries - making
  // "t[0][:1] + t[0][2:]" on t=['bcef'] evaluate to "efef".
  if (address > heapPerm) {
    heapTemp = address + length;
  }
  return string;
};

export const zero = (start: number, length: number): void => {
  // iterative, not recursive: a few large global arrays need thousands of words
  // zeroed in one call, which a frame-per-word recursion cannot survive
  for (let i = 0; i < length; i += 1) {
    main[start + i] = 0;
  }
};

/** a proper memmove: safe for overlapping ranges in either direction */
export const copy = (source: number, target: number, length: number): void => {
  if (target > source) {
    copyBackward(source, target, length);
  } else {
    copyForward(source, target, length);
  }
};

// iterative, not recursive, for the reason `zero` above gives: a frame per
// word cannot survive the tens of thousands a large CPTR asks for (TODO.md
// §1.6, fixed). The directions differ only in which end they start from,
// which is what makes `copy` a proper memmove.

const copyForward = (source: number, target: number, length: number): void => {
  for (let i = 0; i < length; i += 1) {
    main[target + i] = peek(source + i);
  }
};

const copyBackward = (source: number, target: number, length: number): void => {
  for (let i = length - 1; i >= 0; i -= 1) {
    main[target + i] = peek(source + i);
  }
};

export const dump = (): MemoryDump => ({
  // the *memory* stack region of main, not this module's evaluation `stack`
  stack: main.slice(0, stackTop + 1),
  heap: main.slice(heapBase + 1, heapMax + 1),
  heapBase: heapBase + 1,
});
