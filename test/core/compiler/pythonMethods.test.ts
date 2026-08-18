import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import { encode, lexify, parse, tokenize } from "@/core/compiler.ts";
import { defaultMachineOptions, run } from "@/core/machine.ts";
import {
  fakeCanvas,
  fakeFiles,
  fakeOutput,
  fakeTimers,
} from "../machine/_fakes.ts";

/**
 * String methods on any string expression, not just a plain variable.
 *
 * `s.lower()` used to work where `'012'.find(x)`, `read(1).upper()`
 * and `s.upper().lower()` all failed at the "." with
 * "Statement must be separated by a semicolon or placed on a new line."
 * The Delphi Turtle System accepts all of them
 * (turtle-pascal/Python_3_Pass1.pas:206-211 loops over ".name" for any
 * depth-0 string expression), and the browser's own example programs worked
 * around the gap by assigning the receiver to a temporary variable first.
 *
 * The variable-receiver cases are re-asserted here as regressions, because
 * this step changed `find.nativeCommand`'s signature and
 * `parseMethodFunctionCall`'s receiver type, which every method call goes
 * through - including the Python list methods.
 */
describe("compiler: Python string methods on arbitrary expressions", () => {
  const runPython = (code: string): string => {
    const pcode = encode(
      parse(lexify(tokenize(code, "Python"), "Python"), "Python"),
    );
    const output = fakeOutput();
    const timers = fakeTimers();
    run(
      pcode,
      defaultMachineOptions,
      timers,
      output,
      fakeCanvas(),
      fakeFiles(),
    );
    timers.flush(); // console writes are queued, not immediate
    return output.outputText.replace(/\n$/, "");
  };

  describe("literal receivers", () => {
    it("'012'.find(s) returns a 0-based index", () => {
      // the exact shape Logic&CS/Hanoi.tpy uses
      assertEquals(runPython("s='2'\nprint(str('012'.find(s)))"), "2");
    });

    it("'012'.find(s) returns -1 when not found", () => {
      assertEquals(runPython("s='9'\nprint(str('012'.find(s)))"), "-1");
    });

    it("a literal takes a no-argument method too", () => {
      assertEquals(runPython("print('ab'.upper())"), "AB");
    });
  });

  describe("computed receivers", () => {
    it("a bracketed compound expression", () => {
      assertEquals(runPython("print(('a'+'b').upper())"), "AB");
    });

    it("a function call's result", () => {
      assertEquals(runPython("print(str(5).find('5'))"), "0");
    });

    it("a slice", () => {
      assertEquals(runPython("s='abcdef'\nprint(s[1:3].upper())"), "BC");
    });
  });

  describe("chaining", () => {
    it("two methods in sequence", () => {
      assertEquals(runPython("s='AbC'\nprint(s.upper().lower())"), "abc");
    });

    it("three methods in sequence", () => {
      assertEquals(
        runPython("s='AbC'\nprint(str(s.upper().lower().find('c')))"),
        "2",
      );
    });

    it("a method on a literal, then another", () => {
      assertEquals(runPython("print('aBc'.lower().upper())"), "ABC");
    });
  });

  describe("regressions on the pre-existing variable-receiver path", () => {
    it("a string variable's method still works", () => {
      assertEquals(runPython("s='AB'\nprint(s.lower())"), "ab");
    });

    it("a list variable's method still resolves to the list command, not the string one", () => {
      // ".index" exists for both strings and lists; find.nativeCommand
      // disambiguates on whether the receiver is a list, which this step
      // changed from a Variable to a boolean
      assertEquals(runPython("x=[1,2,3]\nprint(str(x.index(2)))"), "1");
    });

    it("a list method in statement position still works", () => {
      assertEquals(runPython("x=[1,2]\nx.append(3)\nprint(str(len(x)))"), "3");
    });
  });

  describe("errors", () => {
    const assertCompilerError = (code: string, message: string) => {
      assertThrows(
        () =>
          encode(parse(lexify(tokenize(code, "Python"), "Python"), "Python")),
        Error,
        message,
      );
    };

    it("names the receiver's type when the method doesn't apply to it", () => {
      assertCompilerError(
        "print(str((3).find('x')))",
        'Method ".find" is not defined for type "integer"',
      );
    });

    it("names the method when it doesn't exist at all", () => {
      assertCompilerError(
        "print('a'.nosuch())",
        'Method "nosuch" is not defined',
      );
    });

    it("rejects a method name that isn't an identifier", () => {
      assertCompilerError(
        "s='ab'\nprint(s.(3))",
        "Method name missing after '.'",
      );
    });
  });

  describe("list receivers stay restricted to variables", () => {
    // A list method needs its receiver's heap address, which only a list
    // variable has. Both of these were syntax errors before this step and
    // must stay errors: an early draft let them through the new loop and
    // they compiled to a memory dump rather than a value.
    const assertCompilerError = (code: string, message: string) => {
      assertThrows(
        () =>
          encode(parse(lexify(tokenize(code, "Python"), "Python"), "Python")),
        Error,
        message,
      );
    };

    it("rejects a method on a list literal", () => {
      assertCompilerError(
        "print(str([1,2,3].index(2)))",
        "a list was not expected here",
      );
    });

    it("rejects a method on a list-returning call's result", () => {
      assertCompilerError(
        "x=[1,2,3]\nprint(str(x.copy().index(2)))",
        "a list was not expected here",
      );
    });
  });
});
