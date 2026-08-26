import type { Cycle } from "../types.ts";
import { MachineError } from "../error.ts";
import * as memory from "../memory.ts";

const nullOperator = (): void => {};

export { nullOperator as null };

export const drop = (): void => {
  memory.popValue();
};

export const dupl = (): void => {
  const value = memory.popValue();
  memory.stack.push(value, value);
};

export const swap = (): void => {
  const second = memory.popValue();
  const first = memory.popValue();
  memory.stack.push(second, first);
};

export const rota = (): void => {
  const third = memory.popValue();
  const second = memory.popValue();
  const first = memory.popValue();
  memory.stack.push(second, third, first);
};

export const roll = (): void => {
  // n counts from the top of the stack (after n itself is popped), not from the
  // bottom of the never-reset evaluation-stack array
  const n = memory.popValue();
  if (n > 0) {
    // splice clamps a negative start to 0, so it comes back empty only when the
    // stack is empty - the same short stack every other operator throws on
    const [value] = memory.stack.splice(memory.stack.length - n, 1);
    if (value === undefined) {
      throw new MachineError("Stack operation called on empty stack.");
    }
    memory.stack.push(value);
  } else if (n < 0) {
    const value = memory.stack.pop();
    if (value !== undefined) {
      memory.stack.splice(memory.stack.length - (-n - 1), 0, value);
    } else {
      throw new MachineError("Argument to ROLL cannot be zero.");
    }
  } else {
    throw new MachineError("Argument to ROLL cannot be zero.");
  }
};

export const pick = (cycle: Cycle): void => {
  // 1-indexed from the top, so PICK 1 behaves like DUPL (as in Pascal).
  // Currently unreachable from the compiler.
  const depth = cycle.operand();
  // peekValue counts from 0, PICK from 1
  memory.stack.push(memory.peekValue(depth - 1));
};
