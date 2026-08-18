import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { fakeFiles } from "./_fakes.ts";

/**
 * Coverage for `fakeFiles()` itself, not for any `src/core` code: a standalone
 * sanity check of the fake's own behaviour, so files.test.ts can build on it
 * rather than debugging the fake and the real PCode handlers at
 * the same time.
 */
describe("machine/_fakes: fakeFiles()", () => {
  it("testFile reports existence before/after, and create/delete/recreate mutate the tree", async () => {
    const files = fakeFiles();
    assertEquals(await files.testFile("a.txt", "enquire"), {
      existedBefore: false,
      existedAfter: false,
    });
    assertEquals(await files.testFile("a.txt", "create"), {
      existedBefore: false,
      existedAfter: true,
    });
    assertEquals(await files.testFile("a.txt", "create"), {
      existedBefore: true,
      existedAfter: true,
    });
    assertEquals(await files.testFile("a.txt", "delete"), {
      existedBefore: true,
      existedAfter: false,
    });
    assertEquals(await files.testFile("a.txt", "recreate"), {
      existedBefore: false,
      existedAfter: true,
    });
  });

  it("openFile enforces read/append-must-exist and write-must-not-exist, and records calls", async () => {
    const files = fakeFiles();
    assertEquals(await files.openFile("missing.txt", "read"), 0);
    assertEquals(await files.openFile("missing.txt", "append"), 0);
    files.seed("existing.txt", "hello");
    assertEquals(await files.openFile("existing.txt", "write"), 0);
    const handle = await files.openFile("existing.txt", "read");
    assertEquals(handle, 1);
    assertEquals(
      files.calls.some(
        (c) => c.method === "openFile" && c.args[0] === "existing.txt",
      ),
      true,
    );
  });

  it("write then read round-trips file content, including line-based reads", async () => {
    const files = fakeFiles();
    const writeHandle = await files.openFile("data.txt", "write");
    await files.writeLine(writeHandle, "first");
    await files.writeLine(writeHandle, "second");
    await files.writeChars(writeHandle, "third");
    await files.close(writeHandle);

    const readHandle = await files.openFile("data.txt", "read");
    assertEquals(await files.atEnd(readHandle), false);
    assertEquals(await files.readLine(readHandle), "first");
    assertEquals(await files.atLineEnd(readHandle), false);
    assertEquals(await files.readLine(readHandle), "second");
    assertEquals(await files.readChars(readHandle, 100), "third");
    assertEquals(await files.atEnd(readHandle), true);
  });

  it("restart rewinds a read handle and truncates a write handle", async () => {
    const files = fakeFiles();
    const writeHandle = await files.openFile("data.txt", "write");
    await files.writeChars(writeHandle, "abc");
    await files.restart(writeHandle);
    assertEquals(await files.readChars(writeHandle, 100), "");
    await files.close(writeHandle);

    files.seed("other.txt", "xyz");
    const readHandle = await files.openFile("other.txt", "read");
    await files.readChars(readHandle, 2);
    await files.restart(readHandle);
    assertEquals(await files.readChars(readHandle, 100), "xyz");
  });

  it("append opens at the end of existing content", async () => {
    const files = fakeFiles();
    files.seed("log.txt", "line1\n");
    const handle = await files.openFile("log.txt", "append");
    await files.writeLine(handle, "line2");
    await files.close(handle);

    const readHandle = await files.openFile("log.txt", "read");
    assertEquals(await files.readLine(readHandle), "line1");
    assertEquals(await files.readLine(readHandle), "line2");
  });

  it("close(0) closes every open handle", async () => {
    const files = fakeFiles();
    const a = await files.openFile("a.txt", "write");
    const b = await files.openFile("b.txt", "write");
    await files.close(0);
    // both handles are gone, so writing through them is a silent no-op
    // rather than throwing (mirrors "read past a closed handle" being the
    // real PCode handler's problem to reject, not the port's)
    await files.writeChars(a, "x");
    await files.writeChars(b, "y");
    assertEquals(
      await files.openFile("a.txt", "read").then((h) => files.readChars(h, 10)),
      "",
    );
  });

  it("changeDirectory only succeeds into an existing directory, and '' returns to the base directory", async () => {
    const files = fakeFiles();
    assertEquals(await files.changeDirectory("sub"), false);
    files.seedDirectory("sub");
    assertEquals(await files.changeDirectory("sub"), true);
    assertEquals(files.currentDirectory(), "sub");
    // a file created while cwd is "sub" lives at "sub/inner.txt"
    await files.testFile("inner.txt", "create");
    assertEquals(await files.changeDirectory(""), true);
    assertEquals(files.currentDirectory(), "");
    assertEquals(await files.testFile("sub/inner.txt", "enquire"), {
      existedBefore: true,
      existedAfter: true,
    });
  });

  it("findFirstFile/findNext glob-match direct children of the current directory only, in sorted order", async () => {
    const files = fakeFiles();
    files.seed("a.txt", "");
    files.seed("b.txt", "");
    files.seed("c.csv", "");
    files.seedDirectory("sub");
    files.seed("sub/deep.txt", ""); // not a direct child of "" - excluded

    const [handle, first] = await files.findFirstFile("*.txt", 0);
    assertEquals(first, "a.txt");
    assertEquals(await files.findNext(handle), "b.txt");
    assertEquals(await files.findNext(handle), "");
  });

  it("findFirstDirectory only matches directory entries", async () => {
    const files = fakeFiles();
    files.seedDirectory("sub1");
    files.seedDirectory("sub2");
    files.seed("notadir.txt", "");

    const [, first] = await files.findFirstDirectory("sub*", 0);
    assertEquals(first, "sub1");
  });

  it("renameFile/moveFile/copyFile fail if the destination exists, else move or duplicate content", async () => {
    const files = fakeFiles();
    files.seed("source.txt", "content");
    files.seed("taken.txt", "");

    assertEquals(await files.renameFile("source.txt", "taken.txt"), false);
    assertEquals(await files.copyFile("source.txt", "copy.txt"), true);
    assertEquals(await files.testFile("source.txt", "enquire"), {
      existedBefore: true,
      existedAfter: true,
    });
    assertEquals(await files.testFile("copy.txt", "enquire"), {
      existedBefore: true,
      existedAfter: true,
    });

    assertEquals(await files.moveFile("source.txt", "moved.txt"), true);
    assertEquals(await files.testFile("source.txt", "enquire"), {
      existedBefore: false,
      existedAfter: false,
    });
    assertEquals(await files.testFile("moved.txt", "enquire"), {
      existedBefore: true,
      existedAfter: true,
    });
  });
});
