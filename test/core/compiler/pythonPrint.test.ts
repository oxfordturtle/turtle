import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import {
  assertCompilerError,
  runSourceToText,
} from "../machine/lib/helpers.ts";

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
  describe("separators", () => {
    it("defaults to a single space between positional arguments", () => {
      assertEquals(runSourceToText("Python", "print('a','b')"), "a b\n");
    });

    it("puts a separator between every adjacent pair, not just the first", () => {
      assertEquals(runSourceToText("Python", "print('a','b','c')"), "a b c\n");
    });

    it("sep='' joins with nothing", () => {
      assertEquals(runSourceToText("Python", "print('a','b',sep='')"), "ab\n");
    });

    it("sep accepts any string", () => {
      assertEquals(
        runSourceToText("Python", "print('a','b',sep='-')"),
        "a-b\n",
      );
    });

    it("emits no separator for a single argument", () => {
      assertEquals(runSourceToText("Python", "print('a',sep='-')"), "a\n");
    });

    it("accepts a computed separator", () => {
      assertEquals(
        runSourceToText("Python", "x='-'\nprint('a','b',sep=x+x)"),
        "a--b\n",
      );
    });

    it("converts a non-string positional argument, separator included", () => {
      assertEquals(runSourceToText("Python", "print('n =',3)"), "n = 3\n");
    });
  });

  describe("terminators", () => {
    it("defaults to a newline", () => {
      assertEquals(runSourceToText("Python", "print('a')"), "a\n");
    });

    it("end='' suppresses the newline", () => {
      assertEquals(runSourceToText("Python", "print('a',end='')"), "a");
    });

    it("end's value is written, not just used as a suppress-newline flag", () => {
      // the regression test for defect 2 above
      assertEquals(runSourceToText("Python", "print('a',end='  ')"), "a  ");
    });

    it("accepts a computed terminator", () => {
      assertEquals(
        runSourceToText("Python", "x='!'\nprint('a',end=x+x)"),
        "a!!",
      );
    });
  });

  describe("combinations", () => {
    it("sep and end together, in either order", () => {
      assertEquals(
        runSourceToText("Python", "print('a','b',sep='-',end='!')"),
        "a-b!",
      );
      assertEquals(
        runSourceToText("Python", "print('a','b',end='!',sep='-')"),
        "a-b!",
      );
    });

    it("print() with no arguments emits just the terminator", () => {
      assertEquals(runSourceToText("Python", "print()"), "\n");
    });

    it("print(end='') with no positional arguments emits nothing", () => {
      assertEquals(runSourceToText("Python", "print(end='')"), "");
    });

    it("consecutive end='' calls concatenate on one line", () => {
      assertEquals(
        runSourceToText(
          "Python",
          "print('a',end='')\nprint('b',end='')\nprint('c')",
        ),
        "abc\n",
      );
    });
  });

  describe("errors", () => {
    it("rejects an unknown named argument", () => {
      assertCompilerError(
        "Python",
        "print('a',foo='')",
        "Unknown named argument foo",
      );
    });

    it("rejects a repeated sep", () => {
      assertCompilerError(
        "Python",
        "print('a',sep='',sep='')",
        "Repeated named argument sep",
      );
    });

    it("rejects a repeated end", () => {
      assertCompilerError(
        "Python",
        "print('a',end='',end='')",
        "Repeated named argument end",
      );
    });

    it("rejects a positional argument after a named one", () => {
      assertCompilerError(
        "Python",
        "print(sep='','a')",
        "Positional argument after named argument",
      );
    });

    it("casts a non-string sep rather than rejecting it", () => {
      // consistent with print's positional arguments, which are cast the
      // same way (that's what makes "print('n =',3)" legal here)
      assertEquals(runSourceToText("Python", "print('a','b',sep=3)"), "a3b\n");
    });
  });
});
