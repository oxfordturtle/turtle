import type { Routine } from "./routine.ts";

/**
 * The parser's own working state - what it needs while it runs, but which is
 * no part of the tree it produces.
 *
 * At present that means one thing: how many "while"/"for" loops the parser is
 * currently inside, which is how a "break" or "continue" outside any loop is
 * caught. (Where each routine's body lies in the lexeme stream is the parser's
 * other piece of scratch, and lives on the cursor - see `lexemes.ts`.)
 *
 * The count is kept per routine, and is the routine's own rather than its
 * calling context: a nested subroutine's "break" can never target a loop in an
 * enclosing routine - real Python scopes them the same way - so an enclosing
 * routine's depth must not leak into it.
 */
export interface ParserContext {
  /** parses `body` with this routine one loop deeper than it was */
  inLoop<T>(routine: Routine, body: () => T): T;

  /** whether the parser is inside a loop in this routine's own body */
  insideLoop(routine: Routine): boolean;
}

const makeContext = (): ParserContext => {
  const loopDepths = new Map<Routine, number>();

  return {
    inLoop(routine, body) {
      const depth = loopDepths.get(routine) ?? 0;
      loopDepths.set(routine, depth + 1);
      const result = body();
      loopDepths.set(routine, depth);
      return result;
    },

    insideLoop(routine) {
      return (loopDepths.get(routine) ?? 0) > 0;
    },
  };
};

export default makeContext;
