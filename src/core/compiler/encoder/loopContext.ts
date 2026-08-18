/**
 * "break"/"continue" back-patching. A loop encoder doesn't know its exit and
 * re-test line numbers until its whole body is encoded, so break/continue emit
 * a placeholder `[PCode.jump, 0]` and register it here for the enclosing loop
 * to overwrite in place.
 *
 * Each loop makes its own context and threads it down to its substatements, so
 * a nested loop's break/continue can never patch the outer loop.
 */

export interface LoopContext {
  readonly breaks: number[][];
  readonly continues: number[][];
}

export const makeLoopContext = (): LoopContext => ({
  breaks: [],
  continues: [],
});

export const patchBreaks = (
  loopContext: LoopContext,
  targetLine: number,
): void => {
  for (const line of loopContext.breaks) {
    line[1] = targetLine;
  }
};

export const patchContinues = (
  loopContext: LoopContext,
  targetLine: number,
): void => {
  for (const line of loopContext.continues) {
    line[1] = targetLine;
  }
};
