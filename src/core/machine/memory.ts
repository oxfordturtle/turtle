import type { MachineOptions, MemoryDump } from "./types.ts";
import { MachineError } from "./utils.ts";

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

export function init(options: MachineOptions): void {
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
}

export function peek(address: number): number {
  return main[address];
}

export function peekAddressOffset(address: number, offset: number): number {
  return main[main[address] + offset];
}

export function pokeAddressOffset(
  address: number,
  offset: number,
  value: number,
): void {
  main[main[address] + offset] = value;
}

export function getTurtX(): number {
  return peekAddressOffset(0, turtxIndex);
}

export function getTurtY(): number {
  return peekAddressOffset(0, turtyIndex);
}

export function getTurtD(): number {
  return peekAddressOffset(0, turtdIndex);
}

export function getTurtA(): number {
  return peekAddressOffset(0, turtaIndex);
}

export function getTurtT(): number {
  return peekAddressOffset(0, turttIndex);
}

export function getTurtC(): number {
  return peekAddressOffset(0, turtcIndex);
}

export function setTurtX(turtx: number) {
  pokeAddressOffset(0, turtxIndex, turtx);
}

export function setTurtY(turty: number) {
  pokeAddressOffset(0, turtyIndex, turty);
}

export function setTurtD(turtd: number) {
  pokeAddressOffset(0, turtdIndex, turtd);
}

export function setTurtA(turta: number) {
  pokeAddressOffset(0, turtaIndex, turta);
}

export function setTurtT(turtt: number) {
  pokeAddressOffset(0, turttIndex, turtt);
}

export function setTurtC(turtc: number) {
  pokeAddressOffset(0, turtcIndex, turtc);
}

export function getTurtle() {
  return {
    x: getTurtX(),
    y: getTurtY(),
    d: getTurtD(),
    a: getTurtA(),
    t: getTurtT(),
    c: getTurtC(),
  };
}

export function getHeapGlobal(): number {
  return heapGlobal;
}

export function setHeapGlobal(value: number): void {
  heapGlobal = value;
}

export function getHeapPerm(): number {
  return heapPerm;
}

export function setStackTop(value: number): void {
  stackTop = Math.max(value, stackTop);
}

export function getHeapTemp(): number {
  return heapTemp;
}

export function setHeapTemp(value: number): void {
  heapTemp = value;
}

export function setHeapMax(value: number): void {
  heapMax = Math.max(value, heapMax);
}

export function heapFix(): void {
  heapPerm = heapTemp;
}

export function heapClear(): void {
  // deferred while the evaluation stack is non-empty: a part-evaluated
  // expression may still be holding pointers into the temporary heap
  if (stack.length === 0) {
    heapTemp = heapPerm;
  } else {
    heapClearPending = true;
  }
}

export function delayedHeapClear(): void {
  if (heapClearPending) {
    heapClearPending = false;
    heapClear();
  }
}

/** resets the heap to its true base, discarding global heap strings and the keyboard buffer too */
export function heapReset(): void {
  heapTemp = heapBase;
  heapPerm = heapBase;
  main[1] = 0; // delete keyboard buffer
}

export function makeHeapString(string: string): void {
  const stringArray = Array.from(string).map((c) => c.charCodeAt(0));
  stack.push(heapTemp + 1);
  heapTemp += 1;
  main[heapTemp] = string.length;
  for (const code of stringArray) {
    heapTemp += 1;
    main[heapTemp] = code;
  }
  heapMax = Math.max(heapTemp, heapMax);
}

export function getHeapString(address: number): string {
  if (address === 0) {
    throw new MachineError("String pointer unassigned.");
  }
  const length = main[address];
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
}

export function zero(start: number, length: number): void {
  // iterative, not recursive: a few large global arrays need thousands of words
  // zeroed in one call, which a frame-per-word recursion cannot survive
  for (let i = 0; i < length; i += 1) {
    main[start + i] = 0;
  }
}

/** a proper memmove: safe for overlapping ranges in either direction */
export function copy(source: number, target: number, length: number): void {
  if (target > source) {
    copyBackward(source, target, length);
  } else {
    copyForward(source, target, length);
  }
}

function copyForward(source: number, target: number, length: number): void {
  if (length > 0) {
    main[target] = main[source];
    copyForward(source + 1, target + 1, length - 1);
  }
}

function copyBackward(source: number, target: number, length: number): void {
  if (length > 0) {
    main[target + length - 1] = main[source + length - 1];
    copyBackward(source, target, length - 1);
  }
}

export function dump(): MemoryDump {
  const stack = main.slice(0, stackTop + 1);
  const heap = main.slice(heapBase + 1, heapMax + 1);
  return { stack, heap, heapBase: heapBase + 1 };
}
