import {
  assertNoWombleLogs,
  errors,
  machine,
  mountRoute,
  q,
  settle,
} from "../../lib/setup.ts";
import {
  assertEquals,
  assertInstanceOf,
  assertStrictEquals,
} from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

const {
  attachConsole,
  attachOutput,
  default: output,
} = await import("@/client/adapters/output.ts");

// The output port (src/client/adapters/output.ts), which is two jobs in one
// module and this file is arranged the same way: the two text streams are
// imperative writes on elements the panes hand over, and everything else is a
// write to the machine store or a request to something outside this adapter's
// reach. The page is really mounted, so the elements under test are the ones
// `<canvas-tab>` and `<output-tab>` attach from their own mount effects - not
// stand-ins this file made.

const consolePane = (): HTMLPreElement => q("turtle-system pre.console");
const outputPane = (): HTMLPreElement => q("turtle-system pre.output");

// deno-lint-ignore no-explicit-any
const system = (): any => q("turtle-system");

beforeEach(async () => {
  await mountRoute("/");
});

// Rule 6: every test ends with Womble having reported nothing.
afterEach(assertNoWombleLogs);

describe("the console", () => {
  it("appends what a program logs, keeping the view at the foot", () => {
    output.logToConsole("Hello");
    output.logToConsole(" world");
    assertEquals(consolePane().innerHTML, "Hello world");
    // `scrollHeight` is 0 without layout, so what this asserts is that the
    // adapter follows the text rather than where it lands
    assertEquals(consolePane().scrollTop, consolePane().scrollHeight);
  });

  it("deletes the last character on a backspace", () => {
    output.logToConsole("abc");
    output.backspaceConsole();
    assertEquals(consolePane().innerHTML, "ab");
  });

  it("takes its background colour, and clears only when asked to", () => {
    output.logToConsole("keep me");
    output.configureConsole(false, "rgb(0, 0, 255)");
    assertEquals(consolePane().innerHTML, "keep me");
    assertEquals(consolePane().style.background, "rgb(0, 0, 255)");
    output.configureConsole(true, "rgb(255, 255, 255)");
    assertEquals(consolePane().innerHTML, "");
  });
});

describe("the output tab", () => {
  it("appends what a program writes", () => {
    output.writeToOutput("one");
    output.writeToOutput("two");
    assertEquals(outputPane().innerHTML, "onetwo");
  });

  it("takes its background colour, and clears only when asked to", () => {
    output.writeToOutput("keep me");
    output.configureOutput(false, "rgb(0, 255, 0)");
    assertEquals(outputPane().innerHTML, "keep me");
    assertEquals(outputPane().style.background, "rgb(0, 255, 0)");
    output.configureOutput(true, "rgb(255, 255, 255)");
    assertEquals(outputPane().innerHTML, "");
  });
});

// The other half of the module: everything that isn't a character of text is
// state, and goes to the machine store for the components that display it.
describe("what goes to the machine store instead", () => {
  it("reports a turtle property", async () => {
    output.updateTurtleProperty("x", 250);
    output.updateTurtleProperty("c", "#ff0000");
    await settle();
    assertEquals(machine.getTurtle().x, 250);
    assertEquals(machine.getTurtle().c, "#ff0000");
    // and the display above the tabs follows
    assertEquals(q("turtle-properties .turtle-colour").textContent, "#ff0000");
  });

  it("reports a memory dump", async () => {
    output.updateMemoryDisplay({ stack: [1, 2], heap: [3], heapBase: 40 });
    await settle();
    assertEquals(machine.getMemory(), {
      stack: [1, 2],
      heap: [3],
      heapBase: 40,
    });
  });

  it("reports the machine starting, pausing and stopping", async () => {
    output.notifyStateChange("played");
    await settle();
    assertEquals(machine.getStatus(), { running: true, playing: true });
    output.notifyStateChange("paused");
    await settle();
    assertEquals(machine.getStatus(), { running: true, playing: false });
    output.notifyStateChange("halted");
    await settle();
    assertEquals(machine.getStatus(), { running: false, playing: false });
  });
});

describe("what goes outside this module altogether", () => {
  // `<turtle-system>` owns which tab is showing and this adapter is outside
  // its subtree, so it asks the way anything outside does - see
  // src/islands/turtle-system/commands.ts.
  it("asks the system to show a tab rather than showing one", async () => {
    output.selectTab("output");
    await settle();
    assertEquals(system().tab, "output");
  });

  it("reports a runtime error through the error seam", () => {
    const captured: unknown[] = [];
    errors.setErrorHandler((error) => captured.push(error));
    const error = new Error("Division by zero.");
    output.notifyRuntimeError(error);
    assertEquals(captured.length, 1);
    assertStrictEquals(captured[0], error);
    assertInstanceOf(captured[0], Error);
  });
});

// Both panes are components, so their elements come and go with them; and the
// server imports this module too, where there is no document at all. The
// machine writes through this port either way.
describe("with no panes attached", () => {
  it("drops the text rather than failing", () => {
    attachConsole(null);
    attachOutput(null);
    output.configureConsole(true, "#fff");
    output.logToConsole("nowhere");
    output.backspaceConsole();
    output.configureOutput(true, "#fff");
    output.writeToOutput("nowhere");
    // the real panes, still in the document, were not written to either
    assertEquals(consolePane().innerHTML, "");
    assertEquals(outputPane().innerHTML, "");
  });
});
