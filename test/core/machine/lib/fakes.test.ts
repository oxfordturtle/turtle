import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { fakeCanvas, fakeFiles } from "./fakes.ts";

/**
 * Coverage for `fakeFiles()` itself, not for any `src/core` code: a standalone
 * sanity check of the fake's own behaviour, so files.test.ts can build on it
 * rather than debugging the fake and the real PCode handlers at
 * the same time.
 */
describe("machine/lib/fakes: fakeFiles()", () => {
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
    assert(
      files.calls.some(
        (c) => c.method === "openFile" && c.args[0] === "existing.txt",
      ),
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
    assertFalse(await files.atEnd(readHandle));
    assertEquals(await files.readLine(readHandle), "first");
    assertFalse(await files.atLineEnd(readHandle));
    assertEquals(await files.readLine(readHandle), "second");
    assertEquals(await files.readChars(readHandle, 100), "third");
    assert(await files.atEnd(readHandle));
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
    assertFalse(await files.changeDirectory("sub"));
    files.seedDirectory("sub");
    assert(await files.changeDirectory("sub"));
    assertEquals(files.currentDirectory(), "sub");
    // a file created while cwd is "sub" lives at "sub/inner.txt"
    await files.testFile("inner.txt", "create");
    assert(await files.changeDirectory(""));
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

    assertFalse(await files.renameFile("source.txt", "taken.txt"));
    assert(await files.copyFile("source.txt", "copy.txt"));
    assertEquals(await files.testFile("source.txt", "enquire"), {
      existedBefore: true,
      existedAfter: true,
    });
    assertEquals(await files.testFile("copy.txt", "enquire"), {
      existedBefore: true,
      existedAfter: true,
    });

    assert(await files.moveFile("source.txt", "moved.txt"));
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

/**
 * Coverage for `fakeCanvas()`'s two non-obvious behaviours - the call sink the
 * snapshot suite runs on, and the packed pixel key - for the same reason as
 * above: so a machine test that reads back a pixel is debugging the machine,
 * not the fake.
 */
describe("machine/lib/fakes: fakeCanvas()", () => {
  it("records into .calls by default, and into a sink instead when given one", () => {
    const plain = fakeCanvas();
    plain.setCursor(1);
    plain.writePixel(3, 4, 0x00ff00, false);
    assertEquals(plain.calls, [
      { method: "setCursor", args: [1] },
      { method: "writePixel", args: [3, 4, 0x00ff00, false] },
    ]);

    const sunk: string[] = [];
    const sinking = fakeCanvas((method, args) => {
      sunk.push(`${method}(${JSON.stringify(args)})`);
    });
    sinking.setCursor(1);
    sinking.writePixel(3, 4, 0x00ff00, false);
    assertEquals(sunk, ["setCursor([1])", "writePixel([3,4,65280,false])"]);
    assertEquals(sinking.calls, []);
  });

  it("round-trips pixels by coordinate, including outside the packed-key range", () => {
    const canvas = fakeCanvas();
    canvas.clear("#FFFFFF");

    // neighbouring coordinates must not share a key: (x, y) and (x - 1, y +
    // 65536) would collide under a naive `x * 65536 + y`
    canvas.writePixel(1, 0, 0x111111, false);
    canvas.writePixel(0, 1, 0x222222, false);
    assertEquals(canvas.readPixel(1, 0), 0x111111);
    assertEquals(canvas.readPixel(0, 1), 0x222222);

    // negative and beyond +-32768, where the packed key gives way to a string
    canvas.writePixel(-5, -7, 0x333333, false);
    canvas.writePixel(40000, -40000, 0x444444, false);
    assertEquals(canvas.readPixel(-5, -7), 0x333333);
    assertEquals(canvas.readPixel(40000, -40000), 0x444444);

    // an unwritten pixel reads back as whatever clear() last set
    assertEquals(canvas.readPixel(9, 9), 0xffffff);
    assertEquals(canvas.pixelAt(1, 0), 0x111111);

    canvas.clear("#000000");
    assertEquals(canvas.readPixel(1, 0), 0x000000);
  });
});
