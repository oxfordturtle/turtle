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
 * Python's `print()`: multiple positional arguments, `sep=` and `end=`.
 *
 * Three defects, fixed together:
 *
 * 1. `sep=` was rejected outright ("Unknown named argument sep").
 * 2. `end=`'s *value* was discarded - the encoder read a named argument as a
 *    bare "suppress the newline" flag and never encoded its expression, so
 *    `print(x, end='  ')` printed no trailing spaces. Eight example programs
 *    depended on that value.
 * 3. The default separator was "" rather than Python's single space, so
 *    `print('a','b')` gave `ab`.
 *
 * Asserting console output rather than pcode: these are semantics, and the
 * "end='  ' prints two spaces" case in particular is only meaningful as
 * observed output - the old encoder emitted perfectly valid pcode, it just
 * emitted the wrong pcode.
 */
describe("compiler: Python print()", () => {
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
    return output.outputText;
  };

  describe("separators", () => {
    it("defaults to a single space between positional arguments", () => {
      assertEquals(runPython("print('a','b')"), "a b\n");
    });

    it("puts a separator between every adjacent pair, not just the first", () => {
      assertEquals(runPython("print('a','b','c')"), "a b c\n");
    });

    it("sep='' joins with nothing", () => {
      assertEquals(runPython("print('a','b',sep='')"), "ab\n");
    });

    it("sep accepts any string", () => {
      assertEquals(runPython("print('a','b',sep='-')"), "a-b\n");
    });

    it("emits no separator for a single argument", () => {
      assertEquals(runPython("print('a',sep='-')"), "a\n");
    });

    it("accepts a computed separator", () => {
      assertEquals(runPython("x='-'\nprint('a','b',sep=x+x)"), "a--b\n");
    });

    it("converts a non-string positional argument, separator included", () => {
      assertEquals(runPython("print('n =',3)"), "n = 3\n");
    });
  });

  describe("terminators", () => {
    it("defaults to a newline", () => {
      assertEquals(runPython("print('a')"), "a\n");
    });

    it("end='' suppresses the newline", () => {
      assertEquals(runPython("print('a',end='')"), "a");
    });

    it("end's value is written, not just used as a suppress-newline flag", () => {
      // the regression test for defect 2 above
      assertEquals(runPython("print('a',end='  ')"), "a  ");
    });

    it("accepts a computed terminator", () => {
      assertEquals(runPython("x='!'\nprint('a',end=x+x)"), "a!!");
    });
  });

  describe("combinations", () => {
    it("sep and end together, in either order", () => {
      assertEquals(runPython("print('a','b',sep='-',end='!')"), "a-b!");
      assertEquals(runPython("print('a','b',end='!',sep='-')"), "a-b!");
    });

    it("print() with no arguments emits just the terminator", () => {
      assertEquals(runPython("print()"), "\n");
    });

    it("print(end='') with no positional arguments emits nothing", () => {
      assertEquals(runPython("print(end='')"), "");
    });

    it("consecutive end='' calls concatenate on one line", () => {
      assertEquals(
        runPython("print('a',end='')\nprint('b',end='')\nprint('c')"),
        "abc\n",
      );
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

    it("rejects an unknown named argument", () => {
      assertCompilerError("print('a',foo='')", "Unknown named argument foo");
    });

    it("rejects a repeated sep", () => {
      assertCompilerError(
        "print('a',sep='',sep='')",
        "Repeated named argument sep",
      );
    });

    it("rejects a repeated end", () => {
      assertCompilerError(
        "print('a',end='',end='')",
        "Repeated named argument end",
      );
    });

    it("rejects a positional argument after a named one", () => {
      assertCompilerError(
        "print(sep='','a')",
        "Positional argument after named argument",
      );
    });

    it("casts a non-string sep rather than rejecting it", () => {
      // consistent with print's positional arguments, which are cast the
      // same way (that's what makes "print('n =',3)" legal here)
      assertEquals(runPython("print('a','b',sep=3)"), "a3b\n");
    });
  });
});
