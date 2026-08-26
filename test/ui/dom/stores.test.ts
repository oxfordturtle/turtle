import {
  assertNoWombleLogs,
  machine,
  mountRoute,
  program,
  q,
  qa,
  settle,
  type,
} from "../lib/setup.ts";
import {
  assert,
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

// Two stores own the data - the open files and everything compiled from them,
// and what the running machine reports - and ten components display it. Get the
// wiring wrong and a component renders once and then silently stops following,
// which is what these assert from the store end: change the data, and see the
// DOM that displays it follow.
//
// They deliberately name no part of the mechanism, only the change and its
// effect on screen, so that replacing the wiring doesn't rewrite the tests.

beforeEach(async () => {
  await mountRoute("/");
});

// Rule 6: every test ends with Womble having reported nothing.
afterEach(assertNoWombleLogs);

describe("the program store drives the editor", () => {
  it("renders a line number per line of the current file", async () => {
    program.setCode("x = 1\ny = 2\nz = 3\n");
    await settle();
    assertEquals(qa("system-editor .line-numbers li").length, 4);
  });

  it("re-highlights the overlay from the store's tokens", async () => {
    program.setCode("x = 1");
    await settle();
    const code = q("system-editor pre code").innerHTML;
    assertStringIncludes(code, '<span class="identifier">x</span>');
    assertStringIncludes(code, '<span class="integer">1</span>');
  });

  it("pushes an externally-changed file into the textarea", async () => {
    const textarea = q("system-editor textarea") as HTMLTextAreaElement;
    program.setCode("count = 0");
    await settle();
    assertEquals(textarea.value, "count = 0");
  });

  // The other direction, and the one thing the editor deliberately does *not*
  // re-render: typing goes into the store, and the store must not then write
  // the same text back over the live value, which would collapse the selection
  // and the undo stack.
  it("takes an edit back out of the textarea without rewriting it", async () => {
    const textarea = q("system-editor textarea") as HTMLTextAreaElement;
    await type(textarea, "print('hi')");
    assertEquals(program.getCode(), "print('hi')");
    assertEquals(textarea.value, "print('hi')");
    assertEquals(qa("system-editor .line-numbers li").length, 1);
  });

  it("shows the current file's name in the filename bar", async () => {
    program.renameFile("mandelbrot");
    await settle();
    assertStringIncludes(q("system-filename").textContent, "mandelbrot");
  });
});

describe("the machine store drives the transport and the properties", () => {
  const buttons = (): HTMLButtonElement[] => qa("system-transport button");

  it("swaps RUN's icon and enables HALT when a program plays", async () => {
    machine.setStatus("played");
    await settle();
    assertEquals(buttons()[0]?.querySelector("i")?.className, "fa fa-pause");
    assertFalse(buttons()[1]!.hasAttribute("disabled"));
  });

  it("offers to resume a paused program, still running", async () => {
    machine.setStatus("paused");
    await settle();
    assertEquals(buttons()[0]?.querySelector("i")?.className, "fa fa-play");
    assertFalse(buttons()[1]!.hasAttribute("disabled"));
  });

  it("disables HALT again when the program stops", async () => {
    machine.setStatus("halted");
    await settle();
    assertEquals(buttons()[0]?.querySelector("i")?.className, "fa fa-play");
    assert(buttons()[1]?.hasAttribute("disabled"));
  });

  it("follows the turtle's properties", async () => {
    machine.setTurtleProperty("x", 42);
    machine.setTurtleProperty("y", -7);
    machine.setTurtleProperty("c", "#ff0000");
    await settle();
    const values = qa("turtle-properties .turtle-value").map(
      (element: Element) => element.textContent,
    );
    assertEquals(values[0], "42");
    assertEquals(values[1], "-7");
    assertEquals(values.at(-1), "#ff0000");
  });

  it("re-labels the canvas edges when a program resizes the virtual canvas", async () => {
    machine.setVirtualCanvas(0, 0, 500, 500);
    await settle();
    const labels = qa("canvas-tab .canvas-coords span").map(
      (element: Element) => element.textContent,
    );
    assertEquals(labels.slice(0, 5), ["0", "125", "250", "375", "499"]);
  });

  // The labels are quarters of the *visible range*, which is not the same as
  // quarters of the far edge once the canvas starts away from the origin. The
  // first `.canvas-coords` is the left-hand (y) edge, the second the top (x).
  it("spaces the labels across the range when the canvas doesn't start at the origin", async () => {
    machine.setVirtualCanvas(-100, 200, 400, 800);
    await settle();
    const labels = qa("canvas-tab .canvas-coords span").map(
      (element: Element) => element.textContent,
    );
    assertEquals(labels.slice(0, 5), ["200", "400", "600", "800", "999"]);
    assertEquals(labels.slice(5, 10), ["-100", "0", "100", "200", "299"]);
  });

  // The pixels and the console text are deliberately outside this: the
  // adapters write them straight to the DOM and no re-render can follow them.
  // What has to survive is the *elements* - a
  // re-render of this component must patch around them rather than rebuild
  // them, or a running program's drawing would vanish whenever the turtle
  // moved.
  it("keeps the same canvas and console elements across a re-render", async () => {
    const canvas = q("canvas-tab canvas");
    const console = q("canvas-tab pre.console");
    console.textContent = "written by the adapter";
    machine.setVirtualCanvas(0, 0, 1000, 1000);
    await settle();
    assert(q("canvas-tab canvas") === canvas);
    assert(q("canvas-tab pre.console") === console);
    assertEquals(console.textContent, "written by the adapter");
  });
});
