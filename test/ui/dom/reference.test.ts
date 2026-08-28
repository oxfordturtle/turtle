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

// The commands table on /documentation/reference (src/islands/reference/
// command-table.ts): a category `<select>` and three level checkboxes over a
// table of every command in the current language.
//
// The filter is **ephemeral view state**: this island's own attributes,
// persisted nowhere, so every visit starts where the server rendered it. It
// used to be four stored properties reconciled by a mount effect, which meant
// the table was rendered one way and then corrected - the thing the cookie work
// set out to remove. Dropping the persistence removed the correction outright.
//
// The language, by contrast, is shared and persisted, so the table follows it.

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
  });

  it("adds and removes a level's commands as its box is ticked", async () => {
    const simpleOnly = listed().length;

    levelBox("Intermediate").checked = true;
    await change(levelBox("Intermediate"));
    assert(table().intermediate);
    assert(listed().length > simpleOnly);

    levelBox("Advanced").checked = true;
    await change(levelBox("Advanced"));
    const everything = listed().length;
    assert(everything > simpleOnly);

    levelBox("Simple").checked = false;
    await change(levelBox("Simple"));
    assert(listed().length < everything);
  });

  it("can be filtered down to nothing at all", async () => {
    levelBox("Simple").checked = false;
    await change(levelBox("Simple"));
    assertEquals(listed(), []);
    // the controls are still there to turn back on
    assertEquals(qa("command-table label").length, 3);
  });

  // Ephemeral means ephemeral: a second page load starts where the server
  // rendered it, which is also the only state the server could have rendered.
  // Nothing is stored, so nothing has to be reconciled, so nothing can be seen
  // to change after the page arrives.
  it("starts at the server's defaults again on the next page load", async () => {
    categorySelect().value = "2";
    await change(categorySelect());
    levelBox("Advanced").checked = true;
    await change(levelBox("Advanced"));

    await mountRoute("/documentation/reference", { keepStorage: true });
    assertEquals(categorySelect().value, "0");
    assertFalse(levelBox("Advanced").checked);
    assert(levelBox("Simple").checked);
    assertEquals(table().category, 0);
  });

  // The category is an attribute, so anything outside can write one - a stale
  // link, a hand-edited element, a future call site. An index the list hasn't
  // got falls back to the first category rather than rendering nothing.
  it("falls back to the first category when given one it hasn't got", async () => {
    const first = listed();
    table().category = 999;
    await settle();
    assertEquals(listed(), first);
    assert(listed().length > 0);
  });

  // `<command-table simple />` is the call site's own doing, and Womble forbids
  // a boolean attribute defaulting to true - so this is the one filter value
  // that arrives from the markup rather than from the definition.
  it("takes its starting filter from the markup the server sent", () => {
    assert(q("command-table").hasAttribute("simple"));
    assert(levelBox("Simple").checked);
  });

  // The language is the shared setting, not this island's own, which is what
  // makes the header's `<language-select>` re-render the table.
  it("renames every command when the language changes", async () => {
    const python = listed();
    settings.setSetting("language", "BASIC");
    await settle();
    const basic = listed();
    assert(basic.length > 0);
    assertEquals(basic[0], python[0]?.toUpperCase());
  });
});
