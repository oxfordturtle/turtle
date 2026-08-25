import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import { commands, languages } from "@/core/constants.ts";

describe("commands", () => {
  it("has no duplicate command id", () => {
    const ids = commands.map((c) => c.id);
    assertEquals(new Set(ids).size, ids.length);
  });

  it("gives every command a name in at least one language", () => {
    for (const command of commands) {
      const hasAName = languages.some(
        (language) => command.names[language] !== null,
      );
      assert(hasAName, command.id);
    }
  });

  it("marks a command as a function iff it has a return type", () => {
    for (const command of commands) {
      assertEquals(
        command.type,
        command.returns === null ? "procedure" : "function",
        command.id,
      );
    }
  });

  it("assigns every command to one of the twelve known categories", () => {
    for (const command of commands) {
      assert(command.category >= 0 && command.category <= 11, command.id);
    }
  });

  it("gives every parameter a positive length", () => {
    for (const command of commands) {
      for (const parameter of command.parameters) {
        assert(parameter.length >= 1, `${command.id}.${parameter.name}`);
      }
    }
  });

  it("every command's code generator produces an array of numeric pcode values", () => {
    // This is the real behavior test, not just a smoke test: `code` is
    // stored as a function and never called at module-load time, so
    // without this, every one of the ~140 code generators (one per
    // command) is loaded-but-never-invoked, which is why commands.ts once sat
    // at 9.5% function coverage despite being imported everywhere.
    for (const command of commands) {
      const pcode = command.code(0);
      assert(Array.isArray(pcode), command.id);
      for (const value of pcode) {
        assertEquals(typeof value, "number", command.id);
      }
    }
  });

  it("every command's code generator also works with a non-zero turtle address", () => {
    // most code generators ignore their argument, but a few (e.g.
    // oldTurtle) embed it directly in the returned pcode -- call with a
    // second, distinct address too so both code paths run for real.
    for (const command of commands) {
      const pcode = command.code(12345);
      assert(Array.isArray(pcode), command.id);
    }
  });
});
