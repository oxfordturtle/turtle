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
 * Python string slicing, including the open-ended forms.
 *
 * `s[a:b]` already worked; `s[a:]`, `s[:b]` and `s[:]` did not, and the
 * browser's example programs spelled them with a non-Python
 * `s.substring(start, length)` as a result (the Delphi Turtle System's
 * copies of the same examples use real slices throughout - see
 * docs/delphi-python-example-discrepancies.md).
 *
 * These go through the whole pipeline and assert the *printed string*
 * rather than the emitted pcode: the encoding is a stack-juggling sequence
 * around PCode.copy whose contract is documented in
 * encoder/expressions/variableValue.ts, and asserting the opcode sequence
 * would lock in that juggling rather than the behaviour it exists to
 * produce. The bound-defaulting rules (omitted start = 0, omitted end =
 * len(s)) are exactly what a behavioural test pins down best.
 */
describe("compiler: Python string slices", () => {
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

  const sliceOf = (expression: string): string =>
    runPython(`s='abcdef'\nprint(${expression})`).replace(/\n$/, "");

  const assertCompilerError = (code: string, message: string) => {
    assertThrows(
      () => encode(parse(lexify(tokenize(code, "Python"), "Python"), "Python")),
      Error,
      message,
    );
  };

  describe("both bounds given (pre-existing behaviour)", () => {
    it("takes the half-open range [a, b)", () => {
      assertEquals(sliceOf("s[1:3]"), "bc");
    });

    it("is empty when the bounds are equal", () => {
      assertEquals(sliceOf("s[2:2]"), "");
    });
  });

  describe("omitted end bound", () => {
    it("runs to the end of the string", () => {
      assertEquals(sliceOf("s[2:]"), "cdef");
    });

    it("returns the whole string for s[0:]", () => {
      assertEquals(sliceOf("s[0:]"), "abcdef");
    });

    it("returns empty when the start is exactly the length", () => {
      assertEquals(sliceOf("s[len(s):]"), "");
    });

    it("returns empty when the start is past the end, rather than erroring", () => {
      // b-a goes negative here; PCode.copy's underlying substr yields "",
      // matching Python rather than throwing
      assertEquals(sliceOf("s[99:]"), "");
    });

    it("accepts a computed start bound", () => {
      assertEquals(sliceOf("s[1+2:]"), "def");
    });

    it("evaluates the base string only for its own length, not the caller's", () => {
      // the omitted end re-pushes the base variable to apply PCode.slen to
      // it - this catches a base/target mix-up if that re-push ever grabs
      // the wrong variable
      assertEquals(
        runPython("s='abc'\nt='wxyz'\nprint(t[1:])").replace(/\n$/, ""),
        "xyz",
      );
    });
  });

  describe("omitted start bound", () => {
    it("starts from index 0", () => {
      assertEquals(sliceOf("s[:3]"), "abc");
    });

    it("is empty for s[:0]", () => {
      assertEquals(sliceOf("s[:0]"), "");
    });

    it("accepts a computed end bound", () => {
      assertEquals(sliceOf("s[:len(s)-1]"), "abcde");
    });
  });

  describe("both bounds omitted", () => {
    it("returns the whole string", () => {
      assertEquals(sliceOf("s[:]"), "abcdef");
    });

    it("returns empty for an empty string", () => {
      assertEquals(runPython("s=''\nprint(s[:])").replace(/\n$/, ""), "");
    });
  });

  describe("interaction with the plain character index", () => {
    it("s[i] is still a character, not a slice", () => {
      assertEquals(sliceOf("s[1]"), "b");
    });

    it("a slice of length 1 and a character index agree", () => {
      assertEquals(sliceOf("s[1:2]"), sliceOf("s[1]"));
    });
  });

  describe("errors", () => {
    it("rejects a step slice with a message naming the step", () => {
      assertCompilerError("s='abcdef'\nprint(s[1:5:2])", "Slices with a step");
    });

    it("rejects a step slice with the start omitted too", () => {
      assertCompilerError("s='abcdef'\nprint(s[::2])", "Slices with a step");
    });

    it("rejects a non-integer bound", () => {
      assertCompilerError("s='abcdef'\nprint(s[:'x'])", "Type error");
    });

    it("reports a missing closing bracket after an open-ended slice", () => {
      assertCompilerError("s='abcdef'\nprint(s[1:", "Closing bracket");
    });
  });

  /**
   * Indexing and slicing the *string element of a list*. Neither form used to
   * work: `p[0][1:2]` was a compiler error, and
   * `p[0][1]` silently mis-compiled (the trailing `[1]` was swallowed as a
   * separate list *literal* argument wherever the surrounding syntax
   * allowed one, so `print(p[0][1])` printed the whole element followed by
   * a dump of an anonymous one-element list).
   */
  describe("on a string element of a list", () => {
    const listSliceOf = (expression: string): string =>
      runPython(`p=['abcdef','xy']\nprint(${expression})`).replace(/\n$/, "");

    it("slices with both bounds given", () => {
      assertEquals(listSliceOf("p[0][1:3]"), "bc");
    });

    it("slices with the end bound omitted", () => {
      assertEquals(listSliceOf("p[0][2:]"), "cdef");
    });

    it("slices with the start bound omitted", () => {
      assertEquals(listSliceOf("p[0][:3]"), "abc");
    });

    it("slices with both bounds omitted", () => {
      assertEquals(listSliceOf("p[0][:]"), "abcdef");
    });

    it("indexes a single character", () => {
      assertEquals(listSliceOf("p[0][1]"), "b");
    });

    it("applies the subscript to the indexed element, not the first one", () => {
      // catches a base/element mix-up: a base built from the variable alone
      // (rather than the variable plus its list indexes) would slice p[0]
      // here whatever index was written
      assertEquals(listSliceOf("p[1][1:]"), "y");
    });

    it("accepts len() of the same element as a bound (Hanoi's own shape)", () => {
      // assets/_tmp_ported_examples/Logic&CS/106-Hanoi does
      // "pile[start][1: len(pile[start])]"
      assertEquals(listSliceOf("p[0][1: len(p[0])]"), "bcdef");
    });

    it("accepts a computed element index", () => {
      assertEquals(
        runPython("p=['abcdef','xy']\ni=1\nprint(p[i-1][2:4])").replace(
          /\n$/,
          "",
        ),
        "cd",
      );
    });

    it("reaches the string inside a list of lists", () => {
      assertEquals(
        runPython("q=[['ab','cd'],['ef','gh']]\nprint(q[1][0][1:])").replace(
          /\n$/,
          "",
        ),
        "f",
      );
    });

    it("still reads a whole element when no subscript follows", () => {
      assertEquals(listSliceOf("p[1]"), "xy");
    });

    it("leaves a chained method call on the element working", () => {
      assertEquals(
        runPython("p=['abcdef','xy']\nprint(str(p[0].find('c')))").replace(
          /\n$/,
          "",
        ),
        "2",
      );
    });

    it("rejects subscripting an element of a list of integers", () => {
      assertCompilerError("n=[1,2,3]\nx=n[0][1]", "not a list of strings");
    });

    it("rejects slicing an element of a list of integers", () => {
      assertCompilerError("n=[1,2,3]\nx=n[0][1:2]", "not a list of strings");
    });

    it("rejects subscripting a sublist of a list of lists of integers", () => {
      // "q[0]" is still a list here, so "q[0][1]" is an ordinary second
      // list index (which works); it is the *third* that has nothing left
      // to index
      assertCompilerError(
        "q=[[1,2],[3,4]]\nx=q[0][1][0]",
        "not a list of strings",
      );
    });

    it("rejects a step slice on an element", () => {
      assertCompilerError("p=['abcdef']\nx=p[0][1:5:2]", "Slices with a step");
    });

    it("reports a missing closing bracket after an element slice", () => {
      assertCompilerError("p=['abcdef']\nx=p[0][1:2", "Closing bracket");
    });
  });
});
