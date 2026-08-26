import type { Cycle } from "../types.ts";
import { MachineError } from "../error.ts";
import * as memory from "../memory.ts";

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

/**
 * A list's `lp` operand packs its element kind into the low nibble and its
 * dimension count into the high one. The kind is a variable-type code shared
 * with the compiler's own type vocabulary, in which 5 is "string"; every other
 * value the low nibble can hold is an integer-like kind, so the test is against
 * 5 specifically rather than a range.
 */
const LIST_ELEMENT_KIND_STRING = 5;
const LIST_LP_RADIX = 16;

type ElementKind = "integer" | "string";

const elementKindOf = (lp: number): ElementKind =>
  lp % LIST_LP_RADIX === LIST_ELEMENT_KIND_STRING ? "string" : "integer";

/**
 * LIAD/LIHP's `size` operand packs four capacities into one word: dimensions
 * 1-3, then the max string length per element. Read field by field rather than
 * decoded into an object, because an object here would be allocated per
 * instruction - see `Cycle` in types.ts.
 */
const dim1Of = (size: number): number => size & 0x7ff;
const dim2Of = (size: number): number => (size >>> 11) & 0x3ff;
const dim3Of = (size: number): number => (size >>> 21) & 0x3f;
const dim4Of = (size: number): number => (size >>> 27) & 0x1f;

const listCapacityFromDims = (
  dim1: number,
  dim2: number,
  dim3: number,
): number => dim1 * (dim2 || 1) * (dim3 || 1);

const listLength = (base: number): number => memory.peek(base);

const setListLength = (base: number, length: number): void => {
  memory.main[base] = length;
};

const listCapacity = (base: number): number =>
  listCapacityFromDims(
    memory.peek(base + 1),
    memory.peek(base + 2),
    memory.peek(base + 3),
  );

const listElement = (base: number, index: number): number =>
  memory.peek(base + LIST_HEADER_SIZE + index);

const setListElement = (base: number, index: number, value: number): void => {
  memory.main[base + LIST_HEADER_SIZE + index] = value;
};

/**
 * Writes a list's header and zeroes its element region.
 *
 * The zeroing used to be a loop of its own, on the grounds that list capacities
 * run to tens of thousands of cells while `memory.zero` recursed per word. That
 * has not been true since `memory.zero` was made iterative for exactly the same
 * exposure (see the comment at its own definition), so the two are now the same
 * thing written twice - `TODO.md` §1.10.
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
  memory.zero(base + LIST_HEADER_SIZE, listCapacityFromDims(dim1, dim2, dim3));
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

/** a string-kind element is a pointer, so equality compares content, not pointers */
const listElementsEqual = (
  elementKind: ElementKind,
  a: number,
  b: number,
): boolean =>
  elementKind === "string"
    ? memory.getHeapString(a) === memory.getHeapString(b)
    : a === b;

/** the index of the first element equal to `obj`, or -1 if there is none */
const indexOfElement = (
  list: number,
  elementKind: ElementKind,
  obj: number,
): number => {
  const length = listLength(list);
  for (let i = 0; i < length; i += 1) {
    if (listElementsEqual(elementKind, listElement(list, i), obj)) {
      return i;
    }
  }
  return -1;
};

/** shifts every element after `index` down one, shortening the list */
const removeAt = (list: number, index: number): void => {
  const length = listLength(list);
  for (let i = index; i < length - 1; i += 1) {
    setListElement(list, i, listElement(list, i + 1));
  }
  setListLength(list, length - 1);
};

// list operators (Python)

export const lapp = (cycle: Cycle): void => {
  // lp is unused: appending never needs to know the element kind
  cycle.operand();
  const obj = memory.popValue();
  const list = memory.popValue();
  const length = listLength(list);
  const capacity = listCapacity(list);
  if (length >= capacity) {
    throw listCapacityExceededError(capacity);
  }
  setListElement(list, length, obj);
  setListLength(list, length + 1);
};

export const lcpy = (cycle: Cycle): void => {
  // lp is unused: raw cells are copied regardless of element kind
  cycle.operand();
  // TOS is the *source* and the second value the destination - the opposite of
  // what the pcode reference's "| ^to ^from |" stack row suggests, but what its
  // prose says
  const source = memory.popValue();
  const destination = memory.popValue();
  const sourceLength = listLength(source);
  const destCapacity = listCapacity(destination);
  if (sourceLength > destCapacity) {
    throw listCapacityExceededError(destCapacity);
  }
  for (let i = 0; i < sourceLength; i += 1) {
    setListElement(destination, i, listElement(source, i));
  }
  setListLength(destination, sourceLength);
};

export const lext = (cycle: Cycle): void => {
  // lp is unused: raw cells are copied regardless of element kind
  cycle.operand();
  // target is extended in place from addList's items
  const addList = memory.popValue();
  const target = memory.popValue();
  const addLength = listLength(addList);
  const targetLength = listLength(target);
  const targetCapacity = listCapacity(target);
  const combinedLength = targetLength + addLength;
  // checked up front so a capacity failure can't leave the list half-extended
  if (combinedLength > targetCapacity) {
    throw listCapacityExceededError(targetCapacity);
  }
  for (let i = 0; i < addLength; i += 1) {
    setListElement(target, targetLength + i, listElement(addList, i));
  }
  setListLength(target, combinedLength);
};

export const lidx = (cycle: Cycle): void => {
  const lp = cycle.operand();
  const obj = memory.popValue();
  const list = memory.popValue();
  // 0-indexed, so "not found" is -1 - not string POSS's 1-indexed
  // 0-for-not-found convention
  memory.stack.push(indexOfElement(list, elementKindOf(lp), obj));
};

export const lins = (cycle: Cycle): void => {
  // lp is unused: raw cells are shifted regardless of element kind
  cycle.operand();
  const obj = memory.popValue();
  const position = memory.popValue();
  const list = memory.popValue();
  const length = listLength(list);
  const capacity = listCapacity(list);
  if (length >= capacity) {
    throw listCapacityExceededError(capacity);
  }
  // like real Python list.insert(), an out-of-range position clamps rather than
  // errors
  const posn =
    position < 0 ? Math.max(0, length + position) : Math.min(position, length);
  for (let i = length; i > posn; i -= 1) {
    setListElement(list, i, listElement(list, i - 1));
  }
  setListElement(list, posn, obj);
  setListLength(list, length + 1);
};

export const lmul = (cycle: Cycle): void => {
  // lp is unused: raw cells are copied regardless of element kind
  cycle.operand();
  const n = memory.popValue();
  const list = memory.popValue();
  // negative n behaves like Python's `list * n`, i.e. as 0
  const sourceLength = listLength(list);
  const multiplier = Math.max(0, n);
  const newLength = multiplier * sourceLength;
  const base = allocateHeapList(newLength, 0, 0, 0, newLength);
  for (let i = 0; i < newLength; i += 1) {
    setListElement(base, i, listElement(list, i % sourceLength));
  }
  memory.stack.push(base);
};

export const lprt = (cycle: Cycle): void => {
  const lp = cycle.operand();
  const list = memory.popValue();
  const elementKind = elementKindOf(lp);
  const length = listLength(list);
  const parts: string[] = [];
  for (let i = 0; i < length; i += 1) {
    const value = listElement(list, i);
    // Python repr() convention: single-quoted, comma-space-separated
    parts.push(
      elementKind === "string"
        ? `'${memory.getHeapString(value)}'`
        : value.toString(10),
    );
  }
  memory.makeHeapString(`[${parts.join(", ")}]`);
};

export const lrem = (cycle: Cycle): void => {
  const lp = cycle.operand();
  const obj = memory.popValue();
  const list = memory.popValue();
  const index = indexOfElement(list, elementKindOf(lp), obj);
  // silent no-op if obj isn't present
  if (index > -1) {
    removeAt(list, index);
  }
};

export const ldel = (cycle: Cycle): void => {
  // lp is unused: raw cells are shifted regardless of element kind. Unlike x[i]
  // read/write or real Python, a negative index is not normalized to count from
  // the end - it is simply invalid, as in the Delphi original's listdel.
  cycle.operand();
  const index = memory.popValue();
  const list = memory.popValue();
  if (index < 0 || index >= listLength(list)) {
    throw new MachineError('Invalid list index in ".del" method.');
  }
  removeAt(list, index);
};

export const lrev = (cycle: Cycle): void => {
  // lp is unused: raw cells are reversed regardless of element kind
  cycle.operand();
  const list = memory.popValue();
  const length = listLength(list);
  for (let i = 0, j = length - 1; i < j; i += 1, j -= 1) {
    const swapValue = listElement(list, i);
    setListElement(list, i, listElement(list, j));
    setListElement(list, j, swapValue);
  }
};

export const liad = (cycle: Cycle): void => {
  const size = cycle.operand();
  const address = memory.popValue();
  writeListHeader(
    address,
    dim1Of(size),
    dim2Of(size),
    dim3Of(size),
    dim4Of(size),
    0,
  );
};

export const lihp = (cycle: Cycle): void => {
  const size = cycle.operand();
  memory.stack.push(
    allocateHeapList(dim1Of(size), dim2Of(size), dim3Of(size), dim4Of(size), 0),
  );
};
