import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertMatch } from "@std/assert";
import { encode, lexify, parse, tokenize } from "@/core/compiler.ts";
import { isRunning } from "@/core/machine.ts";
import { type FakeFiles, fakeFiles } from "./lib/fakes.ts";
import {
  compileExample,
  PCode,
  readExample,
  runExampleBoundedAsync,
  runFilePcode,
  runFileToInt,
  runPcode,
  str,
} from "./lib/helpers.ts";

/**
 * Coverage for `src/core/machine/runtime.ts`'s file-processing PCodes:
 * the core file-lifecycle operators (`CHDR`, `FILE`, `OPEN`, `CLOS`, `FBEG`,
 * `EOF`, `EOLN`, `FRDS`, `FRLN`, `FWRS`, `FWLN`) and the directory/search/move
 * operators (`DIRY`, `FFND`, `FDIR`, `FNXT`, `FMOV`), all implemented against
 * `FileSystem`/`fakeFiles()`.
 *
 * Every test here uses `runFilePcode` (not `runPcode`) because every op under
 * test suspends `execute()` on a genuine `Promise` - see that helper's doc
 * comment in `lib/helpers.ts`.
 *
 * Stack push order in every hand-written program below is the *reverse*
 * of the reference doc's "top of stack first" listing (e.g. FILE's
 * `| code ^fname … |` means `code` is pushed *last*) - matching the
 * popping order in runtime.ts's own cases.
 */

/** Builds a FILE/DIRY `code` bitfield from its three sub-fields (each already a 0-3 tier). */
const fileCode = (
  action: number,
  notifyAbsent: number,
  notifyPresent: number,
): number => action | (notifyAbsent << 2) | (notifyPresent << 4);

/** Splits multi-line printed-integer output (ITOS/WRIT/NEWL per value) back into numbers. */
const ints = (output: string): number[] =>
  output
    .trim()
    .split("\n")
    .filter((s) => s !== "")
    .map(Number);

const printInt: number[][] = [[PCode.itos], [PCode.writ], [PCode.newl]];

describe("machine/runtime: file processing (core operators)", () => {
  describe("FILE", () => {
    it("enquire (action 0) reports existence without mutating the filesystem", async () => {
      const files = fakeFiles();
      files.seed("exists.txt", "");
      const result = await runFilePcode(
        [
          str("exists.txt"),
          [PCode.ldin, fileCode(0, 0, 0)],
          [PCode.file],
          ...printInt,
          str("missing.txt"),
          [PCode.ldin, fileCode(0, 0, 0)],
          [PCode.file],
          ...printInt,
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(ints(result.output.outputText), [64 | 128, 0]);
    });

    it("delete/create/recreate mutate the tree, echoing the low 6 bits and setting bits 6/7 from actual before/after state", async () => {
      const files = fakeFiles();
      const op = (action: number): number[][] => [
        str("f.txt"),
        [PCode.ldin, fileCode(action, 0, 0)],
        [PCode.file],
        ...printInt,
      ];
      const result = await runFilePcode(
        [
          ...op(2), // create on missing -> existedBefore=false, after=true
          ...op(2), // create again (already exists) -> no-op, both true
          ...op(1), // delete -> existedBefore=true, after=false
          ...op(1), // delete again (already gone) -> no-op, both false
          ...op(3), // recreate on missing -> always creates, both... before=false, after=true
          ...op(3), // recreate on existing -> before=true, after=true
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(ints(result.output.outputText), [
        2 | 128,
        2 | 64 | 128,
        1 | 64,
        1,
        3 | 128,
        3 | 64 | 128,
      ]);
    });

    // NB: these check `consoleText`, not `outputText` - and deliberately
    // don't also print the returned code (WRIT/NEWL write to *both*
    // outputText and consoleText, which would make consoleText assertions
    // below depend on the printed digits too; "delete/create/recreate" and
    // "enquire" above already cover the returned code).

    it("silent notification level (tier 0) produces no console output", async () => {
      const result = await runFilePcode([
        str("missing.txt"),
        [PCode.ldin, fileCode(0, 0, 0)],
        [PCode.file],
        [PCode.halt],
      ]);
      assertEquals(result.output.consoleText, "");
    });

    it("inform notification level (tier 1) logs a plain console message", async () => {
      const result = await runFilePcode([
        str("missing.txt"),
        [PCode.ldin, fileCode(0, 1, 0)],
        [PCode.file],
        [PCode.halt],
      ]);
      assertEquals(
        result.output.consoleText,
        'File "missing.txt" does not exist.\n',
      );
    });

    it("warn notification level (tier 2) logs a distinctly-flagged console message", async () => {
      const result = await runFilePcode([
        str("missing.txt"),
        [PCode.ldin, fileCode(0, 2, 0)],
        [PCode.file],
        [PCode.halt],
      ]);
      assertEquals(
        result.output.consoleText,
        'Warning: File "missing.txt" does not exist.\n',
      );
    });

    it("stop-with-error notification level (tier 3) halts with a MachineError", async () => {
      const result = await runFilePcode([
        str("missing.txt"),
        [PCode.ldin, fileCode(0, 3, 0)],
        [PCode.file],
        [PCode.halt],
      ]);
      assertEquals(result.output.runtimeErrors.length, 1);
      assertMatch(result.output.runtimeErrors[0].message, /does not exist/);
      assertFalse(isRunning());
    });

    it("the notifyPresent tier applies when the target already existed", async () => {
      const files = fakeFiles();
      files.seed("exists.txt", "");
      const result = await runFilePcode(
        [
          str("exists.txt"),
          [PCode.ldin, fileCode(0, 0, 1)],
          [PCode.file],
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(
        result.output.consoleText,
        'File "exists.txt" already exists.\n',
      );
    });

    it("rejects a path containing a '..' segment", async () => {
      const result = await runFilePcode([
        str("../secret.txt"),
        [PCode.ldin, fileCode(0, 0, 0)],
        [PCode.file],
        [PCode.halt],
      ]);
      assertEquals(result.output.runtimeErrors.length, 1);
      assertMatch(result.output.runtimeErrors[0].message, /cannot contain/i);
      assertFalse(isRunning());
    });
  });

  describe("CHDR", () => {
    it("changes the current directory when the target exists", async () => {
      const files = fakeFiles();
      files.seedDirectory("sub");
      const result = await runFilePcode(
        [str("sub"), [PCode.chdr], [PCode.halt]],
        {},
        files,
      );
      assertEquals(result.files.currentDirectory(), "sub");
    });

    it("is a silent no-op when the target doesn't exist", async () => {
      const files = fakeFiles();
      const result = await runFilePcode(
        [str("nosuch"), [PCode.chdr], [PCode.halt]],
        {},
        files,
      );
      assertEquals(result.files.currentDirectory(), "");
      assertEquals(result.output.runtimeErrors, []);
    });

    it("rejects a path containing a '..' segment", async () => {
      const result = await runFilePcode([
        str("../elsewhere"),
        [PCode.chdr],
        [PCode.halt],
      ]);
      assertEquals(result.output.runtimeErrors.length, 1);
      assertMatch(result.output.runtimeErrors[0].message, /cannot contain/i);
    });
  });

  describe("OPEN", () => {
    it("read/append fail when the file doesn't exist; write fails when it already does; rewrite always succeeds", async () => {
      const files = fakeFiles();
      files.seed("exists.txt", "");
      const result = await runFilePcode(
        [
          str("missing.txt"),
          [PCode.ldin, 1], // read
          [PCode.open],
          ...printInt,
          str("missing.txt"),
          [PCode.ldin, 2], // append
          [PCode.open],
          ...printInt,
          str("exists.txt"),
          [PCode.ldin, 3], // write
          [PCode.open],
          ...printInt,
          str("missing2.txt"),
          [PCode.ldin, 3], // write - succeeds, doesn't exist yet
          [PCode.open],
          ...printInt,
          str("exists.txt"),
          [PCode.ldin, 4], // rewrite - always succeeds
          [PCode.open],
          ...printInt,
          [PCode.halt],
        ],
        {},
        files,
      );
      const [
        readMissing,
        appendMissing,
        writeExisting,
        writeMissing,
        rewriteExisting,
      ] = ints(result.output.outputText);
      assertEquals(readMissing, 0);
      assertEquals(appendMissing, 0);
      assertEquals(writeExisting, 0);
      assert(writeMissing > 0);
      assert(rewriteExisting > 0);
    });

    it("fails softly (returns 0) for an out-of-range mode code, rather than throwing", async () => {
      // every commands.ts caller passes a literal 1-4, but the generic
      // openFile command forwards a user-supplied integer parameter, which
      // could in principle be out of range at runtime - see this step's
      // plan doc's OPEN section
      const result = await runFileToInt(
        str("f.txt"),
        [PCode.ldin, 99],
        [PCode.open],
      );
      assertEquals(result, 0);
    });

    it("exhausts the 10-handle limit, returning 0 for an 11th open file", async () => {
      const openLines: number[][] = [];
      for (let i = 0; i < 10; i += 1) {
        openLines.push(
          str(`f${i}.txt`),
          [PCode.ldin, 3],
          [PCode.open],
          [PCode.drop],
        );
      }
      const result = await runFileToInt(
        ...openLines,
        str("f10.txt"),
        [PCode.ldin, 3],
        [PCode.open],
      );
      assertEquals(result, 0);
    });

    it("rejects a path containing a '..' segment", async () => {
      const result = await runFilePcode([
        str("a/../../escape.txt"),
        [PCode.ldin, 3],
        [PCode.open],
        [PCode.halt],
      ]);
      assertEquals(result.output.runtimeErrors.length, 1);
      assertMatch(result.output.runtimeErrors[0].message, /cannot contain/i);
    });
  });

  describe("CLOS", () => {
    it("closes a specific handle - a subsequent EOF on it is trivially true (no such handle)", async () => {
      const result = await runFileToInt(
        str("f.txt"),
        [PCode.ldin, 3],
        [PCode.open], // handle 1
        [PCode.clos], // net -1: pops the handle, nothing pushed
        [PCode.ldin, 1],
        [PCode.eof],
      );
      assertEquals(result, 1); // state.trueValue default
    });

    it("handle 0 closes every open handle", async () => {
      const result = await runFilePcode([
        str("a.txt"),
        [PCode.ldin, 3],
        [PCode.open],
        [PCode.drop], // handle 1
        str("b.txt"),
        [PCode.ldin, 3],
        [PCode.open],
        [PCode.drop], // handle 2
        [PCode.ldin, 0],
        [PCode.clos],
        [PCode.ldin, 1],
        [PCode.eof],
        ...printInt,
        [PCode.ldin, 2],
        [PCode.eof],
        ...printInt,
        [PCode.halt],
      ]);
      assertEquals(ints(result.output.outputText), [1, 1]);
    });
  });

  describe("FBEG", () => {
    it("truncates a write-mode handle back to empty", async () => {
      const files = fakeFiles();
      await runFilePcode(
        [
          str("f.txt"),
          [PCode.ldin, 3],
          [PCode.open], // handle 1
          [PCode.ldin, 1],
          str("abc"),
          [PCode.fwrs],
          [PCode.ldin, 1],
          [PCode.fbeg],
          [PCode.ldin, 1],
          [PCode.clos],
          [PCode.halt],
        ],
        {},
        files,
      );
      const result = await runFilePcode(
        [
          str("f.txt"),
          [PCode.ldin, 1], // read - reuses the same seeded/mutated files fake
          [PCode.open],
          [PCode.ldin, 100],
          [PCode.frds],
          [PCode.writ],
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(result.output.outputText, "");
    });

    it("rewinds a read-mode handle back to the start", async () => {
      const files = fakeFiles();
      files.seed("f.txt", "hello");
      const result = await runFilePcode(
        [
          str("f.txt"),
          [PCode.ldin, 1],
          [PCode.open], // handle 1
          [PCode.ldin, 1],
          [PCode.ldin, 2],
          [PCode.frds], // consumes "he"
          [PCode.drop],
          [PCode.ldin, 1],
          [PCode.fbeg], // rewind
          [PCode.ldin, 1],
          [PCode.ldin, 10],
          [PCode.frds],
          [PCode.writ],
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(result.output.outputText, "hello");
    });
  });

  describe("EOF / EOLN", () => {
    it("EOF is false mid-file and true once the read position reaches the end", async () => {
      const files = fakeFiles();
      files.seed("f.txt", "ab");
      const result = await runFilePcode(
        [
          str("f.txt"),
          [PCode.ldin, 1],
          [PCode.open], // handle 1
          [PCode.ldin, 1],
          [PCode.eof],
          ...printInt,
          [PCode.ldin, 1],
          [PCode.ldin, 2],
          [PCode.frds],
          [PCode.drop],
          [PCode.ldin, 1],
          [PCode.eof],
          ...printInt,
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(ints(result.output.outputText), [0, 1]);
    });

    it("EOF and EOLN are trivially true for a write-mode handle", async () => {
      const result = await runFilePcode([
        str("f.txt"),
        [PCode.ldin, 3],
        [PCode.open],
        [PCode.ldin, 1],
        [PCode.eof],
        ...printInt,
        [PCode.ldin, 1],
        [PCode.eoln],
        ...printInt,
        [PCode.halt],
      ]);
      assertEquals(ints(result.output.outputText), [1, 1]);
    });

    it("EOLN is true at a line terminator, false elsewhere", async () => {
      const files = fakeFiles();
      files.seed("f.txt", "ab\ncd");
      const result = await runFilePcode(
        [
          str("f.txt"),
          [PCode.ldin, 1],
          [PCode.open], // handle 1
          [PCode.ldin, 1],
          [PCode.eoln], // at position 0 ('a') - false
          ...printInt,
          [PCode.ldin, 1],
          [PCode.ldin, 2],
          [PCode.frds], // consumes "ab", now at the '\n'
          [PCode.drop],
          [PCode.ldin, 1],
          [PCode.eoln], // true
          ...printInt,
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(ints(result.output.outputText), [0, 1]);
    });
  });

  describe("FRDS / FRLN", () => {
    it("FRDS returns fewer than max characters once it hits EOF", async () => {
      const files = fakeFiles();
      files.seed("f.txt", "hi");
      const result = await runFilePcode(
        [
          str("f.txt"),
          [PCode.ldin, 1],
          [PCode.open],
          [PCode.ldin, 1],
          [PCode.ldin, 10],
          [PCode.frds],
          [PCode.writ],
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(result.output.outputText, "hi");
    });

    it("FRLN reads up to (not including) a line terminator, and the final line at EOF without one", async () => {
      const files = fakeFiles();
      files.seed("f.txt", "line1\nline2");
      const result = await runFilePcode(
        [
          str("f.txt"),
          [PCode.ldin, 1],
          [PCode.open], // handle 1
          [PCode.ldin, 1],
          [PCode.frln],
          [PCode.writ],
          [PCode.newl],
          [PCode.ldin, 1],
          [PCode.frln],
          [PCode.writ],
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(result.output.outputText, "line1\nline2");
    });
  });

  describe("FWRS / FWLN", () => {
    it("write then read back round-trips through fakeFiles()'s in-memory store", async () => {
      const files = fakeFiles();
      await runFilePcode(
        [
          str("f.txt"),
          [PCode.ldin, 3],
          [PCode.open], // handle 1
          [PCode.ldin, 1],
          str("hello, "),
          [PCode.fwrs],
          [PCode.ldin, 1],
          str("world"),
          [PCode.fwln],
          [PCode.ldin, 1],
          [PCode.clos],
          [PCode.halt],
        ],
        {},
        files,
      );
      const result = await runFilePcode(
        [
          str("f.txt"),
          [PCode.ldin, 1],
          [PCode.open],
          [PCode.ldin, 1],
          [PCode.frln],
          [PCode.writ],
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(result.output.outputText, "hello, world");
    });
  });

  describe("DIRY", () => {
    // DIRY reuses FILE's exact bitfield decode, and FILE's own tests already
    // cover the bitfield/notification-level logic
    // exhaustively, so these just confirm DIRY wires the same logic
    // correctly against testDirectory (not testFile) and "directory" (not
    // "file") wording.
    it("create/delete mutate the directory tree, echoing the low 6 bits and setting bits 6/7 from actual before/after state", async () => {
      const files = fakeFiles();
      const result = await runFilePcode(
        [
          str("sub"),
          [PCode.ldin, fileCode(2, 0, 0)], // create on missing -> before=false, after=true
          [PCode.diry],
          ...printInt,
          str("sub"),
          [PCode.ldin, fileCode(1, 0, 0)], // delete -> before=true, after=false
          [PCode.diry],
          ...printInt,
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(ints(result.output.outputText), [2 | 128, 1 | 64]);
    });

    it("uses 'Directory' (not 'File') wording for its notification messages", async () => {
      const result = await runFilePcode([
        str("missing"),
        [PCode.ldin, fileCode(0, 1, 0)],
        [PCode.diry],
        [PCode.halt],
      ]);
      assertEquals(
        result.output.consoleText,
        'Directory "missing" does not exist.\n',
      );
    });

    it("rejects a path containing a '..' segment", async () => {
      const result = await runFilePcode([
        str("../secret"),
        [PCode.ldin, fileCode(0, 0, 0)],
        [PCode.diry],
        [PCode.halt],
      ]);
      assertEquals(result.output.runtimeErrors.length, 1);
      assertMatch(result.output.runtimeErrors[0].message, /cannot contain/i);
    });
  });

  describe("FFND / FDIR", () => {
    it("FFND finds matching files, sorted by name; handle=0 allocates a nonzero handle", async () => {
      const files = fakeFiles();
      files.seed("b.txt", "");
      files.seed("a.txt", "");
      files.seed("c.md", ""); // shouldn't match *.txt
      const result = await runFilePcode(
        [
          [PCode.ldin, 0], // handle=0: allocate
          str("*.txt"),
          [PCode.ffnd],
          // stack: handle, ^match
          [PCode.writ], // prints the match
          [PCode.newl],
          ...printInt, // prints the allocated handle
          [PCode.halt],
        ],
        {},
        files,
      );
      const lines = result.output.outputText.trim().split("\n");
      assertEquals(lines[0], "a.txt");
      assert(Number(lines[1]) > 0);
    });

    it("FFND returns the null string when nothing matches", async () => {
      const files = fakeFiles();
      files.seed("a.txt", "");
      const result = await runFilePcode(
        [
          [PCode.ldin, 0],
          str("*.doc"),
          [PCode.ffnd],
          [PCode.writ],
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(result.output.outputText, "");
    });

    it("FFND supports a pattern combining a directory segment with a glob for the final component", async () => {
      const files = fakeFiles();
      files.seedDirectory("subdir");
      files.seed("subdir/file1.txt", "");
      files.seed("subdir/file2.md", "");
      const result = await runFilePcode(
        [
          [PCode.ldin, 0],
          str("subdir/*.txt"),
          [PCode.ffnd],
          [PCode.writ],
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(result.output.outputText, "file1.txt");
    });

    it("FDIR finds matching directories (not files)", async () => {
      const files = fakeFiles();
      files.seedDirectory("dirB");
      files.seedDirectory("dirA");
      files.seed("a-file.txt", "");
      const result = await runFilePcode(
        [[PCode.ldin, 0], str("*"), [PCode.fdir], [PCode.writ], [PCode.halt]],
        {},
        files,
      );
      assertEquals(result.output.outputText, "dirA");
    });
  });

  describe("FNXT", () => {
    it("iterates a multi-match search to exhaustion", async () => {
      const files = fakeFiles();
      files.seed("a.txt", "");
      files.seed("b.txt", "");
      files.seed("c.txt", "");
      const result = await runFilePcode(
        [
          [PCode.ldin, 0],
          str("*.txt"),
          [PCode.ffnd],
          [PCode.writ], // "a.txt"
          [PCode.newl],
          [PCode.stvg, 500], // remember the allocated handle
          [PCode.ldvg, 500],
          [PCode.fnxt],
          [PCode.writ], // "b.txt"
          [PCode.newl],
          [PCode.ldvg, 500],
          [PCode.fnxt],
          [PCode.writ], // "c.txt"
          [PCode.newl],
          [PCode.ldvg, 500],
          [PCode.fnxt],
          [PCode.writ], // "" - exhausted
          [PCode.newl],
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(result.output.outputText, "a.txt\nb.txt\nc.txt\n\n");
    });

    it("treats a never-opened/already-closed handle as exhausted (returns the null string) rather than throwing", async () => {
      const result = await runFilePcode([
        [PCode.ldin, 7], // never opened via FFND/FDIR
        [PCode.fnxt],
        [PCode.writ],
        [PCode.halt],
      ]);
      assertEquals(result.output.outputText, "");
      assertEquals(result.output.runtimeErrors, []);
    });
  });

  describe("FMOV", () => {
    it("v=1 renames a file", async () => {
      const files = fakeFiles();
      files.seed("old.txt", "content");
      const result = await runFilePcode(
        [
          str("old.txt"),
          str("new.txt"),
          [PCode.ldin, 1],
          [PCode.fmov],
          ...printInt,
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(ints(result.output.outputText), [1]);
      assertFalse((await files.testFile("old.txt", "enquire")).existedBefore);
      assert((await files.testFile("new.txt", "enquire")).existedBefore);
    });

    it("v=1 rename fails (pushes false) when the old file doesn't exist", async () => {
      const result = await runFilePcode([
        str("nosuch.txt"),
        str("new.txt"),
        [PCode.ldin, 1],
        [PCode.fmov],
        ...printInt,
        [PCode.halt],
      ]);
      assertEquals(ints(result.output.outputText), [0]);
    });

    it("v=2 moves a file", async () => {
      const files = fakeFiles();
      files.seedDirectory("dest");
      files.seed("old.txt", "content");
      const result = await runFilePcode(
        [
          str("old.txt"),
          str("dest/old.txt"),
          [PCode.ldin, 2],
          [PCode.fmov],
          ...printInt,
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(ints(result.output.outputText), [1]);
      assertFalse((await files.testFile("old.txt", "enquire")).existedBefore);
      assert((await files.testFile("dest/old.txt", "enquire")).existedBefore);
    });

    it("v=3 copies a file, preserving the old path and its content", async () => {
      const files = fakeFiles();
      files.seed("old.txt", "content");
      const result = await runFilePcode(
        [
          str("old.txt"),
          str("copy.txt"),
          [PCode.ldin, 3],
          [PCode.fmov],
          ...printInt,
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(ints(result.output.outputText), [1]);
      assert((await files.testFile("old.txt", "enquire")).existedBefore);
      assert((await files.testFile("copy.txt", "enquire")).existedBefore);
    });

    it("a v other than 1/2/3 checks path legality but otherwise does nothing, returning false", async () => {
      const files = fakeFiles();
      files.seed("old.txt", "content");
      const result = await runFilePcode(
        [
          str("old.txt"),
          str("new.txt"),
          [PCode.ldin, 0],
          [PCode.fmov],
          ...printInt,
          [PCode.halt],
        ],
        {},
        files,
      );
      assertEquals(ints(result.output.outputText), [0]);
      assert((await files.testFile("old.txt", "enquire")).existedBefore);
      assertFalse((await files.testFile("new.txt", "enquire")).existedBefore);
    });

    it("rejects a '..' segment in the old path", async () => {
      const result = await runFilePcode([
        str("../old.txt"),
        str("new.txt"),
        [PCode.ldin, 1],
        [PCode.fmov],
        [PCode.halt],
      ]);
      assertEquals(result.output.runtimeErrors.length, 1);
      assertMatch(result.output.runtimeErrors[0].message, /cannot contain/i);
    });

    it("rejects a '..' segment in the new path", async () => {
      const result = await runFilePcode([
        str("old.txt"),
        str("../new.txt"),
        [PCode.ldin, 1],
        [PCode.fmov],
        [PCode.halt],
      ]);
      assertEquals(result.output.runtimeErrors.length, 1);
      assertMatch(result.output.runtimeErrors[0].message, /cannot contain/i);
    });
  });

  describe("async suspension mechanics (suspendFor)", () => {
    // These exercise runtime.ts's suspendFor helper directly (via OPEN,
    // the simplest single-suspension op) rather than any one file PCode's own
    // behaviour.

    it("a rejected FileSystem call halts with the rejection's error, same as a synchronous throw", async () => {
      const rejectingFiles: FakeFiles = {
        ...fakeFiles(),
        openFile: () => Promise.reject(new Error("disk exploded")),
      };
      const result = await runFilePcode(
        [str("a.txt"), [PCode.ldin, 3], [PCode.open], [PCode.halt]],
        {},
        rejectingFiles,
      );
      assertEquals(result.output.runtimeErrors.length, 1);
      assertEquals(result.output.runtimeErrors[0].message, "disk exploded");
      assertFalse(isRunning());
    });

    it("a resolved promise from a superseded run doesn't resume the run that replaced it (state.runToken guard)", async () => {
      let resolveFirst: (handle: number) => void = () => {};
      const firstFiles: FakeFiles = {
        ...fakeFiles(),
        openFile: () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      };
      runPcode(
        [str("a.txt"), [PCode.ldin, 3], [PCode.open], [PCode.halt]],
        {},
        firstFiles,
      );
      assert(isRunning());

      // supersede it with a second run that's ALSO suspended on its own
      // pending open() - if resolving the first run's stale promise were
      // to resume execution regardless of which run it belongs to, it
      // would incorrectly advance this second run straight to HALT
      let resolveSecond: (handle: number) => void = () => {};
      const secondFiles: FakeFiles = {
        ...fakeFiles(),
        openFile: () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      };
      runPcode(
        [str("b.txt"), [PCode.ldin, 3], [PCode.open], [PCode.halt]],
        {},
        secondFiles,
      );
      assert(isRunning());

      resolveFirst(1); // resolve the first (now-stale) run's promise
      await Promise.resolve();
      await Promise.resolve();
      assert(isRunning()); // second run untouched - still waiting on its own promise

      resolveSecond(2); // sanity check: the second run's own promise still resumes it normally
      await Promise.resolve();
      await Promise.resolve();
      assertFalse(isRunning());
    });

    it("a rejected promise from a superseded run doesn't affect the run that replaced it (state.runToken guard)", async () => {
      let rejectFirst: (error: Error) => void = () => {};
      const firstFiles: FakeFiles = {
        ...fakeFiles(),
        openFile: () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          }),
      };
      runPcode(
        [str("a.txt"), [PCode.ldin, 3], [PCode.open], [PCode.halt]],
        {},
        firstFiles,
      );

      let resolveSecond: (handle: number) => void = () => {};
      const secondFiles: FakeFiles = {
        ...fakeFiles(),
        openFile: () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      };
      const second = runPcode(
        [str("b.txt"), [PCode.ldin, 3], [PCode.open], [PCode.halt]],
        {},
        secondFiles,
      );
      assert(isRunning());

      rejectFirst(new Error("stale rejection")); // must not halt/error the second run
      await Promise.resolve();
      await Promise.resolve();
      assert(isRunning());
      assertEquals(second.output.runtimeErrors, []);

      resolveSecond(2);
      await Promise.resolve();
      await Promise.resolve();
      assertFalse(isRunning());
    });
  });

  describe("end-to-end: a real compiled program", () => {
    // Compiles and runs one of the checked-in
    // assets/examples/{BASIC,Pascal,Python}/Files/ examples directly, as a
    // sanity check beyond hand-written pcode fixtures. Doing that against
    // assets/examples/Pascal/Files/WriteAndReadFile.tpas
    // surfaced five pre-existing compiler bugs, none of them specific to file
    // processing - nothing had ever compiled anything in Files/ before, since
    // file PCode execution didn't exist:
    //  1. tokenize.ts's newline() only matched "\n", not "\r\n"/"\r" - a
    //     source file with CRLF line endings (all three WriteAndReadFile
    //     fixtures are) sent every "\r" into the "illegal" fallback, whose
    //     own zero-length-token bug (see next) then hung the tokenizer
    //     forever. FIXED (with regression tests) as part of this step,
    //     since it's a correctness/hang bug worth fixing regardless.
    //  2. That "illegal" fallback could itself produce a zero-length
    //     token when the offending character was itself unmatched
    //     whitespace, stalling the tokenizer's main loop. FIXED alongside
    //     (1) - defense in depth against the same class of hang for any
    //     other unmatched whitespace character (e.g. a tab).
    //  3. The Pascal parser's top-level declaration loop (pascal/parser.ts,
    //     between "PROGRAM ...;" and "begin") didn't skip "comment"
    //     lexemes, so a comment between two VAR declarations broke
    //     parsing. FIXED (with a regression test) - a small, targeted,
    //     self-contained fix.
    //  4. Pascal's parseStatement always ran eosCheck() after a comment
    //     "statement", wrongly demanding a semicolon after whatever
    //     lexeme happened to follow the comment. FIXED (with a regression
    //     test) alongside (3).
    //  5. A comment directly between a control-structure keyword (e.g.
    //     "then") and its single-statement body (no explicit begin/end)
    //     gets treated as if it *were* the body, silently swallowing the
    //     real body's position (Pascal parser). Also, separately, Python's
    //     top-level statement separator check doesn't tolerate a trailing
    //     comment either. Both NOT fixed here - they're deeper, more
    //     invasive changes (auditing every "expect exactly one statement"
    //     call site across multiple language parsers), clearly out of
    //     scope for a file-processing PCode step. Flagged for a follow-up.
    //
    // Given (5), none of the three shipped WriteAndReadFile examples
    // compile cleanly yet (BASIC separately hits an unrelated tokenizer
    // gap around "#"-suffixed command names like PRINTLN#). Rather than
    // widen this step further chasing those, this test compiles a minimal
    // Pascal program written by hand - same structure and file commands as
    // WriteAndReadFile.tpas (openfile/fwriteln/closefile/eof/freadln), no
    // comments - through the *real* compiler pipeline, confirming the design
    // holds up against real compiled code.
    it("compiles and runs a WriteAndReadFile-equivalent Pascal program through the real compiler", async () => {
      const source = `PROGRAM WriteAndReadFile;
VAR myfilename: string;
    handle: integer;
BEGIN
  myfilename := 'TestFile.txt';
  handle := openfile(myfilename, 3);
  fwriteln(handle, 'This is the first line to be written.');
  fwriteln(handle, 'This is the second line to be written.');
  closefile(handle);
  handle := openfile(myfilename, 1);
  while not(eof(handle)) do
   begin
    writeln(freadln(handle))
   end;
  closefile(handle)
END.
`;
      const tokens = tokenize(source, "Pascal");
      const lexemes = lexify(tokens, "Pascal");
      const program = parse(lexemes, "Pascal");
      const pcode = encode(program);

      const result = await runFilePcode(pcode);

      assertEquals(result.output.runtimeErrors, []);
      assertFalse(isRunning());
      assertEquals(
        result.output.outputText,
        "This is the first line to be written.\nThis is the second line to be written.\n",
      );
    });
  });

  describe("end-to-end: directory/search/move operators (real compiled programs)", () => {
    // The directory/search/move equivalent of the "end-to-end" block above:
    // compiles and runs
    // assets/examples/{BASIC,Pascal,Python}/Files/FileSearching.* and
    // RenameAndDeleteFile.* through the real compiler, picking one
    // language (Pascal, here - both files already compile and run cleanly
    // through it, unlike WriteAndReadFile.tpas, which needed a
    // hand-written stand-in).
    //
    // Compiling FileSearching.tpas surfaced one more pre-existing,
    // unrelated compiler bug, found and fixed alongside this step:
    // `findfirst`/`finddir`'s "file handle" parameter
    // (src/core/constants/commands.ts's FINDFIRST$/FINDDIR$) was declared
    // as a plain `p("file handle", "integer")` instead of
    // `p("file handle", "integer", true)` - missing the
    // `isReferenceParameter` flag that INC/DEC/ADDRESS already establish as
    // the way this codebase marks a parameter whose *address* (not value)
    // must be pushed, for commands whose compiled body writes back through
    // it (here, via the `dupl lptr rota FFND/FDIR swap rota sptr` idiom -
    // see FINDFIRST$/FINDDIR$'s pcode bodies). Without the flag, the
    // "handle" argument's *value* (initially 0) was pushed instead of its
    // *address*, so FFND/FDIR read and wrote through whatever memory
    // location integer 0 happened to name, rather than the `fhandle`/
    // `dhandle` variable itself - meaning the variable was never actually
    // updated to the real allocated handle, and a subsequent `findnext`
    // call (reading the *unmodified* `fhandle`, still 0) searched the
    // wrong handle slot instead of continuing the real search. FIXED (a
    // one-line change per parameter, confirmed against all three
    // languages, since `commands.ts` is shared) with this test as its
    // regression coverage - the multi-match assertions below would fail
    // without the fix, since only the first match would ever be found.
    it("FileSearching.tpas lists files in the base directory via findfirst/findnext", async () => {
      const files = fakeFiles();
      files.seed("a.txt", "");
      files.seed("b.txt", "");
      const code = await readExample("Pascal/Files/FileSearching.tpas");
      const pcode = compileExample("Pascal", code);
      const result = await runExampleBoundedAsync(pcode, 50, {}, files);

      assertFalse(result.hitIterationCap);
      assertEquals(result.output.runtimeErrors, []);
      assertEquals(
        result.output.outputText,
        "Turtle directories (up to first level) and their files ...\n\n" +
          "Base directory:\n  a.txt\n  b.txt\n\n",
      );
    });

    it("RenameAndDeleteFile.tpas renames then deletes a file across its three loop iterations", async () => {
      const files = fakeFiles();
      files.seed("TestFile.txt", "line1\nline2");
      const code = await readExample("Pascal/Files/RenameAndDeleteFile.tpas");
      const pcode = compileExample("Pascal", code);
      const result = await runExampleBoundedAsync(pcode, 50, {}, files);

      assertFalse(result.hitIterationCap);
      assertEquals(result.output.runtimeErrors, []);
      assertEquals(
        result.output.outputText,
        "LOOP 1 ...\n\n" +
          "ABOUT TO TRY TO READ TestFile.txt ...\n" +
          "Contents read from TestFile.txt:\n  line1\n  line2\n\n" +
          "ABOUT TO TRY TO READ TestRename.txt ...\n" +
          "  TestRename.txt could not be opened for reading\n\n" +
          "RENAMING TestFile.txt TO TestRename.txt\n  succeeded\n\n" +
          "LOOP 2 ...\n\n" +
          "ABOUT TO TRY TO READ TestFile.txt ...\n" +
          "  TestFile.txt could not be opened for reading\n\n" +
          "ABOUT TO TRY TO READ TestRename.txt ...\n" +
          "Contents read from TestRename.txt:\n  line1\n  line2\n\n" +
          "DELETING TestRename.txt\n  file no longer exists\n\n" +
          "LOOP 3 ...\n\n" +
          "ABOUT TO TRY TO READ TestFile.txt ...\n" +
          "  TestFile.txt could not be opened for reading\n\n" +
          "ABOUT TO TRY TO READ TestRename.txt ...\n" +
          "  TestRename.txt could not be opened for reading\n\n",
      );
    });
  });
});
