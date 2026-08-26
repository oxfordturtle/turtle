import {
  assertNoWombleLogs,
  coreMachine,
  errors,
  machine,
  mountRoute,
  program,
  q,
  resetStore,
  settings,
  settle,
  storage,
} from "../lib/setup.ts";
import { diskFetcher, eventually, requests } from "./lib/examples.ts";
import {
  assert,
  assertEquals,
  assertFalse,
  assertInstanceOf,
  assertStringIncludes,
} from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

const { examples, exampleGroups } = await import("@/core/constants.ts");

// The file memory and the compile pipeline (src/islands/turtle-system/
// program.ts): the largest module in src/islands, and the one everything else
// in the system reads. `test/ui/dom/tabs.test.ts` covers what the panes render
// from it; this file covers the store itself - opening, closing, switching and
// saving files, the example loaders, and RUN.
//
// Three things reach outside the store, and each has a seam rather than a
// mock of the module under test:
//
// - **`fetch`**, replaced through the module's own `setFetcher` (there is no
//   network in this layer), usually with the disk fetcher that serves the real
//   `assets/examples/`.
// - **downloading**, which is an `<a download>` clicked but never added to the
//   document. `HTMLAnchorElement.prototype.click` and `URL.createObjectURL`
//   are recorded below, so a test can read back both the filename and the
//   bytes.
// - **choosing a local file**, which is an `<input type="file">` clicked but
//   never added either; the recorder hands it a file and announces the change,
//   which is what a file picker does.

const window = document.defaultView as unknown as Window & typeof globalThis;

/** Every `<a download>` this module clicked, with the content behind its href. */
const downloads: Array<{ filename: string; content: Promise<string> }> = [];

/** The file the next `<input type="file">` click "chooses", if a test set one. */
let chosen: { name: string; content: string } | null = null;

const blobs = new Map<string, Blob>();
let blobCount = 0;

const anchorClick = window.HTMLAnchorElement.prototype.click;

window.HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
  // only the download anchor: every menu command is an `<a>` too
  if (!this.hasAttribute("download")) return anchorClick.call(this);
  const href = this.getAttribute("href") ?? "";
  downloads.push({
    filename: this.getAttribute("download") ?? "",
    content: (blobs.get(href) ?? new Blob([])).text(),
  });
};

URL.createObjectURL = (blob: Blob): string => {
  const url = `blob:${(blobCount += 1)}`;
  blobs.set(url, blob);
  return url;
};

window.HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
  if (this.type !== "file") return;
  Object.defineProperty(this, "files", {
    configurable: true,
    // dismissing the picker announces the change with nothing chosen, which is
    // not the same as never announcing it
    value: chosen ? [new File([chosen.content], chosen.name)] : [],
  });
  this.dispatchEvent(new window.Event("change"));
};

/** Waits for the `FileReader`/`fetch` promises an open goes through. */
const opened = (name: string): Promise<void> =>
  eventually(() => program.getFilename() === name, `${name} to open`);

/** Replaces the alert-calling handler `init()` registers with a recording one. */
const captureErrors = (): unknown[] => {
  const captured: unknown[] = [];
  errors.setErrorHandler((error) => captured.push(error));
  return captured;
};

const messages = (captured: unknown[]): string[] =>
  captured.map((error) => (error as Error).message);

beforeEach(async () => {
  await mountRoute("/");
  requests.length = 0;
  downloads.length = 0;
  chosen = null;
});

afterEach(() => {
  coreMachine.halt();
  assertNoWombleLogs();
});

// FIRST, before anything installs the disk fetcher: what the module ships
// with is a wrapper around the global `fetch` rather than a bare alias, so
// that `fetch` keeps its own `this` - a browser rejects `const f = fetch;
// f(url)` outright.
describe("the fetcher it starts with", () => {
  it("is the real global fetch", async () => {
    const asked: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = ((input: string | URL | Request) => {
      asked.push(String(input));
      return Promise.resolve(new Response("x = 1"));
    }) as typeof fetch;
    try {
      program.openExampleFile("Triangle1");
      await opened("Triangle1");
      assertEquals(asked, ["/examples/Python/Procedures/Triangle1.tpy"]);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("the file memory", () => {
  beforeEach(() => {
    program.setFetcher(diskFetcher);
  });

  it("starts as one empty file in the current language", () => {
    assertEquals(program.getFiles().length, 1);
    assertEquals(program.getCode(), "");
    assertEquals(program.getFilename(), "");
    assertEquals(program.getCurrentFile()?.language, "Python");
  });

  // A new file goes *over* an untouched empty placeholder rather than beside
  // it, which is what stops "New program" on a fresh page leaving two.
  it("replaces an untouched empty file rather than adding beside it", () => {
    program.newFile();
    assertEquals(program.getFiles().length, 1);
    program.setCode("x = 1");
    program.newFile();
    assertEquals(program.getFiles().length, 2);
    assertEquals(program.getCurrentFileIndex(), 1);
    assertEquals(program.getCode(), "");
  });

  it("can start from the current language's skeleton instead of blank", () => {
    program.newFile(true);
    assertStringIncludes(program.getCode(), "blot(var1)");
    settings.setSetting("language", "Pascal");
    program.newFile(true);
    assertStringIncludes(program.getCode(), "PROGRAM programName;");
  });

  it("renames the current file, which is what names the download", () => {
    program.renameFile("mine");
    assertEquals(program.getFilename(), "mine");
    assertEquals(program.getCurrentFile()?.filename, "mine.tpy");
    // and an unnamed file still has a filename to be saved under
    program.newFile();
    program.setCode("x = 1");
    assertEquals(program.getCurrentFile()?.filename, "filename.tpy");
  });

  // Nothing in the UI offers an index that isn't there - the filename
  // `<select>` is built from the list - but the store is a module anything on
  // the page can call, and this is what its `?.`s are for.
  it("survives being asked for a file that isn't there", () => {
    program.setCode("x = 1");
    program.selectFile(99);
    assertEquals(program.getCurrentFile(), undefined);
    assertEquals(program.getCode(), "");
    assertEquals(program.getTokens(), []);
  });

  it("switches between open files, re-deriving the displays each time", () => {
    program.setCode("x = 1");
    program.newFile();
    program.setCode("# just a comment\ny = 2");
    assertEquals(program.getCurrentFileIndex(), 1);

    program.selectFile(0);
    assertEquals(program.getCode(), "x = 1");
    // the tokens are the newly selected file's, not the one just left
    assertEquals(
      program.getTokens().map((token) => token.content),
      ["x", " ", "=", " ", "1"],
    );
    assertEquals(sessionStorage.getItem("currentFileIndex"), "0");
  });

  it("re-derives a compiled file's whole pipeline when it is selected again", () => {
    program.setCode("print('hi')");
    program.compileCurrentFile();
    assert(program.getPcode().length > 0);
    program.newFile();
    assertEquals(program.getPcode(), []);
    program.selectFile(0);
    assert(program.getPcode().length > 0);
    assert(program.getUsage().length > 0);
    assert(program.getLexemes().length > 0);
  });

  it("closes the current file and falls back to the one before it", () => {
    program.setCode("first");
    program.newFile();
    program.setCode("second");
    program.closeCurrentFile();
    assertEquals(program.getFiles().length, 1);
    assertEquals(program.getCode(), "first");
  });

  // Closing the last file can't leave the editor with nothing to edit.
  it("leaves a fresh empty file behind when the last one is closed", () => {
    program.setCode("only");
    program.closeCurrentFile();
    assertEquals(program.getFiles().length, 1);
    assertEquals(program.getCode(), "");
    assertEquals(program.getPcode(), []);
  });

  it("re-compiles a compiled file that the close leaves current", () => {
    program.setCode("print('one')");
    program.compileCurrentFile();
    program.newFile();
    program.setCode("print('two')");
    program.closeCurrentFile();
    assertEquals(program.getCode(), "print('one')");
    assert(program.getPcode().length > 0);
  });
});

describe("opening a file's content", () => {
  beforeEach(() => {
    program.setFetcher(diskFetcher);
  });

  // The extension is the only thing that says which language a file is in,
  // including the extensions the desktop system used to use.
  it("takes the language from the extension, old spellings included", () => {
    const cases: Array<[string, string]> = [
      ["a.tbas", "BASIC"],
      ["a.tgb", "BASIC"],
      ["a.tc", "C"],
      ["a.tjav", "Java"],
      ["a.tpas", "Pascal"],
      ["a.tgp", "Pascal"],
      ["a.tpy", "Python"],
      ["a.tgy", "Python"],
      ["a.tts", "TypeScript"],
    ];
    for (const [filename, language] of cases) {
      program.openFile(filename, "code");
      assertEquals(program.getCurrentFile()?.language, language, filename);
    }
  });

  it("keeps the name before the extension, dots and all, and normalises the code", () => {
    program.openFile("my.program.tpy", "  x = 1\r\ny = 2  ");
    assertEquals(program.getFilename(), "my.program");
    assertEquals(program.getCode(), "x = 1\ny = 2");
  });

  // The language a file brings with it becomes the system's, so the language
  // <select> and the documentation prose follow it.
  it("adopts the file's language across the whole page", async () => {
    program.openFile("a.tpas", "PROGRAM a; BEGIN END.");
    await settle();
    assertEquals(settings.getSettings().language, "Pascal");
    assertEquals(q("language-select select").value, "Pascal");
  });

  // [known limitation] TODO.md 3.6: .tmj (pcode as JSON) and .tmb (pcode as
  // binary) are both still to do, so they fall through to the same rejection
  // as an unknown extension.
  it("rejects a file type it cannot read, .tmj and .tmb included", () => {
    const captured = captureErrors();
    program.openFile("a.tmj", "{}");
    program.openFile("a.tmb", "");
    program.openFile("a.txt", "");
    program.openFile("noextension", "");
    assertEquals(messages(captured), [
      "Invalid file type.",
      "Invalid file type.",
      "Invalid file type.",
      "Invalid file type.",
    ]);
  });
});

describe("opening a .tmx/.tgx export", () => {
  const exported = JSON.stringify({
    language: "BASIC",
    name: "ignored",
    code: "x% = 1",
    usage: [{ category: "Made up", expressions: [], total: 0 }],
    pcode: [[1, 2, 3]],
  });

  it("takes the compiled artifacts from the file rather than compiling them", async () => {
    program.openFile("saved.tmx", exported);
    await settle();
    assertEquals(program.getCurrentFile()?.language, "BASIC");
    // the name comes from the filename, not the JSON's own `name`
    assertEquals(program.getFilename(), "saved");
    assertEquals(program.getCode(), "x% = 1");
    assertEquals(program.getPcode(), [[1, 2, 3]]);
    assertEquals(program.getUsage()[0]?.category, "Made up");
    // it counts as compiled, and its lexemes come from its source
    assert(program.getCurrentFile()?.compiled);
    assert(program.getLexemes().length > 0);
  });

  it("reads the same format under the .tgx extension", async () => {
    program.openFile("saved.tgx", exported);
    await settle();
    assertEquals(program.getPcode(), [[1, 2, 3]]);
  });

  it("rejects one that isn't JSON, or that is missing a field", () => {
    const captured = captureErrors();
    program.openFile("bad.tmx", "not json at all");
    program.openFile("bad.tmx", JSON.stringify({ language: "Python" }));
    assertEquals(messages(captured), [
      "Invalid TMX file.",
      "Invalid TMX file.",
    ]);
  });
});

describe("choosing a file from disk", () => {
  it("opens what the picker hands back", async () => {
    chosen = { name: "picked.tpy", content: "x = 1" };
    program.openLocalFile();
    await opened("picked");
    assertEquals(program.getCode(), "x = 1");
  });

  it("does nothing when the picker is dismissed", async () => {
    // the change event with no file, which is what cancelling looks like
    chosen = null;
    program.openLocalFile();
    await settle();
    assertEquals(program.getFilename(), "");
  });

  // Blocked on an account system that doesn't exist - see TODO.md 3.4.
  it("reports that a remote file cannot be opened yet", () => {
    const captured = captureErrors();
    program.openRemoteFile("https://example.com/a.tpy");
    assertEquals(messages(captured), ["Feature not yet available."]);
  });
});

describe("saving a file", () => {
  it("downloads the current file's code under its own filename", async () => {
    program.setCode("x = 1");
    program.renameFile("mine");
    program.saveLocalFile();
    assertEquals(downloads.length, 1);
    assertEquals(downloads[0]?.filename, "mine.tpy");
    assertEquals(await downloads[0]?.content, "x = 1");
  });

  it("reports that saving to an account is not available yet", () => {
    const captured = captureErrors();
    program.saveRemoteFile();
    assertEquals(messages(captured), ["Feature not yet available."]);
  });
});

describe("the backup copy", () => {
  it("stores the current code, and puts it back on request", () => {
    program.setCode("first version");
    program.backupCode();
    program.setCode("second version");
    program.restoreCode();
    assertEquals(program.getCode(), "first version");
    // restoring re-tokenizes, so the editor's highlighting follows
    assertEquals(program.getTokens().length > 0, true);
  });

  it("does nothing when the code and the backup are the same", () => {
    program.setCode("unchanged");
    program.backupCode();
    const before = program.getCurrentFile()?.edited;
    program.restoreCode();
    assertEquals(program.getCode(), "unchanged");
    assertEquals(program.getCurrentFile()?.edited, before);
  });
});

describe("the example loaders", () => {
  beforeEach(() => {
    program.setFetcher(diskFetcher);
  });

  it("fetches an example from the URL the server serves it under", async () => {
    program.openExampleFile("Triangle1");
    await opened("Triangle1");
    assertEquals(requests, ["/examples/Python/Procedures/Triangle1.tpy"]);
    assertEquals(program.getCurrentFile()?.example, "Triangle1");
  });

  it("reports an example id it doesn't have", () => {
    const captured = captureErrors();
    program.openExampleFile("NoSuchExample");
    assertEquals(messages(captured), ['Unknown example "NoSuchExample".']);
    assertEquals(requests, []);
  });

  // Not every example is written in every language, and the fetch is what
  // finds out - the server answers 404.
  it("reports an example the current language doesn't have", async () => {
    const captured = captureErrors();
    const missing = examples.find((example) => example.names.Python === null);
    assert(missing, "expected an example with no Python spelling");
    program.openExampleFile(missing.id);
    await eventually(() => captured.length > 0, "the 404 to be reported");
    assertEquals(messages(captured), [
      `Example "${missing.id}" is not available for Turtle Python.`,
    ]);
  });

  it("opens every example in a group at once", async () => {
    const group = exampleGroups.find((candidate) => candidate.id === "Drawing");
    assert(group);
    program.openExampleGroup("Drawing");
    await eventually(
      () => program.getFiles().length === group.examples.length,
      "every example in the group to open",
    );
    assertEquals(requests.length, group.examples.length);
  });

  it("reports a group id it doesn't have", () => {
    const captured = captureErrors();
    program.openExampleGroup("NoSuchGroup");
    assertEquals(messages(captured), ["Group ID NoSuchGroup not found."]);
  });

  // The Examples menu's "Load corresponding example on language switch": the
  // language change re-opens the same example in the new language.
  it("re-opens the open example in the new language when asked to", async () => {
    settings.setSetting("loadCorrespondingExample", true);
    program.openExampleFile("Triangle1");
    await opened("Triangle1");
    requests.length = 0;
    settings.setSetting("language", "Pascal");
    await eventually(
      () => program.getCurrentFile()?.language === "Pascal",
      "the Pascal example to open",
    );
    assertEquals(requests, ["/examples/Pascal/Procedures/Triangle1.tpas"]);
  });

  it("leaves the example alone on a language switch when not", async () => {
    settings.setSetting("loadCorrespondingExample", false);
    program.openExampleFile("Triangle1");
    await opened("Triangle1");
    requests.length = 0;
    settings.setSetting("language", "Pascal");
    await settle();
    assertEquals(requests, []);
    // the file keeps its Python code, but is no longer compiled: the language
    // it would compile in has changed under it
    assertFalse(program.getCurrentFile()?.compiled);
  });

  // The Examples menu's "Output all examples", which is a teaching aid rather
  // than part of the system: one text file with every example in it.
  it("downloads every example as one text file", async () => {
    let fetched = 0;
    program.setFetcher(() => {
      fetched += 1;
      return Promise.resolve(new Response("CODE"));
    });
    await program.outputAllExamples();
    assertEquals(fetched, examples.length);
    assertEquals(downloads.length, 1);
    assertEquals(downloads[0]?.filename, "Python_examples.txt");
    const content = await downloads[0]!.content;
    assertStringIncludes(
      content,
      `Example ${examples[0]!.id}:\n----------\nCODE`,
    );
  });
});

describe("compiling and running", () => {
  it("keeps what every stage of the compile produced", () => {
    program.setCode("# a comment\nprint('hi')");
    program.compileCurrentFile();
    assert(program.getTokens().length > 0);
    assert(program.getLexemes().length > 0);
    assertEquals(program.getComments().length, 1);
    assert(program.getUsage().length > 0);
    assert(program.getPcode().length > 0);
    assert(program.getCurrentFile()?.compiled);
  });

  // Accumulated stage by stage rather than returned at the end, so a program
  // that lexes and then fails to parse still updates the syntax highlighting.
  it("keeps the earlier stages when a later one fails, and reports why", () => {
    const captured = captureErrors();
    program.setCode("print('hi'");
    program.compileCurrentFile();
    assertEquals(captured.length, 1);
    assertInstanceOf(captured[0], Error);
    assert(program.getLexemes().length > 0);
    assertEquals(program.getPcode(), []);
    assertFalse(program.getCurrentFile()?.compiled);
  });

  it("compiles before running, and runs what it just compiled", async () => {
    program.setCode("print('hi')");
    assertFalse(program.getCurrentFile()?.compiled);
    program.playPauseMachine();
    assert(program.getCurrentFile()?.compiled);
    await eventually(
      () => q("turtle-system pre.console").innerHTML === "hi\n",
      "the program's output to reach the console",
    );
  });

  it("does not run a program that would not compile", () => {
    captureErrors();
    program.setCode("print('hi'");
    program.playPauseMachine();
    assertFalse(coreMachine.isRunning());
  });

  // The second press of the same button is the pause, which is why this is one
  // function rather than two.
  it("pauses a running program instead of starting it again", async () => {
    // long enough that the machine's own code-count limit makes it yield
    program.setCode("for i in range(200000):\n  x = i\n");
    program.playPauseMachine();
    assert(coreMachine.isRunning());
    program.playPauseMachine();
    await settle();
    assertEquals(machine.getStatus(), { running: true, playing: false });
    // and again to resume
    program.playPauseMachine();
    await settle();
    assertEquals(machine.getStatus(), { running: true, playing: true });
  });
});

describe("what the session restores on the next page load", () => {
  /** A second page load, finding what the first one stored. */
  const reload = () => mountRoute("/", { keepSession: true });

  it("restores the open files and which one was current", async () => {
    program.setCode("first");
    program.newFile();
    program.setCode("second");
    await reload();
    assertEquals(program.getFiles().length, 2);
    assertEquals(program.getCode(), "second");
    // the restored files are `File` instances again, not the plain objects
    // JSON.parse gives back
    assertEquals(program.getCurrentFile()?.filename, "filename.tpy");
    // and the current file's displays are derived
    assert(program.getTokens().length > 0);
  });

  it("clamps a stored index that no longer points at a file", async () => {
    program.setCode("only one");
    storage.save("currentFileIndex", 7);
    await reload();
    assertEquals(program.getCurrentFileIndex(), 0);
    assertEquals(program.getCode(), "only one");
  });

  // The session doesn't store compilation results, so a file that was
  // compiled is compiled again on load - in the *current* language.
  it("re-compiles a file that was compiled when the page was unloaded", async () => {
    program.setCode("print('hi')");
    program.compileCurrentFile();
    await reload();
    assert(program.getPcode().length > 0);
  });

  // An untouched empty file adopts whatever language the page loads in,
  // rather than pinning the one it was created in.
  it("gives an untouched empty file the language of the new page", async () => {
    storage.save("files", []);
    storage.save("language", "Java");
    await reload();
    assertEquals(program.getFiles().length, 1);
    assertEquals(program.getCurrentFile()?.language, "Java");

    storage.save("language", "C");
    await reload();
    assertEquals(program.getCurrentFile()?.language, "C");
  });
});

// Every page of the site loads this module - the settings store imports it -
// but only the system's own page calls `initialise()`. Until it does there is
// no current file, and nothing here may throw.
describe("on a page with no system on it", () => {
  beforeEach(() => {
    resetStore(program.programStore);
  });

  afterEach(() => {
    // put the file memory back, since the store is shared by this whole file
    program.initialise();
  });

  it("has no file, and every writer is a no-op", () => {
    assertEquals(program.getCurrentFile(), undefined);
    assertEquals(program.getCode(), "");
    assertEquals(program.getFilename(), "");
    program.setCode("x = 1");
    program.renameFile("mine");
    program.compileCurrentFile();
    program.backupCode();
    program.restoreCode();
    program.applyLanguage("Pascal");
    program.playPauseMachine();
    assertEquals(program.getFiles(), []);
    assertEquals(program.getPcode(), []);
    assertFalse(coreMachine.isRunning());
  });

  it("has nothing to save", () => {
    program.saveLocalFile();
    assertEquals(downloads, []);
  });

  // `place` has no placeholder to replace when the list is empty, so the file
  // goes on the end - which is the first file.
  it("takes an opened file as its first", () => {
    program.openFile("a.tpy", "x = 1");
    assertEquals(program.getFiles().length, 1);
    assertEquals(program.getCode(), "x = 1");
  });

  // The client entry calls it, and it is written to be safe to call again:
  // the store itself is the re-entry guard, so a second call must not throw
  // the restored files away.
  it("restores the file memory once, however many times it is asked", () => {
    program.initialise();
    program.setCode("mine");
    program.initialise();
    assertEquals(program.getFiles().length, 1);
    assertEquals(program.getCode(), "mine");
  });
});
