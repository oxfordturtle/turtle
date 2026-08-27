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
import {
  diskFetcher,
  eventually,
  exampleFromDisk,
  requests,
} from "./lib/examples.ts";
import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

// The client startup itself (src/client/index.ts): every `mountRoute` runs the
// real `init()`, so these tests assert what a freshly loaded page can do that
// unwired modules cannot - the machine draws through its ports, the passes have
// swept the prose, the URL's example parameter opened something, and errors
// reach the user.

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

describe("init runs the page-wide passes", () => {
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

  it("applies language visibility for the stored language", () => {
    // the default language is Python, so the Python spellings show and every
    // other language's are hidden
    const shown = qa("code[data-language]").filter(
      (element: Element) => !element.classList.contains("hidden"),
    );
    assert(shown.length > 0);
    assert(
      shown.every(
        (element: Element) =>
          element.getAttribute("data-language") === "Python",
      ),
    );
    assert(qa('code[data-language="C"].hidden').length > 0);
  });

  it("re-runs the visibility passes when a setting changes", async () => {
    // the settings store notifies, the subscription init registered sweeps
    settings.setSetting("language", "C");
    await settle();
    const shown = qa("code[data-language]").filter(
      (element: Element) => !element.classList.contains("hidden"),
    );
    assert(shown.length > 0);
    assert(
      shown.every(
        (element: Element) => element.getAttribute("data-language") === "C",
      ),
    );

    // the mode pass follows the same subscription: an element injected after
    // the mount has never been swept, so only the re-run can set its class
    const simpleOnly = document.createElement("div");
    simpleOnly.setAttribute("data-mode", "simple");
    const normalOnly = document.createElement("div");
    normalOnly.setAttribute("data-mode", "normal");
    document.body.append(simpleOnly, normalOnly);
    settings.setSetting("mode", "simple");
    await settle();
    assert(!simpleOnly.classList.contains("hidden"));
    assert(normalOnly.classList.contains("hidden"));
  });
});

describe("init opens the file the URL names", () => {
  beforeEach(() => {
    requests.length = 0;
    program.setFetcher(diskFetcher);
  });

  it("?x= opens that example into the file memory", async () => {
    await mountRoute("/?x=Triangle1");
    await eventually(
      () => program.getFilename() === "Triangle1",
      "the example to open",
    );
    // the URL shape the server really serves examples under
    assertEquals(requests, ["/examples/Python/Procedures/Triangle1.tpy"]);
    // the real example file's code, in the store, over the empty placeholder
    const disk = await exampleFromDisk(requests[0]!);
    assertEquals(program.getCode(), disk.trim().replace(/\r\n/g, "\n"));
    assertEquals(program.getFiles().length, 1);
    assertEquals(program.getCurrentFile()?.example, "Triangle1");
    assertEquals(program.getCurrentFile()?.language, "Python");
    await settle();
  });

  it("?x= fetches the example for the ?l= language", async () => {
    // the settings initialise before the URL's example parameter is read, so
    // the example arrives in the language the same link asked for
    await mountRoute("/?l=BASIC&x=Triangle1");
    await eventually(
      () => program.getFilename() === "Triangle1",
      "the example to open",
    );
    assertEquals(requests, ["/examples/BASIC/Procedures/Triangle1.tbas"]);
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
  it("round-trips a value through the session, preserving its type", () => {
    storage.save("editorFontSize", 16);
    assertStrictEquals(storage.load("editorFontSize"), 16);
    storage.save("language", "Java");
    assertStrictEquals(storage.load("language"), "Java");
  });

  it("falls back to the declared default when nothing is stored", () => {
    sessionStorage.clear();
    assertStrictEquals(storage.load("language"), "Python");
    assertStrictEquals(storage.load("autoRunOnLoad"), false);
  });
});
