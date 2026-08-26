import * as memory from "../memory.ts";
import { state } from "../state.ts";

/**
 * A comparison pushes `state.trueValue` rather than 1: the languages disagree
 * about what "true" is (BASIC's -1, Pascal's 1), and TRUE sets it per program.
 */
const push = (result: boolean): void => {
  memory.stack.push(result ? state.trueValue : 0);
};

/**
 * The string operators below all pop both pointers and *then* resolve them,
 * shallowest first. Reading a temporary heap string frees everything above it,
 * so resolving the deeper pointer first would discard the shallower string
 * before it could be read - which is also why they cannot use `popString`.
 *
 * There is deliberately no helper returning both strings at once: it would
 * allocate a tuple per instruction, which is the mistake Phase 2 measured at
 * 11-17x on the example suite (see memory.ts's note on `popValue`).
 */

// integer/Boolean comparison operators

export const eqal = (): void => {
  const right = memory.popValue();
  const left = memory.popValue();
  push(left === right);
};

export const noeq = (): void => {
  const right = memory.popValue();
  const left = memory.popValue();
  push(left !== right);
};

export const less = (): void => {
  const right = memory.popValue();
  const left = memory.popValue();
  push(left < right);
};

export const more = (): void => {
  const right = memory.popValue();
  const left = memory.popValue();
  push(left > right);
};

export const lseq = (): void => {
  const right = memory.popValue();
  const left = memory.popValue();
  push(left <= right);
};

export const mreq = (): void => {
  const right = memory.popValue();
  const left = memory.popValue();
  push(left >= right);
};

export const maxi = (): void => {
  const right = memory.popValue();
  const left = memory.popValue();
  memory.stack.push(Math.max(left, right));
};

export const mini = (): void => {
  const right = memory.popValue();
  const left = memory.popValue();
  memory.stack.push(Math.min(left, right));
};

// string comparison operators

export const seql = (): void => {
  const rightPointer = memory.popValue();
  const leftPointer = memory.popValue();
  const right = memory.getHeapString(rightPointer);
  const left = memory.getHeapString(leftPointer);
  push(left === right);
};

export const sneq = (): void => {
  const rightPointer = memory.popValue();
  const leftPointer = memory.popValue();
  const right = memory.getHeapString(rightPointer);
  const left = memory.getHeapString(leftPointer);
  push(left !== right);
};

export const sles = (): void => {
  const rightPointer = memory.popValue();
  const leftPointer = memory.popValue();
  const right = memory.getHeapString(rightPointer);
  const left = memory.getHeapString(leftPointer);
  push(left < right);
};

export const smor = (): void => {
  const rightPointer = memory.popValue();
  const leftPointer = memory.popValue();
  const right = memory.getHeapString(rightPointer);
  const left = memory.getHeapString(leftPointer);
  push(left > right);
};

export const sleq = (): void => {
  const rightPointer = memory.popValue();
  const leftPointer = memory.popValue();
  const right = memory.getHeapString(rightPointer);
  const left = memory.getHeapString(leftPointer);
  push(left <= right);
};

export const smeq = (): void => {
  const rightPointer = memory.popValue();
  const leftPointer = memory.popValue();
  const right = memory.getHeapString(rightPointer);
  const left = memory.getHeapString(leftPointer);
  push(left >= right);
};

export const smax = (): void => {
  const rightPointer = memory.popValue();
  const leftPointer = memory.popValue();
  const right = memory.getHeapString(rightPointer);
  const left = memory.getHeapString(leftPointer);
  memory.makeHeapString(right > left ? right : left);
};

export const smin = (): void => {
  const rightPointer = memory.popValue();
  const leftPointer = memory.popValue();
  const right = memory.getHeapString(rightPointer);
  const left = memory.getHeapString(leftPointer);
  memory.makeHeapString(right < left ? right : left);
};
