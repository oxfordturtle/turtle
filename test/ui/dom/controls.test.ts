import {
  assertNoWombleLogs,
  click,
  coreMachine,
  errors,
  machine,
  mountRoute,
  program,
  q,
  qa,
  resize,
  settings,
  settle,
  type as typeInto,
} from "../lib/setup.ts";
import { diskFetcher, eventually, requests } from "./lib/examples.ts";
import {
  assert,
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

// The system's controls, driven the way a user drives them: the menu commands
// (src/islands/turtle-system/menu/*.ts), the RUN/HALT buttons
// (./turtle-system/transport.ts), the filename bar (./turtle-system/
// filename.ts) and the editor (./turtle-system/editor.ts).
//
// `menus.test.ts` covers the *menu* - which panel is open, and how a command
// dismisses it. This file covers what each command actually does, which is
// always a call into the file memory, the settings or the machine, and is
// asserted there rather than on the link that was clicked.

const openMenu = (menu: string): Promise<void> => click(q(`${menu} > div > a`));

/** Clicks the command whose label contains `label`, in an open submenu. */
const command = async (menu: string, label: string): Promise<void> => {
  const links = qa(`${menu} .system-sub-menu.open a`);
  const link = links.find((a: Element) => a.textContent?.includes(label));
  assert(link, `no "${label}" command in ${menu}`);
  await click(link);
};

const run = async (menu: string, label: string): Promise<void> => {
  await openMenu(menu);
  await command(menu, label);
};

/** Replaces the alert-calling handler `init()` registers with a recording one. */
const captureErrors = (): string[] => {
  const captured: string[] = [];
  errors.setErrorHandler((error) => captured.push((error as Error).message));
  return captured;
};

const editor = (): HTMLTextAreaElement => q("system-editor textarea");

beforeEach(async () => {
  await mountRoute("/");
  program.setFetcher(diskFetcher);
  requests.length = 0;
});

afterEach(() => {
  coreMachine.halt();
  assertNoWombleLogs();
});

describe("the File menu's commands", () => {
  it("starts a new program, blank or from the skeleton", async () => {
    program.setCode("x = 1");
    await run("file-menu", "New program");
    assertEquals(program.getFiles().length, 2);
    assertEquals(program.getCode(), "");

    await run("file-menu", "Skeleton program");
    assertStringIncludes(program.getCode(), "blot(var1)");
  });

  // The picker itself is the browser's; what this asserts is that the command
  // reaches the file memory's opener at all.
  it("asks for a program to open", async () => {
    let picked = false;
    const original = document.defaultView!.HTMLInputElement.prototype.click;
    document.defaultView!.HTMLInputElement.prototype.click = function (
      this: HTMLInputElement,
    ) {
      if (this.type === "file") picked = true;
    };
    try {
      await run("file-menu", "Open program");
      assert(picked);
    } finally {
      document.defaultView!.HTMLInputElement.prototype.click = original;
    }
  });

  it("saves the program, which is a download", async () => {
    const saved: string[] = [];
    const original = document.defaultView!.HTMLAnchorElement.prototype.click;
    // Only the download anchor is intercepted: every menu command is an
    // `<a>` too, and swallowing those would leave the menu shut.
    document.defaultView!.HTMLAnchorElement.prototype.click = function (
      this: HTMLAnchorElement,
    ) {
      if (!this.hasAttribute("download")) return original.call(this);
      saved.push(this.getAttribute("download") ?? "");
    };
    URL.createObjectURL = () => "blob:saved";
    try {
      program.renameFile("mine");
      await run("file-menu", "Save program as ...");
      assertEquals(saved, ["mine.tpy"]);
    } finally {
      document.defaultView!.HTMLAnchorElement.prototype.click = original;
    }
  });

  it("closes the program", async () => {
    program.setCode("x = 1");
    program.newFile();
    await run("file-menu", "Close program");
    assertEquals(program.getFiles().length, 1);
    assertEquals(program.getCode(), "x = 1");
  });

  // Everything the online system doesn't do reports it rather than looking
  // enabled and doing nothing.
  it("reports the commands the online system doesn't have", async () => {
    const captured = captureErrors();
    await openMenu("file-menu");
    await command("file-menu", "Print program");
    assertEquals(captured, [
      "This feature has not yet been implemented in the online system.",
    ]);
  });
});

describe("the Edit menu's commands", () => {
  it("stores a copy of the program, and restores it", async () => {
    program.setCode("first version");
    await run("edit-menu", "Store copy of program");
    program.setCode("second version");
    await run("edit-menu", "Restore previous version");
    assertEquals(program.getCode(), "first version");
    // and the editor's textarea followed, which is its own subscription
    assertEquals(editor().value, "first version");
  });

  // "Select All" is the one command that has to reach *into* a component:
  // only the editor can select its own textarea. See ../commands.ts.
  it("selects the whole program in the editor", async () => {
    program.setCode("some code here");
    await settle();
    await run("edit-menu", "Select All");
    assertEquals(editor().selectionStart, 0);
    assertEquals(editor().selectionEnd, "some code here".length);
  });

  // Undo, Redo, Cut, Copy and Paste have never done anything in the browser -
  // see src/islands/turtle-system/editing.ts and TODO.md 1.3. The keyboard
  // shortcuts work on the textarea, so what the menu says is exactly that.
  it("sends the user to the keyboard shortcut for the five editing commands", async () => {
    const captured = captureErrors();
    // The menu stays up for a command that isn't implemented (see
    // menus.test.ts), so it is opened once and all five are clicked in it.
    await openMenu("edit-menu");
    for (const label of ["Undo", "Redo", "Cut", "Copy", "Paste"]) {
      await command("edit-menu", label);
    }
    assertEquals(captured.length, 5);
    for (const message of captured) {
      assertEquals(
        message,
        "This command is not available in the online system - use the keyboard shortcut instead.",
      );
    }
  });
});

describe("the Compile menu's command", () => {
  it("compiles the current program", async () => {
    program.setCode("print('hi')");
    await run("compile-menu", "Compile to Turtle Machine PCode");
    assert(program.getPcode().length > 0);
    assert(program.getCurrentFile()?.compiled);
  });
});

describe("the Run menu's commands", () => {
  it("runs the program", async () => {
    program.setCode("print('hi')");
    await run("run-menu", "Run program");
    await eventually(
      () => q("turtle-system pre.console").innerHTML === "hi\n",
      "the program's output",
    );
  });

  it("pauses and halts a running program", async () => {
    program.setCode("for i in range(200000):\n  x = i\n");
    await run("run-menu", "Run program");
    assert(coreMachine.isRunning());

    await run("run-menu", "Pause program");
    assertEquals(machine.getStatus(), { running: true, playing: false });

    await run("run-menu", "Halt program");
    assertEquals(machine.getStatus(), { running: false, playing: false });
  });

  it("resets the canvas, console and output", async () => {
    const consolePane = q("turtle-system pre.console") as HTMLPreElement;
    consolePane.innerHTML = "old text";
    machine.setTurtleProperty("x", 123);
    await settle();

    await run("run-menu", "Reset Canvas, Console and Output");
    assertEquals(consolePane.innerHTML, "");
    assertEquals(machine.getTurtle().x, 500);
  });
});

describe("the Examples menu's commands", () => {
  it("opens the example that was clicked", async () => {
    await openMenu("examples-menu");
    await click(qa("examples-menu > div > div > a")[0]);
    const link = qa("examples-menu a[data-example]")[0];
    const id = link.getAttribute("data-example");
    await click(link);
    await eventually(
      () => program.getCurrentFile()?.example === id,
      `${id} to open`,
    );
    assertEquals(requests.length, 1);
  });
});

describe("the RUN and HALT buttons", () => {
  const transport = (title: string): Element =>
    qa("system-transport button").find(
      (button: Element) => button.getAttribute("title") === title,
    );

  it("run, pause and halt, and follow the machine's state", async () => {
    // HALT is disabled until something is running
    assert(transport("HALT").hasAttribute("disabled"));
    assertEquals(q("system-transport i").className, "fa fa-play");

    program.setCode("for i in range(200000):\n  x = i\n");
    await click(transport("RUN"));
    assert(coreMachine.isRunning());
    // the RUN button is the pause button while something is playing
    assertEquals(q("system-transport i").className, "fa fa-pause");
    assertFalse(transport("HALT").hasAttribute("disabled"));

    await click(transport("RUN"));
    assertEquals(machine.getStatus(), { running: true, playing: false });
    assertEquals(q("system-transport i").className, "fa fa-play");

    await click(transport("HALT"));
    assertEquals(machine.getStatus(), { running: false, playing: false });
    assert(transport("HALT").hasAttribute("disabled"));
  });
});

describe("the turtle property displays", () => {
  it("shows a raised pen's thickness in brackets", async () => {
    machine.setTurtleProperty("t", 3);
    await settle();
    assertEquals(q("turtle-properties .turtle-pen").textContent, "3");
    // a raised pen is a negative thickness
    machine.setTurtleProperty("t", -3);
    await settle();
    assertEquals(q("turtle-properties .turtle-pen").textContent, "(3)");
  });
});

describe("the filename bar", () => {
  const chooser = (): HTMLSelectElement => q("system-filename select");
  const nameInput = (): HTMLInputElement => q("system-filename input");

  it("lists every open file, numbered and labelled by language", async () => {
    program.setCode("first");
    program.renameFile("one");
    program.openFile("two.tpas", "PROGRAM two; BEGIN END.");
    await settle();
    assertEquals(
      qa("system-filename option").map((option: Element) =>
        option.textContent.trim(),
      ),
      ["01 [Python] one", "02 [Pascal] two"],
    );
    // and the `<select>` shows the current one
    assertEquals(chooser().value, "1");
  });

  it("switches file when another is chosen", async () => {
    program.setCode("first");
    program.newFile();
    program.setCode("second");
    await settle();
    chooser().value = "0";
    chooser().dispatchEvent(
      new document.defaultView!.Event("change", {
        bubbles: true,
      }),
    );
    await settle();
    assertEquals(program.getCode(), "first");
    assertEquals(program.getCurrentFileIndex(), 0);
  });

  it("renames the current file as it is typed", async () => {
    await typeInto(nameInput(), "renamed");
    nameInput().dispatchEvent(
      new document.defaultView!.Event("change", {
        bubbles: true,
      }),
    );
    await settle();
    assertEquals(program.getFilename(), "renamed");
  });

  it("closes the current file from its own button", async () => {
    program.setCode("x = 1");
    program.newFile();
    await settle();
    await click(q("system-filename button"));
    assertEquals(program.getFiles().length, 1);
    assertEquals(program.getCode(), "x = 1");
  });
});

describe("the editor", () => {
  it("puts what is typed into the file memory, and highlights it", async () => {
    await typeInto(editor(), "print('hi')");
    assertEquals(program.getCode(), "print('hi')");
    assertStringIncludes(
      q("system-editor pre code").innerHTML,
      '<span class="command">print</span>',
    );
    // one line number per line
    await typeInto(editor(), "print('hi')\nx = 1\ny = 2");
    assertEquals(qa("system-editor .line-numbers li").length, 3);
  });

  // Tab inserts two spaces rather than leaving the field, and puts the caret
  // after them - the value goes through the store and comes back, so the
  // selection has to survive the round trip.
  it("inserts two spaces for Tab, keeping the caret after them", async () => {
    await typeInto(editor(), "ab");
    editor().selectionStart = 1;
    editor().selectionEnd = 1;
    const event = new document.defaultView!.KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    editor().dispatchEvent(event);
    await settle();
    assert(event.defaultPrevented);
    assertEquals(program.getCode(), "a  b");
    assertEquals(editor().value, "a  b");
    assertEquals(editor().selectionStart, 3);
    assertEquals(editor().selectionEnd, 3);
  });

  it("scrolls the code back to the left margin on Enter", async () => {
    const wrapper = q("system-editor .code-wrapper") as HTMLElement;
    wrapper.scrollLeft = 40;
    editor().dispatchEvent(
      new document.defaultView!.KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    await settle();
    assertEquals(wrapper.scrollLeft, 0);
  });

  it("leaves any other key to the browser", async () => {
    await typeInto(editor(), "ab");
    const event = new document.defaultView!.KeyboardEvent("keydown", {
      key: "a",
      bubbles: true,
      cancelable: true,
    });
    editor().dispatchEvent(event);
    await settle();
    assertFalse(event.defaultPrevented);
    assertEquals(program.getCode(), "ab");
  });

  // The one thing on screen that can't be computed from state: how wide the
  // highlighted code is has to be measured, and fed back to the textarea.
  it("takes the textarea's width from the highlighted code's", () => {
    const pre = q("system-editor pre") as HTMLPreElement;
    Object.defineProperty(pre, "scrollWidth", {
      configurable: true,
      value: 640,
    });
    resize();
    assertEquals(editor().style.width, "640px");
  });

  // Keeps the line numbers level with the code, and stops a small horizontal
  // scroll leaving the first column half hidden.
  it("keeps the line numbers level, and snaps a small scroll back", async () => {
    const wrapper = q("system-editor .code-wrapper") as HTMLElement;
    const lineNumbers = q("system-editor .line-numbers") as HTMLElement;
    const scroll = () =>
      wrapper.dispatchEvent(new document.defaultView!.Event("scroll"));

    wrapper.scrollTop = 25;
    wrapper.scrollLeft = 40;
    scroll();
    assertEquals(lineNumbers.scrollTop, 25);
    assertEquals(wrapper.scrollLeft, 40);

    wrapper.scrollLeft = 5;
    scroll();
    assertEquals(wrapper.scrollLeft, 0);
    await settle();
  });

  it("takes its font from the settings", async () => {
    settings.setSetting("editorFontSize", 18);
    await settle();
    assertStringIncludes(
      q("system-editor .editor").getAttribute("style"),
      "font-size: 18px",
    );
  });
});
