import type { Timers } from "@/core/machine.ts";

const now = () => Date.now();

const scheduleCallback = (callback: () => void, delayMs: number): number => {
  // Deno's checker types setTimeout's return as NodeJS.Timeout, but in the
  // browser (this code's actual target, per build.ts) it's a plain number.
  return setTimeout(callback, delayMs) as unknown as number;
};

const cancelCallback = (handle: number) => {
  clearTimeout(handle);
};

export default {
  now,
  scheduleCallback,
  cancelCallback,
} satisfies Timers;
