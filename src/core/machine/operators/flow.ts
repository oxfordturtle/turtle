import type { Cycle } from "../types.ts";
import { MachineError } from "../error.ts";
import { callStackOverflowError, MAX_CALL_STACK_DEPTH } from "../limits.ts";
import * as memory from "../memory.ts";
import { halt as haltMachine } from "../runtime.ts";
import { state } from "../state.ts";

/**
 * Jumps to `line`, counted from 0. `state.code` is set to -1 rather than 0
 * because execute()'s loop advances the program counter once more after every
 * instruction, including this one.
 *
 * JUMP/IFNO/SUBR's operand is a 1-indexed line number and so needs a -1 at the
 * call site; the values RETN and PLRJ jump to were pushed as 0-indexed lines
 * and do not.
 */
const jumpTo = (line: number): void => {
  state.line = line;
  state.code = -1;
};

// exception handling

const tryOperator = (cycle: Cycle): void => {
  const xcptLine = cycle.operand();
  if (xcptLine === 0 && memory.tryStack.length > 0) {
    memory.tryStack.pop();
  } else if (xcptLine > 0) {
    memory.tryStack.push([xcptLine, memory.stack.length]);
  }
};

export { tryOperator as try };

export const xcpt = (): void => {
  // nothing to do here, this is just an anchor for TRY to jump to
};

// flow control

export const jump = (cycle: Cycle): void => {
  jumpTo(cycle.operand() - 1);
};

export const ifno = (cycle: Cycle): void => {
  if (memory.popValue() === 0) {
    jumpTo(cycle.operand() - 1);
  } else {
    // the jump target is an operand either way, and has to be stepped over
    cycle.operand();
  }
};

/**
 * Stops the machine outright. Nothing suspends here: `execute()`'s loop sees
 * `state.running` go false and returns without rescheduling itself.
 */
export const halt = (): void => {
  haltMachine();
};

export const subr = (cycle: Cycle): void => {
  if (memory.returnStack.length >= MAX_CALL_STACK_DEPTH) {
    throw callStackOverflowError("Subroutine return");
  }
  if (memory.getHeapGlobal() === -1) {
    memory.setHeapGlobal(memory.getHeapPerm());
  }
  memory.returnStack.push(state.line + 1);
  jumpTo(cycle.operand() - 1);
};

export const retn = (): void => {
  const line = memory.returnStack.pop();
  if (line === undefined) {
    throw new MachineError("RETN called on empty return stack.");
  }
  jumpTo(line);
};

export const pssr = (cycle: Cycle): void => {
  if (memory.subroutineStack.length >= MAX_CALL_STACK_DEPTH) {
    throw callStackOverflowError("Subroutine register");
  }
  memory.subroutineStack.push(cycle.operand());
};

export const plsr = (): void => {
  memory.subroutineStack.pop();
};

export const psrj = (): void => {
  memory.stack.push(state.line + 1);
};

export const plrj = (): void => {
  memory.returnStack.pop();
  // the popped value already accounts for the "+1" psrj pushed (as subr/retn
  // do); subtracting again would jump back to the call site
  jumpTo(memory.popValue());
};
