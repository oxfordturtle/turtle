import { MachineError } from "../error.ts";
import * as memory from "../memory.ts";

/**
 * SVAL/SVDF's coding operand: which prefix marks a hexadecimal literal. Hoisted
 * to module scope, where the array is allocated once rather than on every
 * instruction. An out-of-range coding falls back to "#", as it always has.
 */
const HEX_PREFIX_BY_CODING = ["#", "$", "&", "0x"];

const hexPrefixByCoding = (coding: number): string =>
  HEX_PREFIX_BY_CODING[coding] ?? "#";

/** NaN unless the *entire* string is consumed, matching Pascal's StrToInt - JS's parseInt would silently ignore trailing garbage */
const parseFullInt = (s: string, hexPrefix: string): number => {
  if (s.startsWith(hexPrefix)) {
    const digits = s.slice(hexPrefix.length);
    return /^[0-9a-fA-F]+$/.test(digits) ? parseInt(digits, 16) : NaN;
  }
  return /^[+-]?\d+$/.test(s) ? parseInt(s, 10) : NaN;
};

export const ctos = (): void => {
  memory.makeHeapString(String.fromCharCode(memory.popValue()));
};

export const sasc = (): void => {
  const string = memory.popString();
  memory.stack.push(string.length === 0 ? 0 : string.charCodeAt(0));
};

export const itos = (): void => {
  memory.makeHeapString(memory.popValue().toString(10));
};

export const hexs = (): void => {
  const width = memory.popValue();
  const value = memory.popValue();
  // unsigned first, so -1 is "FFFFFFFF" rather than "-1"
  let string = (value >>> 0).toString(16).toUpperCase();
  while (string.length < width) {
    string = "0" + string;
  }
  memory.makeHeapString(string);
};

export const sval = (): void => {
  const coding = memory.popValue();
  const string = memory.popString();
  const value = parseFullInt(string, hexPrefixByCoding(coding));
  if (isNaN(value)) {
    throw new MachineError(`Cannot parse ${string} to integer.`);
  } else {
    memory.stack.push(value);
  }
};

export const svdf = (): void => {
  const coding = memory.popValue();
  const fallback = memory.popValue();
  const string = memory.popString();
  const value = parseFullInt(string, hexPrefixByCoding(coding));
  memory.stack.push(isNaN(value) ? fallback : value);
};

export const qtos = (): void => {
  const decimalPlaces = memory.popValue();
  const divisor = memory.popValue();
  const dividend = memory.popValue();
  if (divisor === 0) {
    throw new MachineError("Cannot divide by zero.");
  }
  memory.makeHeapString((dividend / divisor).toFixed(decimalPlaces));
};

export const qval = (): void => {
  const fallback = memory.popValue();
  const multiplier = memory.popValue();
  const string = memory.popString();
  const value = parseFloat(string);
  memory.stack.push(isNaN(value) ? fallback : Math.round(value * multiplier));
};
