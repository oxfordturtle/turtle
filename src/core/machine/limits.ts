import { MachineError } from "./error.ts";

// the machine's integers are 32-bit signed, matching the original system
export const MAXINT = 0x7fffffff;
export const MININT = -0x80000000;

// mirrors Pascal's initdefstringsize (SystemConstants.pas); STRINGSIZE isn't
// implemented here, so unlike the original there's no way to change it at
// runtime
export const DEFAULT_STRING_SIZE = 64;

// mirrors Pascal's maxreturnstack/maxsubregstack/maxmemstack (RunTypes.pas);
// checked before every push so recursion fails with a clean error rather than
// however an unbounded JS array eventually fails
export const MAX_CALL_STACK_DEPTH = 1000;

export const callStackOverflowError = (name: string): MachineError =>
  new MachineError(
    `${name} stack overflow. Probable cause is unterminated recursion.`,
  );
