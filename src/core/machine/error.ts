import { state } from "./state.ts";

/**
 * A runtime error in the *student's* program, as distinct from an internal
 * fault in the machine itself. Mirrors `compiler/tools/error.ts`'s
 * `CompilerError`, and is exported from `core/machine.ts` so that an adapter
 * can tell the two apart. `runtime.ts`'s `reportableError` is what does tell
 * them apart: anything caught that is *not* one of these is wrapped in one
 * saying so, rather than reaching the student verbatim (TODO.md §1.7).
 *
 * `line` and `code` record where the program counter was. They are read from
 * the shared runtime state in the constructor rather than passed in at each of
 * the throw sites, which is the only way ~30 scattered `throw new
 * MachineError(...)` calls can carry a position without every one of them
 * repeating it.
 *
 * Nothing puts them in a message yet, deliberately: `errors.test.ts` asserts
 * exact strings and the example snapshots record runtime errors verbatim, so
 * changing the text is a separate, gated change - as TODO.md §1.3 and §1.5
 * were, each updating its test in the same commit as its message.
 */
export class MachineError extends Error {
  /** the pcode line the machine was executing when this was thrown */
  readonly line: number;

  /** the index of the instruction within that line */
  readonly code: number;

  constructor(message: string) {
    super(message);
    this.line = state.line;
    this.code = state.code;
  }
}
