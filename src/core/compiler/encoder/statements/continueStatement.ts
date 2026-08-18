import { PCode } from "@/core/constants.ts";
import type { LoopContext } from "../loopContext.ts";

/** As breakStatement.ts, but registered against the loop's re-test line. */
export default (loopContext: LoopContext): number[][] => {
  const line = [PCode.jump, 0];
  loopContext.continues.push(line);
  return [line];
};
