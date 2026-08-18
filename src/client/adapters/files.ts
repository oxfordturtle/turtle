import type { FileSystem } from "@/core/machine.ts";

// No real FileSystem adapter yet - the intended backing is OPFS. Until then
// every file and directory opcode fails as if the sandboxed filesystem were
// always empty. The only outbound port with nothing real behind it.
export default {
  testFile: () =>
    Promise.resolve({ existedBefore: false, existedAfter: false }),
  testDirectory: () =>
    Promise.resolve({ existedBefore: false, existedAfter: false }),
  changeDirectory: () => Promise.resolve(false),
  openFile: () => Promise.resolve(0),
  close: () => Promise.resolve(),
  restart: () => Promise.resolve(),
  atEnd: () => Promise.resolve(true),
  atLineEnd: () => Promise.resolve(true),
  readChars: () => Promise.resolve(""),
  readLine: () => Promise.resolve(""),
  writeChars: () => Promise.resolve(),
  writeLine: () => Promise.resolve(),
  findFirstFile: () => Promise.resolve([0, ""] as [number, string]),
  findFirstDirectory: () => Promise.resolve([0, ""] as [number, string]),
  findNext: () => Promise.resolve(""),
  renameFile: () => Promise.resolve(false),
  moveFile: () => Promise.resolve(false),
  copyFile: () => Promise.resolve(false),
} satisfies FileSystem;
