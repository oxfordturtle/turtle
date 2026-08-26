import {
  assertNoWombleLogs,
  change,
  click,
  machine,
  mountRoute,
  program,
  q,
  qa,
  settings,
  settle,
} from "../lib/setup.ts";
import {
  assert,
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

// The six data-display tab panes plus the Run Settings tab. Each test drives
// the stores the pane follows - the program store with a really-compiled
// fixture, the machine store with a memory image, the settings store with the
// display options - and asserts the *content* the pane renders from them:
// actual pcode cells, actual usage counts, actual lexemes and comments.

// The fixture every compiled-state test uses. In Python (the default
// language): a comment for the Comments tab, two `print`s for a usage count
// above one spanning two lines, a string literal for the PCode tab's
// string-assembly branch, and an assignment for an integer literal and an
// operator lexeme.
const FIXTURE = "# greet\nprint('hi')\nx = 1\nprint('hi')\n";

// deno-lint-ignore no-explicit-any
const system = (): any => q("turtle-system");

const showTab = async (tab: string): Promise<void> => {
  system().tab = tab;
  await settle();
};

const compileFixture = async (): Promise<void> => {
  program.setCode(FIXTURE);
  program.compileCurrentFile();
  await settle();
};

/** one line of the pcode listing, as the text of its cells */
const pcodeCells = (index: number): string[] =>
  qa("div", qa("pcode-tab ol.pcode li")[index]).map(
    (cell: Element) => cell.textContent,
  );

/** a table's body rows, each as its cells' (th and td) text */
const bodyRows = (table: Element): string[][] =>
  qa("tbody tr", table).map((row: Element) =>
    qa("th, td", row).map((cell: Element) => cell.textContent),
  );

beforeEach(async () => {
  await mountRoute("/");
  // machine mode is the one every pane under test belongs to (the Run
  // Settings tab belongs to no other); modes.test.ts covers the hiding
  settings.setSetting("mode", "machine");
  await settle();
});

// Rule 6: every test ends with Womble having reported nothing.
afterEach(assertNoWombleLogs);

describe("the pcode tab", () => {
  it("lists nothing before compilation", async () => {
    await showTab("pcode");
    assertEquals(qa("pcode-tab ol.pcode li").length, 0);
    // the display options are offered even with nothing to display
    assertEquals(qa("pcode-tab setting-flag").length, 4);
  });

  it("assembles the compiled program into mnemonics, in decimal by default", async () => {
    await compileFixture();
    await showTab("pcode");
    // one <li> per line of pcode
    assertEquals(qa("pcode-tab ol.pcode li").length, 6);
    // `print('hi')`: load the string (a length and its character codes,
    // which assembly renders as the characters), write it, newline
    assertEquals(pcodeCells(2), [
      "LSTR",
      "2",
      "h",
      "i",
      "WRIT",
      "NEWL",
      "HCLR",
      "",
      "",
      "",
    ]);
    // `x = 1`: load the integer, store it as a global
    assertEquals(pcodeCells(3), [
      "LDIN",
      "1",
      "STVG",
      "19",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    // every line is padded out to whole rows of ten
    for (const line of qa("pcode-tab ol.pcode li")) {
      assertEquals(qa("div", line).length % 10, 0);
    }
  });

  it("shows raw machine code when the assembler flag is cleared", async () => {
    await compileFixture();
    await showTab("pcode");
    settings.setSetting("assembler", false);
    await settle();
    assertEquals(pcodeCells(2), [
      "166",
      "2",
      "104",
      "105",
      "203",
      "204",
      "190",
      "",
      "",
      "",
    ]);
  });

  it("shows machine code in hexadecimal when the decimal flag is cleared too", async () => {
    await compileFixture();
    await showTab("pcode");
    settings.setSetting("assembler", false);
    settings.setSetting("decimal", false);
    await settle();
    assertEquals(pcodeCells(2), [
      "A6",
      "2",
      "68",
      "69",
      "CB",
      "CC",
      "BE",
      "",
      "",
      "",
    ]);
  });

  it("renders assembler arguments in hexadecimal when asked", async () => {
    await compileFixture();
    await showTab("pcode");
    settings.setSetting("decimal", false);
    await settle();
    // `x = 1`: the mnemonics stay words, the arguments go hex (19 -> 13)
    assertEquals(pcodeCells(3).slice(0, 4), ["LDIN", "1", "STVG", "13"]);
  });

  // The four display options are `setting-flag` controls: a pair of radios
  // per boolean setting, where which boolean each radio means is fixed markup
  // rather than something read off the control.
  it("switches between assembly and machine code from its own radios", async () => {
    await compileFixture();
    await showTab("pcode");
    const flag = (option: string): HTMLInputElement =>
      qa("pcode-tab setting-flag")
        .find((element: Element) => element.getAttribute("option") === option)
        .querySelector("input");

    flag("machine").checked = true;
    await change(flag("machine"));
    assertFalse(settings.getSettings().assembler);
    assertEquals(pcodeCells(3).slice(0, 2), ["160", "1"]);

    flag("assembler").checked = true;
    await change(flag("assembler"));
    assert(settings.getSettings().assembler);
    assertEquals(pcodeCells(3).slice(0, 2), ["LDIN", "1"]);
  });

  // The radio that was just deselected announces nothing of its own, and must
  // not write its value if it ever did.
  it("ignores a display radio that isn't the one just selected", async () => {
    await showTab("pcode");
    const machine = qa("pcode-tab setting-flag")
      .find((element: Element) => element.getAttribute("option") === "machine")
      .querySelector("input");
    machine.checked = false;
    await change(machine);
    assert(settings.getSettings().assembler);
  });

  // A .tmx export carries its pcode with it rather than deriving it, so the
  // listing can be handed pcode the encoder would never produce: an opcode
  // number with no mnemonic, and missing or null arguments. The pane marks
  // the holes rather than crashing.
  it("marks unknown opcodes and missing arguments from an imported export", async () => {
    program.openFile(
      "weird.tmx",
      JSON.stringify({
        language: "Python",
        name: "weird",
        code: "x = 1",
        usage: [],
        pcode: [[999, null], [160], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
      }),
    );
    await settle();
    await showTab("pcode");
    // 999 is no mnemonic, so it stays a number; null is no code at all
    assertEquals(pcodeCells(0).slice(0, 2), ["999", ":("]);
    // LDIN takes an argument the line doesn't have
    assertEquals(pcodeCells(1).slice(0, 2), ["LDIN", ":("]);
    // the same holes in machine code
    settings.setSetting("assembler", false);
    await settle();
    assertEquals(pcodeCells(0).slice(0, 2), ["999", ":("]);
    // a line of exactly ten needs no padding
    assertEquals(pcodeCells(2), [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
  });
});

describe("the memory tab", () => {
  it("shows the stack and heap headed by their ten offsets, empty before any dump", async () => {
    await showTab("memory");
    const tables = qa("memory-tab table");
    assertEquals(tables.length, 2);
    const headers = qa("thead td, thead th", tables[0]).map(
      (cell: Element) => cell.textContent,
    );
    assertEquals(headers, [
      "Stack",
      "+0",
      "+1",
      "+2",
      "+3",
      "+4",
      "+5",
      "+6",
      "+7",
      "+8",
      "+9",
    ]);
    assertEquals(qa("thead td", tables[1])[0].textContent, "Heap");
    assertEquals(bodyRows(tables[0]), []);
    assertEquals(bodyRows(tables[1]), []);
  });

  it("displays a dump in rows of ten, each addressed from its base", async () => {
    machine.setMemory({
      stack: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      heap: [7, 8, 9],
      heapBase: 100,
    });
    await settle();
    await showTab("memory");
    const tables = qa("memory-tab table");
    // the stack starts at address 0, wrapping after ten bytes
    assertEquals(bodyRows(tables[0]), [
      ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
      ["10", "11", "12"],
    ]);
    // the heap's addresses start at its base
    assertEquals(bodyRows(tables[1]), [["100", "7", "8", "9"]]);
  });

  it("replaces the display with the machine's current state on request", async () => {
    machine.setMemory({ stack: [42], heap: [], heapBase: 9 });
    await settle();
    await showTab("memory");
    assertEquals(bodyRows(qa("memory-tab table")[0]), [["0", "42"]]);
    // the machine has never run, so its current state is no memory at all -
    // the button asks the machine, not the store
    await click(q("memory-tab button"));
    assertEquals(bodyRows(qa("memory-tab table")[0]), []);
    assertEquals(bodyRows(qa("memory-tab table")[1]), []);
  });
});

describe("the usage tab", () => {
  it("lists nothing before compilation", async () => {
    await showTab("usage");
    assertEquals(qa("usage-tab tbody tr").length, 0);
  });

  it("lists each expression with its level, count and lines, under a category total", async () => {
    await compileFixture();
    await showTab("usage");
    const rows = qa("usage-tab tbody tr");
    // one category: its heading, one expression, its total
    assertEquals(rows.length, 3);
    assertEquals(rows[0].textContent.trim(), "String operations");
    const expression = qa("td", rows[1]).map((cell: Element) =>
      cell.textContent.trim(),
    );
    assertEquals(expression, ["print", "1", "2", "2, 4"]);
    // the expression is syntax-highlighted as the current language's code
    assertStringIncludes(
      qa("td code", rows[1])[0].innerHTML,
      '<span class="command">print</span>',
    );
    const total = qa("td", rows[2]).map((cell: Element) =>
      cell.textContent.trim(),
    );
    assertEquals(total, ["", "TOTAL:", "2", ""]);
  });
});

describe("the syntax tab", () => {
  it("lists nothing before compilation, even with code in the editor", async () => {
    program.setCode(FIXTURE);
    await settle();
    await showTab("syntax");
    assertEquals(qa("syntax-tab tbody tr").length, 0);
  });

  it("lists every lexeme except the comments, numbered from one", async () => {
    await compileFixture();
    await showTab("syntax");
    const rows = qa("syntax-tab tbody tr").map((row: Element) =>
      qa("td", row).map((cell: Element) => cell.textContent.trim()),
    );
    // the fixture's fifteen lexemes, with its one comment filtered out
    assertEquals(rows.length, 15);
    assertFalse(rows.some((row: string[]) => row[2]!.includes("greet")));
    // a lexeme with no subtype: the comment line's newline
    assertEquals(rows[0], ["1", "1", "[newline]", "newline"]);
    // one with a subtype, highlighted as code
    assertEquals(rows[1], ["2", "2", "print", "identifier (identifier)"]);
    assertStringIncludes(
      qa("code", qa("syntax-tab tbody tr")[1])[0].innerHTML,
      '<span class="command">print</span>',
    );
    // the string literal and the assignment operator, subtyped
    assertEquals(rows[3], ["4", "2", "'hi'", "literal (string)"]);
    assertEquals(rows[7], ["8", "3", "=", "operator (asgn)"]);
  });
});

describe("the comments tab", () => {
  it("lists nothing before compilation", async () => {
    await showTab("comments");
    assertEquals(qa("comments-tab tbody tr").length, 0);
  });

  it("lists each comment with its line, stripped of the comment marker", async () => {
    await compileFixture();
    await showTab("comments");
    const rows = qa("comments-tab tbody tr").map((row: Element) =>
      qa("td", row).map((cell: Element) => cell.textContent.trim()),
    );
    assertEquals(rows, [["1", "greet"]]);
  });
});

describe("the variables tab", () => {
  it("says the display isn't available yet", async () => {
    await showTab("variables");
    assertStringIncludes(
      q("variables-tab p").textContent,
      "not yet available in the online system",
    );
  });
});

describe("the run settings tab", () => {
  const inputs = (): HTMLInputElement[] => qa("options-tab input");

  it("renders the four run settings at their current values", async () => {
    await showTab("options");
    assertEquals(
      inputs().map((input) => input.value),
      ["4", "100000", "60", "50000"],
    );
  });

  it("puts an edited number into the settings store, as a number", async () => {
    await showTab("options");
    inputs()[0]!.value = "7";
    await change(inputs()[0]!);
    assertEquals(settings.getSettings().drawCountMax, 7);
    inputs()[3]!.value = "20000";
    await change(inputs()[3]!);
    assertEquals(settings.getSettings().stackSize, 20000);
  });

  it("follows a settings change made elsewhere", async () => {
    await showTab("options");
    settings.setSetting("codeCountMax", 123);
    await settle();
    assertEquals(inputs()[1]?.value, "123");
  });
});
