import type { Cycle } from "../types.ts";
import { hex } from "../colour.ts";
import { MachineError } from "../error.ts";
import * as keybuffer from "../keybuffer.ts";
import { MAXINT } from "../limits.ts";
import * as memory from "../memory.ts";
import { advancePastCurrentInstruction, execute } from "../runtime.ts";
import { state, vcanvas } from "../state.ts";
import { turtle } from "../vcanvas.ts";

// STAT/ICLR/TDET's inputcode operand. Negative codes index memory.query (see
// constants/inputs.ts, where -11 is the most negative); 1..255 index
// memory.keys, and 0 is the keybuffer. ICLR alone treats 256 as "clear
// everything".
const QUERY_CODE_MIN = -11;
const KEY_CODE_COUNT = 256;

// debugging and tracing
// TRAC and MEMW pop without checking: they are not implemented, and a silent
// no-op on a short stack is what the original system does

export const trac = (): void => {
  memory.stack.pop(); // not implemented
};

export const memw = (): void => {
  memory.stack.pop(); // not implemented
};

export const dump = (cycle: Cycle): void => {
  cycle.output.updateMemoryDisplay(memory.dump());
  if (cycle.options.showMemoryOnDump) {
    cycle.output.selectTab("memory");
  }
};

export const pcoh = (): void => {
  state.pcodeHalt = memory.popValue();
};

export const poke = (): void => {
  const value = memory.popValue();
  const address = memory.popValue();
  memory.main[address] = value;
};

// input

export const stat = (): void => {
  const inputcode = memory.popValue();
  if (QUERY_CODE_MIN <= inputcode && inputcode < 0) {
    memory.stack.push(memory.readQuery(-inputcode));
  } else if (0 < inputcode && inputcode < KEY_CODE_COUNT) {
    memory.stack.push(memory.readKey(inputcode));
  } else {
    memory.stack.push(0);
  }
};

export const iclr = (): void => {
  const inputcode = memory.popValue();
  if (QUERY_CODE_MIN <= inputcode && inputcode < 0) {
    memory.query[-inputcode] = -1;
  } else if (inputcode === 0) {
    keybuffer.resetPointers();
  } else if (0 < inputcode && inputcode < KEY_CODE_COUNT) {
    memory.keys[inputcode] = -1;
  } else if (inputcode === KEY_CODE_COUNT) {
    memory.keys.fill(-1);
    memory.query.fill(-1);
  }
};

export const bufr = (): void => {
  memory.stack.push(keybuffer.allocate(memory.popValue()));
};

export const read = (): void => {
  // 0 means "everything currently buffered", and - unlike a bounded read -
  // leaves the read pointer where it was
  const max = memory.popValue();
  memory.makeHeapString(max === 0 ? keybuffer.peekAll() : keybuffer.read(max));
};

export const rdln = (cycle: Cycle): void => {
  advancePastCurrentInstruction();
  // as long as possible
  state.readlineTimeoutID = cycle.timers.scheduleCallback(execute, MAXINT);
  cycle.suspend();
};

export const tdet = (cycle: Cycle): void => {
  const timeout = memory.popValue();
  const inputcode = memory.popValue();
  if (QUERY_CODE_MIN <= inputcode && inputcode < KEY_CODE_COUNT) {
    memory.stack.push(0);
    advancePastCurrentInstruction();
    state.detectInputcode = inputcode;
    state.detectActive = true;
    // 0 means "as long as possible"
    state.detectTimeoutID = cycle.timers.scheduleCallback(
      execute,
      timeout === 0 ? MAXINT : timeout,
    );
  } else {
    throw new MachineError(
      `Detect called with invalid input state.code: ${inputcode}.`,
    );
  }
  cycle.suspend();
};

export const curs = (cycle: Cycle): void => {
  cycle.canvas.setCursor(memory.popValue());
};

// text output

export const kech = (): void => {
  state.keyecho = memory.popValue() !== 0;
};

export const outp = (cycle: Cycle): void => {
  const showOutput = memory.popValue() !== 0;
  const colour = memory.popValue();
  const visible = memory.popValue() !== 0;
  cycle.output.configureOutput(visible, hex(colour));
  cycle.output.selectTab(showOutput ? "output" : "canvas");
};

export const cons = (cycle: Cycle): void => {
  // a third arm that reads the stack without ever throwing on a short one,
  // alongside MIXC and TEST - TODO.md §1.1. Do not convert these pops to
  // popValue.
  const colour = memory.stack.pop();
  const visible = memory.stack.pop();
  if (visible !== undefined && colour !== undefined) {
    cycle.output.configureConsole(visible !== 0, hex(colour));
  }
};

export const disp = (cycle: Cycle): void => {
  const size = memory.popValue();
  const font = memory.popValue();
  const string = memory.popString();
  cycle.canvas.drawText(turtle(vcanvas), string, font, size);
};

export const writ = (cycle: Cycle): void => {
  const string = memory.popString();
  cycle.output.writeToOutput(string);
  cycle.output.logToConsole(string);
  if (cycle.options.showOutputOnWrite) {
    cycle.output.selectTab("output");
  }
};

export const newl = (cycle: Cycle): void => {
  cycle.output.writeToOutput("\n");
  cycle.output.logToConsole("\n");
};

// timing

export const time = (cycle: Cycle): void => {
  memory.stack.push(cycle.timers.now() - state.startTime);
};

export const tset = (cycle: Cycle): void => {
  const now = cycle.timers.now();
  state.startTime = now - memory.popValue();
};

export const wait = (cycle: Cycle): void => {
  const delay = memory.popValue();
  advancePastCurrentInstruction();
  cycle.timers.scheduleCallback(execute, delay);
  cycle.suspend();
};
