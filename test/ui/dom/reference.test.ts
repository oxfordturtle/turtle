import {
  assertNoWombleLogs,
  change,
  mountRoute,
  q,
  qa,
  settings,
  settle,
} from "../lib/setup.ts";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

const { commandCategories } = await import("@/core/constants.ts");

// The commands table on /documentation/reference (src/islands/reference/
// command-table.ts): a category `<select>` and three level checkboxes over a
// table of every command in the current language.
//
// The filter is the one settings group no other component on any page reads,
// so it is this island's own state rather than the shared store's - but it
// still persists to the same `sessionStorage` keys it always has, and is
// restored from them on mount. That round trip is what most of this covers:
// a control whose live value is set from outside itself.

// deno-lint-ignore no-explicit-any
const table = (): any => q("command-table");

const categorySelect = (): HTMLSelectElement => q("command-table select");

const levelBox = (label: string): HTMLInputElement => {
  const found = qa("command-table label").find((element: Element) =>
    element.textContent?.includes(label),
  );
  assert(found, `no "${label}" checkbox`);
  return found.querySelector("input");
};

/** the command names the table is listing, in order */
const listed = (): string[] =>
  qa("command-table tbody tr td:first-child").map((cell: Element) =>
    cell.textContent.trim(),
  );

beforeEach(async () => {
  await mountRoute("/documentation/reference");
});

// Rule 6: every test ends with Womble having reported nothing.
afterEach(assertNoWombleLogs);

describe("the commands table", () => {
  // `<command-table simple />` at the call site: every Womble boolean starts
  // false, so the one that should start on says so in the markup.
  it("starts on the first category, showing the simple commands only", () => {
    assertEquals(categorySelect().value, "0");
    assert(levelBox("Simple").checked);
    assertFalse(levelBox("Intermediate").checked);
    assertFalse(levelBox("Advanced").checked);
    assert(listed().length > 0);
    assertEquals(qa("command-table thead th").length, 4);
  });

  it("lists another category when one is chosen", async () => {
    const first = listed();
    categorySelect().value = "1";
    await change(categorySelect());
    assertEquals(table().category, 1);
    assert(listed().length > 0);
    assertFalse(listed().every((name, index) => name === first[index]));
    assertEquals(sessionStorage.getItem("commandsCategoryIndex"), "1");
  });

  it("adds and removes a level's commands as its box is ticked", async () => {
    const simpleOnly = listed().length;

    levelBox("Intermediate").checked = true;
    await change(levelBox("Intermediate"));
    assert(table().intermediate);
    assert(listed().length > simpleOnly);
    assertEquals(sessionStorage.getItem("showIntermediateCommands"), "true");

    levelBox("Advanced").checked = true;
    await change(levelBox("Advanced"));
    const everything = listed().length;
    assert(everything > simpleOnly);

    levelBox("Simple").checked = false;
    await change(levelBox("Simple"));
    assert(listed().length < everything);
    assertEquals(sessionStorage.getItem("showSimpleCommands"), "false");
  });

  it("can be filtered down to nothing at all", async () => {
    levelBox("Simple").checked = false;
    await change(levelBox("Simple"));
    assertEquals(listed(), []);
    // the controls are still there to turn back on
    assertEquals(qa("command-table label").length, 3);
  });

  // The whole point of the property bindings: a second page load restores the
  // filter from the session, which has to reach the controls' *live* state
  // and not just their reset defaults.
  it("comes back from the session on the next page load", async () => {
    categorySelect().value = "2";
    await change(categorySelect());
    levelBox("Advanced").checked = true;
    await change(levelBox("Advanced"));

    await mountRoute("/documentation/reference", { keepSession: true });
    assertEquals(categorySelect().value, "2");
    assert(levelBox("Advanced").checked);
    assertEquals(table().category, 2);
  });

  // The stored index and the list of categories are independent, so a session
  // written by an older build can name a category this one hasn't got.
  it("falls back to the first category when the stored one is gone", async () => {
    sessionStorage.setItem(
      "commandsCategoryIndex",
      String(commandCategories.length + 10),
    );
    await mountRoute("/documentation/reference", { keepSession: true });
    // the select shows the first category, and the table lists its commands
    assertEquals(categorySelect().value, "0");
    assert(listed().length > 0);
  });

  // The language is the shared setting, not this island's own, which is what
  // makes the header's `<language-select>` re-render the table.
  it("renames every command when the language changes", async () => {
    const python = listed();
    settings.setSetting("language", "BASIC");
    await settle();
    const basic = listed();
    assert(basic.length > 0);
    assertEquals(basic[0], python[0].toUpperCase());
  });
});
