import { assertNoWombleLogs } from "../../lib/setup.ts";
// type-only, so it is erased rather than evaluated - see ../../lib/setup.ts on
// why every value import in this layer is dynamic
import type { FileSystem, Timers } from "@/core/machine.ts";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { afterEach, describe, it } from "@std/testing/bdd";

// Typed as the ports themselves: each stub below is written as a
// zero-parameter arrow, so without this the calls would have to pretend the
// machine passes no arguments.
const timers: Timers = (await import("@/client/adapters/timers.ts")).default;
const files: FileSystem = (await import("@/client/adapters/files.ts")).default;

// The two thin ports. Neither has a component or an element behind it, so
// there is nothing to mount: `timers` is the browser clock the machine paces
// itself by, and `files` is the port with nothing real behind it at all.

// Rule 6: every test ends with Womble having reported nothing.
afterEach(assertNoWombleLogs);

describe("the timers port", () => {
  it("reads the wall clock", () => {
    const before = Date.now();
    const now = timers.now();
    assert(now >= before && now <= Date.now());
  });

  it("runs a scheduled callback", async () => {
    const run: string[] = [];
    timers.scheduleCallback(() => run.push("kept"), 0);
    await new Promise((resolve) => setTimeout(resolve, 1));
    assertEquals(run, ["kept"]);
  });

  // The handle is whatever `setTimeout` returned - a number in a browser, an
  // object under Deno, which is why the adapter casts it - so what matters is
  // that it goes back to `cancelCallback` and stops the callback.
  it("cancels one that hasn't run yet, through the handle it gave back", async () => {
    let ran = false;
    const handle = timers.scheduleCallback(() => {
      ran = true;
    }, 0);
    timers.cancelCallback(handle);
    await new Promise((resolve) => setTimeout(resolve, 1));
    assertFalse(ran);
  });
});

// No real filesystem adapter yet - the intended backing is OPFS (TODO.md
// 2.5). Until then every file and directory opcode has to answer as if the
// sandboxed filesystem were always empty, which is what these pin: a program
// using them runs to completion and reads nothing, rather than failing.
describe("the filesystem port, which is a stub", () => {
  it("reports every file and directory as absent, before and after", async () => {
    assertEquals(await files.testFile("x.txt", "enquire"), {
      existedBefore: false,
      existedAfter: false,
    });
    assertEquals(await files.testDirectory("x", "enquire"), {
      existedBefore: false,
      existedAfter: false,
    });
    assertFalse(await files.changeDirectory("x"));
  });

  it("opens nothing, and reads nothing from what it opened", async () => {
    assertEquals(await files.openFile("x.txt", "read"), 0);
    assertEquals(await files.close(1), undefined);
    assertEquals(await files.restart(1), undefined);
    assert(await files.atEnd(1));
    assert(await files.atLineEnd(1));
    assertEquals(await files.readChars(1, 10), "");
    assertEquals(await files.readLine(1), "");
    assertEquals(await files.writeChars(1, "text"), undefined);
    assertEquals(await files.writeLine(1, "text"), undefined);
  });

  it("finds nothing to iterate over, and moves nothing", async () => {
    assertEquals(await files.findFirstFile("*.txt", 0), [0, ""]);
    assertEquals(await files.findFirstDirectory("*", 0), [0, ""]);
    assertEquals(await files.findNext(1), "");
    assertFalse(await files.renameFile("a", "b"));
    assertFalse(await files.moveFile("a", "b"));
    assertFalse(await files.copyFile("a", "b"));
  });
});
