import type { Language } from "@/core/constants.ts";
import {
  defaultCompilerOptions,
  encode,
  type EncoderOptions,
  lexify,
  parse,
  tokenize,
} from "@/core/compiler.ts";

/**
 * Compiles source all the way through to pcode. `encode()` (and the
 * `expression()`/`statement()` functions it delegates to internally) is not
 * part of `@/core/compiler.ts`'s public surface beyond this single
 * entry point, so every encoder test - however deep the branch it's
 * targeting - has to reach it by constructing a real program and reading
 * the shape of the resulting `number[][]`, not by importing encoder internals
 * directly - see test/README.md's barrel-only rule.
 */
export const compileAndEncode = (
  language: Language,
  code: string,
  options: EncoderOptions = defaultCompilerOptions,
): number[][] => {
  const tokens = tokenize(code, language);
  const lexemes = lexify(tokens, language);
  const program = parse(lexemes, language);
  return encode(program, options);
};

/** Flattens a pcode program into one long list of numbers, for searching. */
export const flatten = (pcode: number[][]): number[] => pcode.flat();

/** Counts how many times a given opcode (or literal number) appears anywhere in the pcode. */
export const countOf = (pcode: number[][], value: number): number =>
  flatten(pcode).filter((x) => x === value).length;

/** True if a given opcode (or literal number) appears anywhere in the pcode. */
export const includesCode = (pcode: number[][], value: number): boolean =>
  flatten(pcode).includes(value);
