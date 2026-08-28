import {
  assertNoWombleLogs,
  coreMachine,
  errors,
  machine,
  mountRoute,
  program,
  q,
  qa,
  settings,
  settle,
  storage,
} from "../lib/setup.ts";
import { diskFetcher, exampleFromDisk, requests } from "./lib/examples.ts";
import {
  assert,
  assertEquals,
  assertFalse,
  assertStrictEquals,
} from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

// The client startup itself (src/client/index.ts): every `mountRoute` runs the
// real `init()`, so these tests assert what a freshly loaded page can do that
// unwired modules cannot - the machine draws through its ports, the code blocks
// are highlighted, `<body>` carries the two facts no component owns, the URL's
// example parameter opened something, and errors reach the user.

// Rule 6: every test ends with Womble having reported nothing.
afterEach(assertNoWombleLogs);

/**
 * Records what `init()`'s own registered handler does - `console.error` then
 * `alert` - with the blocking `alert` swapped for a recorder. For the tests
 * that cover that handler itself.
 */
const stubReporting = (): {
  alerts: string[];
  logged: unknown[];
  restore: () => void;
} => {
  const alerts: string[] = [];
  const logged: unknown[] = [];
  const originalAlert = globalThis.alert;
  const originalError = console.error;
  // deno-lint-ignore no-explicit-any
  globalThis.alert = ((message?: any) => {
    alerts.push(String(message));
  }) as typeof alert;
  console.error = (...args: unknown[]) => {
    logged.push(...args);
  };
  return {
    alerts,
    logged,
    restore: () => {
      globalThis.alert = originalAlert;
      console.error = originalError;
    },
  };
};

// FIRST, before any mount: `init()` replaces the handler this module ships
// with, and every `mountRoute` runs `init()`. The shipped one is what the
// *server* gets, which imports the island modules that report errors too -
// `alert` exists in Deno and blocks on stdin, so a server-side report has to
// log and carry on rather than hang the process.
describe("the error handler before the client entry registers its own", () => {
  it("logs and carries on", () => {
    const reporting = stubReporting();
    try {
      const boom = new Error("before init");
      errors.showError(boom);
      assertStrictEquals(reporting.logged[0], boom);
      assertEquals(reporting.alerts, []);
    } finally {
      reporting.restore();
    }
  });
});

describe("init wires the machine's outbound ports", () => {
  // "Reset machine" calls `machine.reset()` without a run, so the ports it
  // draws through are exactly the ones `init()` installed: the reset shows up
  // on the page and in the machine store only because the startup wired them.
  it("a reset without a run reaches the page through them", async () => {
    await mountRoute("/");
    machine.setTurtleProperty("x", 123);
    machine.setVirtualCanvas(5, 5, 10, 10);
    await settle();
    assertEquals(machine.getTurtle().x, 123);
    const canvas = q("turtle-system canvas") as HTMLCanvasElement;
    canvas.width = 10;
    const consolePane = q("turtle-system pre.console") as HTMLPreElement;
    consolePane.innerHTML = "leftover text";

    coreMachine.reset();
    await settle();

    // the turtle and the virtual canvas, back to what reset shows, via the
    // output and canvas ports' store writers
    assertEquals(machine.getTurtle(), {
      x: 500,
      y: 500,
      d: 0,
      a: 360,
      t: 2,
      c: "#000",
    });
    assertEquals(machine.getVirtualCanvas(), {
      startx: 0,
      starty: 0,
      sizex: 1000,
      sizey: 1000,
    });
    // the imperative half: the canvas resolution and the console text
    assertEquals(canvas.width, 1000);
    assertEquals(consolePane.innerHTML, "");
  });

  it("puts the program module on globalThis, for the console", async () => {
    // even a page without the system gets the global
    await mountRoute("/about");
    assertStrictEquals((globalThis as { program?: unknown }).program, program);
  });
});

describe("init runs the two document-level jobs", () => {
  beforeEach(async () => {
    await mountRoute("/documentation/reference");
  });

  it("highlights the documentation code blocks in their own languages", () => {
    // the static reference prose spells names once per language; after init
    // each block is token markup, not plain text, in its *own* language -
    // BASIC blocks are highlighted even though the current language is Python
    const highlighted = qa("code[data-language] span.command");
    assert(highlighted.length > 0);
    const basic = qa('code[data-language="BASIC"] span.command');
    assert(basic.length > 0);
  });

  // Which prose is shown is CSS now (style/screen/language.css), keyed off this
  // one attribute - so what the client has to get right is the attribute, and
  // there is no sweep to assert on. The server renders it too, from the cookie:
  // test/ui/ssr/pages.test.ts covers that half, which is the half that decides
  // whether the *first* paint is right.
  it("carries the language on the body, for the stylesheet", () => {
    assertEquals(document.body.dataset.language, "Python");
  });

  // A change, not a correction: the store notifies and the subscription `init`
  // registered writes the attribute again.
  it("follows the settings store for as long as the page lives", async () => {
    settings.setSetting("language", "C");
    await settle();
    assertEquals(document.body.dataset.language, "C");

    settings.setSetting("fullscreen", true);
    await settle();
    assert(document.body.classList.contains("fullscreen"));

    settings.setSetting("fullscreen", false);
    await settle();
    assertFalse(document.body.classList.contains("fullscreen"));
  });
});

// The server reads the example off disk and seeds it (src/pages/index.ts), so
// by the time the browser runs there is nothing to fetch and nothing to wait
// for. That is what makes a `/?x=` link a completion rather than a correction:
// the file memory and the example land in the same startup, before the islands
// hydrate, so the restored file is never drawn and then replaced.
describe("init opens the file the URL names", () => {
  beforeEach(() => {
    requests.length = 0;
    program.setFetcher(diskFetcher);
  });

  it("?x= opens that example into the file memory, without fetching", async () => {
    await mountRoute("/?x=Triangle1");
    assertEquals(program.getFilename(), "Triangle1");
    // the whole point: the content came with the page
    assertEquals(requests, []);
    const disk = await exampleFromDisk(
      "/examples/Python/Procedures/Triangle1.tpy",
    );
    assertEquals(program.getCode(), disk.trim().replace(/\r\n/g, "\n"));
    assertEquals(program.getFiles().length, 1);
    assertEquals(program.getCurrentFile()?.example, "Triangle1");
    assertEquals(program.getCurrentFile()?.language, "Python");
    await settle();
  });

  // Not every example exists in every language. The server seeds nothing it
  // couldn't read, so the browser is left showing the file memory - which is
  // what it would have shown anyway.
  it("?x= names an example this language hasn't got", async () => {
    await mountRoute("/?l=TypeScript&x=Recolouring");
    assertEquals(program.getFilename(), "");
    assertEquals(program.getCode(), "");
    assertEquals(requests, []);
    await settle();
  });

  it("?x= names no example at all", async () => {
    await mountRoute("/?x=NoSuchExample");
    assertEquals(program.getFilename(), "");
    assertEquals(requests, []);
    await settle();
  });

  it("?x= opens the example in the ?l= language", async () => {
    // `?l=` speaks for a file that is about to be opened, which is exactly what
    // this is - so the server reads the BASIC copy and seeds that
    await mountRoute("/?l=BASIC&x=Triangle1");
    assertEquals(program.getFilename(), "Triangle1");
    assertEquals(requests, []);
    assertEquals(program.getCurrentFile()?.language, "BASIC");
    await settle();
  });

  it("does not run on a page without the system", async () => {
    // without the gate, this link would silently replace the open file
    const reporting = stubReporting();
    try {
      await mountRoute("/documentation/reference?x=Triangle1");
      await settle();
      assertEquals(requests, []);
      assertEquals(program.getFilename(), "");
      assertEquals(program.getCode(), "");
      assertEquals(reporting.alerts, []);
    } finally {
      reporting.restore();
    }
  });
});

describe("init's registered error handler", () => {
  it("alerts an Error's own message", async () => {
    await mountRoute("/about");
    const reporting = stubReporting();
    try {
      const boom = new Error("boom");
      errors.showError(boom);
      assertEquals(reporting.alerts, ["boom"]);
      assertStrictEquals(reporting.logged[0], boom);
    } finally {
      reporting.restore();
    }
  });

  it("alerts anything else as a string", async () => {
    await mountRoute("/about");
    const reporting = stubReporting();
    try {
      errors.showError("not an Error instance");
      assertEquals(reporting.alerts, ["not an Error instance"]);
      assertStrictEquals(reporting.logged[0], "not an Error instance");
    } finally {
      reporting.restore();
    }
  });
});

describe("the storage behind it all (src/client/state/storage.ts)", () => {
  // what every settings read goes through
  it("round-trips a value through storage, preserving its type", () => {
    storage.save("editorFontSize", 16);
    assertStrictEquals(storage.load("editorFontSize"), 16);
    storage.save("language", "Java");
    assertStrictEquals(storage.load("language"), "Java");
  });

  it("falls back to the declared default when nothing is stored", () => {
    localStorage.clear();
    assertStrictEquals(storage.load("language"), "Python");
    assertStrictEquals(storage.load("autoRunOnLoad"), false);
  });
});
