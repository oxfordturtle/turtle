import { PCode } from "@/core/constants.ts";
import type { LoopContext } from "../loopContext.ts";

/**
 * The target is a placeholder until the enclosing loop back-patches it - see
 * loopContext.ts. The parser's loopDepth check means loopContext is never null
 * in practice.
 */
export default (loopContext: LoopContext): number[][] => {
  const line = [PCode.jump, 0];
  loopContext.breaks.push(line);
  return [line];
};
