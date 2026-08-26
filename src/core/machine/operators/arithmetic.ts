import type { Cycle } from "../types.ts";
import { MachineError } from "../error.ts";
import { MAXINT, MININT } from "../limits.ts";
import * as memory from "../memory.ts";
import { randomNumber } from "../random.ts";
import { state } from "../state.ts";

const checkOverflow = (result: number): number => {
  if (result > MAXINT || result < MININT) {
    throw new MachineError("Numerical overflow.");
  }
  return result;
};

/** the angle in radians that `a/b` turtle-angle units represents */
const radians = (a: number, b: number): number =>
  ((a / b) * (2 * Math.PI)) / memory.getTurtA();

/** turtle-angle units per radian, for the inverse trigonometric operators */
const perRadian = (): number => memory.getTurtA() / (2 * Math.PI);

// operators on stack value

export const incr = (): void => {
  memory.stack.push(memory.popValue() + 1);
};

export const decr = (): void => {
  memory.stack.push(memory.popValue() - 1);
};

export const neg = (): void => {
  memory.stack.push(-memory.popValue());
};

export const abs = (): void => {
  memory.stack.push(Math.abs(memory.popValue()));
};

export const sign = (): void => {
  memory.stack.push(Math.sign(memory.popValue()));
};

// random numbers

export const rand = (): void => {
  const limit = memory.popValue();
  memory.stack.push(Math.floor(randomNumber(state.seed++) * Math.abs(limit)));
};

export const seed = (cycle: Cycle): void => {
  const value = memory.popValue();
  if (value === 0) {
    // reseed from the clock, per the spec - not re-echo the old seed
    state.seed = cycle.timers.now();
    memory.stack.push(state.seed);
  } else {
    state.seed = value;
    memory.stack.push(value);
  }
};

// maximum integer

export const mxin = (): void => {
  memory.stack.push(MAXINT);
};

// true value

const trueOperator = (cycle: Cycle): void => {
  state.trueValue = cycle.operand();
};

export { trueOperator as true };

// Boolean (bitwise) operators

/**
 * The pcode reference describes SHFT as a 3-value rotate; only the 2-value
 * plain-shift subset Pascal's shl/shr need is implemented, with
 * Win_TurtleRun.pas's pcShft polarity (non-negative = left, negative = right by
 * the absolute value), which is what commands.ts assumes.
 */
export const shft = (): void => {
  const shift = memory.popValue();
  const value = memory.popValue();
  if (shift >= 0) {
    memory.stack.push(value << shift);
  } else {
    memory.stack.push(value >> -shift);
  }
};

export const not = (): void => {
  memory.stack.push(~memory.popValue());
};

export const and = (): void => {
  const right = memory.popValue();
  const left = memory.popValue();
  memory.stack.push(left & right);
};

export const or = (): void => {
  const right = memory.popValue();
  const left = memory.popValue();
  memory.stack.push(left | right);
};

export const xor = (): void => {
  const right = memory.popValue();
  const left = memory.popValue();
  memory.stack.push(left ^ right);
};

// lazy Boolean operators

export const andl = (): void => {
  const right = memory.popValue();
  const left = memory.popValue();
  memory.stack.push(left && right);
};

export const orl = (): void => {
  const right = memory.popValue();
  const left = memory.popValue();
  memory.stack.push(left || right);
};

// binary integer operators

export const plus = (): void => {
  const right = memory.popValue();
  const left = memory.popValue();
  memory.stack.push(checkOverflow(left + right));
};

export const subt = (): void => {
  const right = memory.popValue();
  const left = memory.popValue();
  memory.stack.push(checkOverflow(left - right));
};

export const mult = (): void => {
  const right = memory.popValue();
  const left = memory.popValue();
  memory.stack.push(checkOverflow(left * right));
};

export const divr = (): void => {
  const divisor = memory.popValue();
  const dividend = memory.popValue();
  if (divisor === 0) {
    throw new MachineError("Cannot divide by zero.");
  }
  memory.stack.push(Math.round(dividend / divisor));
};

export const div = (): void => {
  const divisor = memory.popValue();
  const dividend = memory.popValue();
  if (divisor === 0) {
    throw new MachineError("Cannot divide by zero.");
  }
  const quotient = dividend / divisor;
  memory.stack.push(quotient > 0 ? Math.floor(quotient) : Math.ceil(quotient));
};

export const mod = (): void => {
  const divisor = memory.popValue();
  const dividend = memory.popValue();
  memory.stack.push(dividend % divisor);
};

// floored integer division

export const divf = (): void => {
  const divisor = memory.popValue();
  const dividend = memory.popValue();
  if (divisor === 0) {
    throw new MachineError("Cannot divide by zero.");
  }
  memory.stack.push(Math.floor(dividend / divisor));
};

export const modf = (): void => {
  const divisor = memory.popValue();
  const dividend = memory.popValue();
  memory.stack.push(dividend - Math.floor(dividend / divisor) * divisor);
};

// pseudo-real number operators

export const divm = (): void => {
  const mult = memory.popValue();
  const divisor = memory.popValue();
  const dividend = memory.popValue();
  memory.stack.push(Math.round((dividend / divisor) * mult));
};

/** linear interpolation: a+(b-a)*t/scale, rounded (Win_TurtleRun.pas's pcLerp) */
export const lerp = (): void => {
  const scale = memory.popValue();
  const t = memory.popValue();
  const b = memory.popValue();
  const a = memory.popValue();
  memory.stack.push(Math.round(a + ((b - a) * t) / scale));
};

export const hyp = (): void => {
  const mult = memory.popValue();
  const b = memory.popValue();
  const a = memory.popValue();
  memory.stack.push(Math.round(Math.sqrt(a * a + b * b) * mult));
};

/**
 * a^(1/b)*mult, rounded (Win_TurtleRun.pas's pcRoot); SQR compiles to this with
 * a constant 2 for b
 */
export const root = (): void => {
  const mult = memory.popValue();
  const b = memory.popValue();
  const a = memory.popValue();
  memory.stack.push(Math.round(Math.pow(a, 1 / b) * mult));
};

/** (a/b)^(c/d)*mult, rounded (Win_TurtleRun.pas's pcPowr) */
export const powr = (): void => {
  const mult = memory.popValue();
  const d = memory.popValue();
  const c = memory.popValue();
  const b = memory.popValue();
  const a = memory.popValue();
  memory.stack.push(Math.round(Math.pow(a / b, c / d) * mult));
};

export const log = (): void => {
  const mult = memory.popValue();
  const b = memory.popValue();
  const a = memory.popValue();
  memory.stack.push(Math.round((Math.log(a / b) / Math.LN10) * mult));
};

export const alog = (): void => {
  const mult = memory.popValue();
  const b = memory.popValue();
  const a = memory.popValue();
  memory.stack.push(Math.round(Math.pow(10, a / b) * mult));
};

export const ln = (): void => {
  const mult = memory.popValue();
  const b = memory.popValue();
  const a = memory.popValue();
  memory.stack.push(Math.round(Math.log(a / b) * mult));
};

export const exp = (): void => {
  const mult = memory.popValue();
  const b = memory.popValue();
  const a = memory.popValue();
  memory.stack.push(Math.round(Math.exp(a / b) * mult));
};

export const sin = (): void => {
  const mult = memory.popValue();
  const b = memory.popValue();
  const a = memory.popValue();
  memory.stack.push(Math.round(Math.sin(radians(a, b)) * mult));
};

export const cos = (): void => {
  const mult = memory.popValue();
  const b = memory.popValue();
  const a = memory.popValue();
  memory.stack.push(Math.round(Math.cos(radians(a, b)) * mult));
};

export const tan = (): void => {
  const mult = memory.popValue();
  const b = memory.popValue();
  const a = memory.popValue();
  memory.stack.push(Math.round(Math.tan(radians(a, b)) * mult));
};

export const asin = (): void => {
  const mult = memory.popValue();
  const b = memory.popValue();
  const a = memory.popValue();
  memory.stack.push(Math.round(Math.asin(a / b) * mult * perRadian()));
};

export const acos = (): void => {
  const mult = memory.popValue();
  const b = memory.popValue();
  const a = memory.popValue();
  memory.stack.push(Math.round(Math.acos(a / b) * mult * perRadian()));
};

export const atan = (): void => {
  const mult = memory.popValue();
  const b = memory.popValue();
  const a = memory.popValue();
  memory.stack.push(Math.round(Math.atan2(a, b) * mult * perRadian()));
};

export const pi = (): void => {
  memory.stack.push(Math.round(Math.PI * memory.popValue()));
};
