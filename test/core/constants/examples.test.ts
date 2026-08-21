import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import {
  exampleGroups,
  examples,
  extension,
  languages,
} from "@/core/constants.ts";

const examplesRoot = new URL("../../../assets/examples/", import.meta.url);

const fileExists = async (path: URL): Promise<boolean> => {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
};

describe("exampleGroups", () => {
  it("accounts for every example exactly once", () => {
    const total = exampleGroups.reduce(
      (sum, group) => sum + group.examples.length,
      0,
    );
    assertEquals(total, examples.length);
  });

  it("puts every example in the group matching its own .groupId field", () => {
    for (const group of exampleGroups) {
      for (const example of group.examples) {
        assertEquals(example.groupId, group.id, example.id);
      }
    }
  });

  it("has no duplicate group id", () => {
    const ids = exampleGroups.map((g) => g.id);
    assertEquals(new Set(ids).size, ids.length);
  });
});

describe("examples", () => {
  it("has no duplicate example id", () => {
    const ids = examples.map((e) => e.id);
    assertEquals(new Set(ids).size, ids.length);
  });

  it("every example's groupId corresponds to a real example group", () => {
    const groupIds = new Set(exampleGroups.map((g) => g.id));
    for (const example of examples) {
      assert(groupIds.has(example.groupId), example.id);
    }
  });

  // Pre-existing content gaps: `examples.ts` claims language support (a
  // non-null `names[language]`) for these, but no source file actually
  // exists under assets/examples -- confirmed by listing the real tree,
  // not assumed. `examples.ts`'s own gating logic
  // (`src/client/components/system/examples.ts`, `example.names[language]
  // !== null`) means these currently show up in the in-app example menu
  // and 404 when opened (handled gracefully there with an error message,
  // not a crash -- see `openExampleFile` in `src/client/state/index.ts`).
  // This is content debt, not something to silently paper over here by
  // guessing which languages should be nulled out -- that's a product
  // decision (write the missing example vs. delist it) for whoever owns
  // the example library. Keeping this as an explicit, exact allowlist
  // means: a *new* gap fails the test immediately, and *closing* one of
  // these (by adding the file) also fails the test, as a reminder to
  // delete the now-stale entry below.
  const knownMissingExampleFiles = ["C/Cellular/GameOfLifeSetup.tc"].toSorted();

  it("has a real source file on disk for every language it claims to support, other than the known content gaps above", async () => {
    // assets/examples/<Language>/<groupId>/<exampleId>.<extension> is the
    // real on-disk convention (confirmed by inspecting the tree) -- a
    // `names[language]` entry that isn't null is a claim that file exists.
    const missing: string[] = [];
    for (const example of examples) {
      for (const language of languages) {
        if (
          example.names[language] === null ||
          example.names[language] === undefined
        ) {
          continue;
        }
        const path = new URL(
          `${language}/${example.groupId}/${example.id}.${extension[language]}`,
          examplesRoot,
        );
        if (!(await fileExists(path))) {
          missing.push(
            `${language}/${example.groupId}/${example.id}.${
              extension[language]
            }`,
          );
        }
      }
    }
    assertEquals(missing.toSorted(), knownMissingExampleFiles);
  });
});
