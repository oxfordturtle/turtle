import { MachineError } from "../error.ts";
import * as memory from "../memory.ts";
import {
  advancePastCurrentInstruction,
  execute,
  suspendFor,
} from "../runtime.ts";
import { ports, state } from "../state.ts";
import type {
  Cycle,
  FileExistence,
  FileOpenMode,
  FileTestAction,
} from "../types.ts";

// PCode.open's mode operand. Hoisted to module scope: it used to be
// re-allocated on every OPEN instruction.
const modeByCode: Record<number, FileOpenMode> = {
  1: "read",
  2: "append",
  3: "write",
  4: "rewrite",
};

// PCode.fmov's action operand (Win_TurtleRun.pas's pcFMov)
const FILE_MOVE_RENAME = 1;
const FILE_MOVE_MOVE = 2;
const FILE_MOVE_COPY = 3;

/**
 * FILE/DIRY's notification levels. The original desktop system had a modal
 * message window for INFORM and WARN; mapping both onto console text is this
 * system's choice, not the spec's.
 *
 * There is no constant for the silent level, because it is not a level: the
 * field is two bits wide, and *anything* outside 1-3 falls through the switch
 * without notifying. 0 is simply the value the compiler emits for it.
 */
const NOTIFY_INFORM = 1;
const NOTIFY_WARN = 2;
const NOTIFY_STOP = 3;

/**
 * Rejects any ".." segment. The sandboxing check lives here rather than in the
 * FileSystem port or its adapters so that it holds whatever the backend is.
 */
const assertSafePath = (path: string): void => {
  if (path.split(/[/\\]/).some((segment) => segment === "..")) {
    throw new MachineError(`File paths cannot contain "..".`);
  }
};

const applyNotification = (tier: number, message: string): void => {
  switch (tier) {
    case NOTIFY_INFORM:
      ports.output.logToConsole(`${message}\n`);
      break;
    case NOTIFY_WARN:
      ports.output.logToConsole(`Warning: ${message}\n`);
      break;
    case NOTIFY_STOP:
      throw new MachineError(message);
    default:
      // silent: 0, and any other value the two-bit field can hold
      break;
  }
};

/**
 * Shared by PCode.file and PCode.diry, which decode the same `code` bitfield:
 * action in bits 0-1, notification levels in bits 2-3 (did not exist) and 4-5
 * (existed), before/after existence reported back in bits 6-7.
 */
const testPathAndNotify = (
  cycle: Cycle,
  path: string,
  code: number,
  test: (path: string, action: FileTestAction) => Promise<FileExistence>,
  kind: "file" | "directory",
): void => {
  // `code & 3` is 0..3, so the subscript cannot miss
  const action: FileTestAction = (
    ["enquire", "delete", "create", "recreate"] as const
  )[code & 3]!;
  const label = kind === "file" ? "File" : "Directory";
  advancePastCurrentInstruction();
  suspendFor(test(path, action), ({ existedBefore, existedAfter }) => {
    const tier = existedBefore ? (code & 48) >> 4 : (code & 12) >> 2;
    const message = existedBefore
      ? `${label} "${path}" already exists.`
      : `${label} "${path}" does not exist.`;
    applyNotification(tier, message);
    memory.stack.push(
      (code & 0b00111111) | (existedBefore ? 64 : 0) | (existedAfter ? 128 : 0),
    );
  });
  cycle.suspend();
};

// file processing - every FileSystem call suspends execute() via suspendFor
// rather than returning synchronously

export const chdr = (cycle: Cycle): void => {
  const path = memory.popString();
  assertSafePath(path);
  advancePastCurrentInstruction();
  // failure is a silent no-op: CHDR pushes nothing, and no commands.ts caller
  // inspects a result
  suspendFor(cycle.files.changeDirectory(path), () => {});
  cycle.suspend();
};

export const file = (cycle: Cycle): void => {
  const code = memory.popValue();
  const pointer = memory.popValue();
  const path = memory.getHeapString(pointer);
  assertSafePath(path);
  testPathAndNotify(
    cycle,
    path,
    code,
    (path, action) => cycle.files.testFile(path, action),
    "file",
  );
};

export const open = (cycle: Cycle): void => {
  const code = memory.popValue();
  const pointer = memory.popValue();
  const path = memory.getHeapString(pointer);
  assertSafePath(path);
  const mode = modeByCode[code];
  advancePastCurrentInstruction();
  if (mode === undefined) {
    // an out-of-range mode is user-program input (the generic openFile command
    // forwards one), so it fails like any other open failure
    memory.stack.push(0);
    execute();
  } else {
    suspendFor(cycle.files.openFile(path, mode), (handle) => {
      memory.stack.push(handle);
    });
  }
  cycle.suspend();
};

export const clos = (cycle: Cycle): void => {
  const handle = memory.popValue();
  advancePastCurrentInstruction();
  suspendFor(cycle.files.close(handle), () => {});
  cycle.suspend();
};

export const fbeg = (cycle: Cycle): void => {
  const handle = memory.popValue();
  advancePastCurrentInstruction();
  suspendFor(cycle.files.restart(handle), () => {});
  cycle.suspend();
};

export const eof = (cycle: Cycle): void => {
  const handle = memory.popValue();
  advancePastCurrentInstruction();
  suspendFor(cycle.files.atEnd(handle), (atEnd) => {
    memory.stack.push(atEnd ? state.trueValue : 0);
  });
  cycle.suspend();
};

export const eoln = (cycle: Cycle): void => {
  const handle = memory.popValue();
  advancePastCurrentInstruction();
  suspendFor(cycle.files.atLineEnd(handle), (atLineEnd) => {
    memory.stack.push(atLineEnd ? state.trueValue : 0);
  });
  cycle.suspend();
};

export const frds = (cycle: Cycle): void => {
  const max = memory.popValue();
  const handle = memory.popValue();
  advancePastCurrentInstruction();
  suspendFor(cycle.files.readChars(handle, max), (chars) => {
    memory.makeHeapString(chars);
  });
  cycle.suspend();
};

export const frln = (cycle: Cycle): void => {
  const handle = memory.popValue();
  advancePastCurrentInstruction();
  suspendFor(cycle.files.readLine(handle), (line) => {
    memory.makeHeapString(line);
  });
  cycle.suspend();
};

export const fwrs = (cycle: Cycle): void => {
  const pointer = memory.popValue();
  const handle = memory.popValue();
  const chars = memory.getHeapString(pointer);
  advancePastCurrentInstruction();
  suspendFor(cycle.files.writeChars(handle, chars), () => {});
  cycle.suspend();
};

export const fwln = (cycle: Cycle): void => {
  const pointer = memory.popValue();
  const handle = memory.popValue();
  const line = memory.getHeapString(pointer);
  advancePastCurrentInstruction();
  suspendFor(cycle.files.writeLine(handle, line), () => {});
  cycle.suspend();
};

// remaining file processing (directory/search/move)

export const diry = (cycle: Cycle): void => {
  const code = memory.popValue();
  const pointer = memory.popValue();
  const path = memory.getHeapString(pointer);
  assertSafePath(path);
  testPathAndNotify(
    cycle,
    path,
    code,
    (path, action) => cycle.files.testDirectory(path, action),
    "directory",
  );
};

export const ffnd = (cycle: Cycle): void => {
  const pointer = memory.popValue();
  const handle = memory.popValue();
  const pattern = memory.getHeapString(pointer);
  // a pattern may combine a directory path with a glob ("subdir\*.txt");
  // assertSafePath checks every separated segment, so the glob needs no
  // splitting out first
  assertSafePath(pattern);
  advancePastCurrentInstruction();
  suspendFor(cycle.files.findFirstFile(pattern, handle), ([handle, match]) => {
    memory.stack.push(handle);
    memory.makeHeapString(match);
  });
  cycle.suspend();
};

export const fdir = (cycle: Cycle): void => {
  const pointer = memory.popValue();
  const handle = memory.popValue();
  const pattern = memory.getHeapString(pointer);
  assertSafePath(pattern);
  advancePastCurrentInstruction();
  suspendFor(
    cycle.files.findFirstDirectory(pattern, handle),
    ([handle, match]) => {
      memory.stack.push(handle);
      memory.makeHeapString(match);
    },
  );
  cycle.suspend();
};

export const fnxt = (cycle: Cycle): void => {
  const handle = memory.popValue();
  advancePastCurrentInstruction();
  suspendFor(cycle.files.findNext(handle), (match) => {
    memory.makeHeapString(match);
  });
  cycle.suspend();
};

export const fmov = (cycle: Cycle): void => {
  const v = memory.popValue();
  const newPointer = memory.popValue();
  const oldPointer = memory.popValue();
  // resolved deepest-first, unlike the string operators above: FMOV's two
  // pointers are permanent-heap paths, not temporaries, so the order
  // getHeapString frees them in does not matter here
  const oldPath = memory.getHeapString(oldPointer);
  const newPath = memory.getHeapString(newPointer);
  // both paths are checked whatever v is, per the pcode reference's "which is
  // done in all cases"
  assertSafePath(oldPath);
  assertSafePath(newPath);
  advancePastCurrentInstruction();
  const pushResult = (ok: boolean) => {
    memory.stack.push(ok ? state.trueValue : 0);
  };
  switch (v) {
    case FILE_MOVE_RENAME:
      suspendFor(cycle.files.renameFile(oldPath, newPath), pushResult);
      break;
    case FILE_MOVE_MOVE:
      suspendFor(cycle.files.moveFile(oldPath, newPath), pushResult);
      break;
    case FILE_MOVE_COPY:
      suspendFor(cycle.files.copyFile(oldPath, newPath), pushResult);
      break;
    default:
      memory.stack.push(0);
      execute();
  }
  cycle.suspend();
};
