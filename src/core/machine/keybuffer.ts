import * as memory from "./memory.ts";

/**
 * The keyboard buffer, behind names.
 *
 * BUFR allocates a ring buffer of `size` usable slots, backed by `size + 1`
 * physical cells so that a full buffer's write pointer can be told apart from
 * an empty one's. Its base address `f` is stored in `main[1]` (0 when no buffer
 * has been allocated), and the three header cells are:
 *
 *   main[f]     = the address of the last content cell
 *   main[f + 1] = the read pointer  \  both start at f + 3 and wrap back to it
 *   main[f + 2] = the write pointer /  when they run past main[f]
 *   main[f + 3 ...] = the content cells, one character code each
 *
 * The same three offsets used to be spelled out at nine call sites across
 * `input.ts` and `runtime.ts` - the same circular advance written three times
 * over, against raw `main[buffer + 2]` arithmetic. This module is the only
 * place that knows the layout, in the same spirit as `runtime.ts`'s Python list
 * accessors.
 *
 * `memory.keys[0]` mirrors the number of characters currently buffered, which
 * is what a program reads as `?keybuffer`.
 */

/** Enter buffers a carriage return, which readLine stops at */
export const CARRIAGE_RETURN = 13;

/** the base address of the buffer, or 0 if BUFR has not run */
const base = (): number => memory.peek(1);

/** the address of the last content cell */
const lastCell = (f: number): number => memory.peek(f);

/** the address of the first content cell, which both pointers wrap back to */
const firstCell = (f: number): number => f + 3;

const readPointer = (f: number): number => memory.peek(f + 1);

const setReadPointer = (f: number, address: number): void => {
  memory.main[f + 1] = address;
};

const writePointer = (f: number): number => memory.peek(f + 2);

const setWritePointer = (f: number, address: number): void => {
  memory.main[f + 2] = address;
};

/** the next address round the ring, wrapping past the last content cell */
const nextCell = (f: number, address: number): number =>
  address < lastCell(f) ? address + 1 : firstCell(f);

/**
 * Recomputes `memory.keys[0]`, the buffered character count a program reads as
 * `?keybuffer`: the gap between the two pointers, plus a lap of the ring when
 * the write pointer has wrapped past the read pointer.
 */
const updateLength = (f: number): void => {
  memory.keys[0] =
    writePointer(f) >= readPointer(f)
      ? writePointer(f) - readPointer(f)
      : writePointer(f) - readPointer(f) + lastCell(f) - f - 2;
};

/** BUFR: allocates a buffer of `size` usable slots on the heap, and returns its base address */
export const allocate = (size: number): number => {
  const f = memory.getHeapTemp() + 1;
  const first = f + 3;
  const last = f + Math.max(size, 0) + 3;
  memory.main[f] = last;
  memory.main[f + 1] = first;
  memory.main[f + 2] = first;
  memory.main.fill(0, first, last + 1);
  memory.setHeapTemp(last);
  memory.setHeapMax(memory.getHeapTemp());
  return f;
};

/** ICLR 0: empties the buffer by putting both pointers back at the start */
export const resetPointers = (): void => {
  const f = base();
  setReadPointer(f, firstCell(f));
  setWritePointer(f, firstCell(f));
};

/**
 * Buffers one character code, returning whether there was room for it - the
 * caller echoes to the console only when there was. A full buffer drops the
 * character silently, as the original system does.
 */
export const push = (charCode: number): boolean => {
  const f = base();
  if (f <= 0) return false;
  const next =
    writePointer(f) === lastCell(f) ? firstCell(f) : writePointer(f) + 1;
  // the write pointer catching the read pointer means full, not empty: that is
  // what the spare physical cell buys
  if (next === readPointer(f)) return false;
  memory.main[writePointer(f)] = charCode;
  setWritePointer(f, next);
  updateLength(f);
  return true;
};

/**
 * Un-buffers the most recently buffered character, returning whether there was
 * one to remove - the caller backspaces the console only when there was.
 */
export const backspace = (): boolean => {
  const f = base();
  if (f <= 0) return false;
  const removed = readPointer(f) !== writePointer(f);
  if (removed) {
    setWritePointer(
      f,
      writePointer(f) === firstCell(f)
        ? lastCell(f) // go "back" to the end
        : writePointer(f) - 1,
    );
  }
  updateLength(f);
  return removed;
};

/** READ n: consumes up to `max` buffered characters */
export const read = (max: number): string => {
  const f = base();
  let string = "";
  let read = readPointer(f);
  const write = writePointer(f);
  while (read !== write && string.length < max) {
    string += String.fromCharCode(memory.peek(read));
    read = nextCell(f, read);
  }
  setReadPointer(f, read);
  return string;
};

/** READ 0: everything currently buffered, left in the buffer */
export const peekAll = (): string => {
  const f = base();
  let string = "";
  let read = readPointer(f);
  const write = writePointer(f);
  while (read !== write) {
    string += String.fromCharCode(memory.peek(read));
    read = nextCell(f, read);
  }
  return string;
};

/**
 * RDLN, once Enter has been pressed: consumes up to (and including) the next
 * carriage return, and returns the characters before it.
 */
export const readLine = (): string => {
  const f = base();
  let string = "";
  let read = readPointer(f);
  const write = writePointer(f);
  while (read !== write && memory.peek(read) !== CARRIAGE_RETURN) {
    string += String.fromCharCode(memory.peek(read));
    read = nextCell(f, read);
  }
  setReadPointer(f, nextCell(f, read));
  return string;
};
