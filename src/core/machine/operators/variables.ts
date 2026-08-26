import type { Cycle } from "../types.ts";
import { MachineError } from "../error.ts";
import { callStackOverflowError, MAX_CALL_STACK_DEPTH } from "../limits.ts";
import * as memory from "../memory.ts";

// loading the (evaluation) stack

export const ldin = (cycle: Cycle): void => {
  memory.stack.push(cycle.operand());
};

export const ldvg = (cycle: Cycle): void => {
  memory.stack.push(memory.peek(cycle.operand()));
};

export const ldvv = (cycle: Cycle): void => {
  const address = cycle.operand();
  const offset = cycle.operand();
  memory.stack.push(memory.peekAddressOffset(address, offset));
};

export const ldvr = (cycle: Cycle): void => {
  const address = cycle.operand();
  const offset = cycle.operand();
  memory.stack.push(memory.peek(memory.peekAddressOffset(address, offset)));
};

export const ldag = (cycle: Cycle): void => {
  memory.stack.push(cycle.operand());
};

export const ldav = (cycle: Cycle): void => {
  const address = cycle.operand();
  const offset = cycle.operand();
  memory.stack.push(memory.peek(address) + offset);
};

export const lstr = (cycle: Cycle): void => {
  const length = cycle.operand();
  let string = "";
  for (let i = 0; i < length; i += 1) {
    string += String.fromCharCode(cycle.operand());
  }
  memory.makeHeapString(string);
};

// storing from the (evaluation) stack

export const stvg = (cycle: Cycle): void => {
  memory.main[cycle.operand()] = memory.popValue();
};

export const stvv = (cycle: Cycle): void => {
  const address = cycle.operand();
  const offset = cycle.operand();
  memory.pokeAddressOffset(address, offset, memory.popValue());
};

export const stvr = (cycle: Cycle): void => {
  const address = cycle.operand();
  const offset = cycle.operand();
  memory.main[memory.peekAddressOffset(address, offset)] = memory.popValue();
};

// pointer and string/array operations

export const lptr = (): void => {
  memory.stack.push(memory.peek(memory.popValue()));
};

export const sptr = (): void => {
  const address = memory.popValue();
  const value = memory.popValue();
  memory.main[address] = value;
};

export const zptr = (): void => {
  const length = memory.popValue();
  const start = memory.popValue();
  memory.zero(start, length);
};

export const cptr = (): void => {
  const length = memory.popValue();
  const target = memory.popValue();
  const source = memory.popValue();
  memory.copy(source, target, length);
};

export const cstr = (): void => {
  const target = memory.popValue();
  const source = memory.popValue();
  const available = memory.peek(target - 1) - 1; // maximum length in target
  const sourceLength = memory.peek(source);
  const length = Math.min(sourceLength, available); // truncated length
  memory.main[target] = length; // the truncated length, not the source's
  memory.copy(source + 1, target + 1, length); // character data only
};

export const hstr = (): void => {
  memory.makeHeapString(memory.popString());
};

// string/array/list bound test

export const test = (cycle: Cycle): void => {
  // reads without popping: the compiler goes on to reuse both values
  const pointer = memory.peekValue();
  const index = memory.peekValue(1);
  // `rangeCheckArrays` off means no check at all - the index is used as given,
  // and whatever happens, happens. That is the point of the option: it lets an
  // advanced student deliberately try to hack the machine. The operand reads
  // above are not part of it, so a program that never pushed them is still
  // wrong either way.
  if (!cycle.options.rangeCheckArrays) {
    return;
  }
  const length = memory.peek(pointer);
  if (index < 0 || index >= length) {
    throw new MachineError(`Array index out of range (${index}, ${length}).`);
  }
};

// memory management

export const ldmt = (): void => {
  // the *value* on top of the memory stack (whatever STMT last stored), not the
  // stack's length; -1 means nothing has been claimed yet
  memory.stack.push(memory.memoryStack.at(-1) ?? -1);
};

export const stmt = (): void => {
  const address = memory.popValue();
  memory.memoryStack.push(address);
  memory.setStackTop(address);
};

export const memc = (cycle: Cycle): void => {
  if (memory.memoryStack.length >= MAX_CALL_STACK_DEPTH) {
    throw callStackOverflowError("Memory pointer");
  }
  const address = cycle.operand();
  const size = cycle.operand();
  const base = memory.popMemoryStack();
  // `preventStackCollision` off means the frame is allocated anyway, and the
  // memory stack grows into the heap - where `heapBase` is fixed for the run
  // at `stackSize - 1`, and every heap pointer already handed out sits above
  // it. Deliberate rope, the same decision as `rangeCheckArrays` above: a
  // student who turns this off is trying to hack the machine, and gets to.
  if (
    cycle.options.preventStackCollision &&
    base + size > cycle.options.stackSize
  ) {
    throw new MachineError(
      "Memory stack has overflowed into memory heap. Probable cause is unterminated recursion.",
    );
  }
  memory.memoryStack.push(memory.peek(address));
  memory.setStackTop(memory.peek(address));
  memory.main[address] = base;
  memory.memoryStack.push(base + size);
  memory.setStackTop(base + size);
};

export const memr = (cycle: Cycle): void => {
  memory.memoryStack.pop();
  const address = cycle.operand();
  const base = memory.memoryStack.pop();
  if (base === undefined) {
    throw new MachineError("MEMR called on empty memory stack.");
  }
  memory.memoryStack.push(memory.peek(address));
  memory.setStackTop(memory.peek(address));
  memory.main[address] = base;
};

export const hfix = (): void => {
  memory.heapFix();
};

export const hclr = (cycle: Cycle): void => {
  if (cycle.options.activateHCLR) {
    memory.heapClear();
  }
};

export const hrst = (): void => {
  memory.heapReset();
};
