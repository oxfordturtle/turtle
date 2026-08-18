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
 * "x += 1" and "x -= 1", which only Python has (the tokenizer's operator
 * patterns emit "+="/"-=" for Python alone - see `tokenizer/tokenize.ts`).
 *
 * `parser/definitions/statements/variableAssignment.ts` desugars them into an
 * ordinary assignment of a compound expression, so what these check is that
 * "x <op>= y" really does behave as "x = x <op> y" - in particular that the
 * left operand reads the *indexed element*, not the list's own heap base
 * pointer, and that the operator is chosen from the operand types the way
 * `common/expression.ts` chooses it for a written-out "s = s + t" (a string
 * wants SCAT, not integer PLUS).
 *
 * A list element is the exception: its address is worked out at runtime, so it
 * keeps its operator as far as the encoder rather than being desugared into an
 * expression naming the index twice. The last group below pins that.
 */
describe("compiler: Python augmented assignment", () => {
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

  /** "1 2 3" for a three-element integer list, so a stray write shows up. */
  const printInts = (name: string, length: number): string =>
    `print(${Array.from(
      { length },
      (_, index) => `str(${name}[${index}])`,
    ).join("+' '+")})`;

  describe("integer scalars", () => {
    it("adds to a module-level variable", () => {
      assertEquals(runPython("n=5\nn+=3\nprint(str(n))"), "8");
    });

    it("subtracts from a module-level variable", () => {
      assertEquals(runPython("n=5\nn-=3\nprint(str(n))"), "2");
    });

    it("adds to a global from inside a subroutine", () => {
      assertEquals(
        runPython("n=5\ndef f():\n    global n\n    n+=3\nf()\nprint(str(n))"),
        "8",
      );
    });
  });

  describe("integer list elements", () => {
    it("adds to the element at a literal index, leaving its neighbours alone", () => {
      // the minimal repro for the bug this file was written for: "x[0]+=1"
      // was reported as reading and writing a bogus location rather than the
      // list slot, where "x[0]=x[0]+1" was correct
      assertEquals(
        runPython(`x=[10]*3\nx[0]+=1\n${printInts("x", 3)}`),
        "11 10 10",
      );
    });

    it("matches the written-out form at a literal index", () => {
      assertEquals(
        runPython(`x=[10]*3\nx[0]=x[0]+1\n${printInts("x", 3)}`),
        "11 10 10",
      );
    });

    it("adds to the element at a variable index", () => {
      assertEquals(
        runPython(`x=[10]*3\nn=1\nx[n]+=1\n${printInts("x", 3)}`),
        "10 11 10",
      );
    });

    it("subtracts from the element at a variable index", () => {
      assertEquals(
        runPython(`x=[10]*3\nn=2\nx[n]-=1\n${printInts("x", 3)}`),
        "10 10 9",
      );
    });

    it("adds to every element in turn from a for loop", () => {
      assertEquals(
        runPython(
          `x=[10]*3\nfor n in range(0,3,1):\n    x[n]+=1\n${printInts("x", 3)}`,
        ),
        "11 11 11",
      );
    });

    it("adds to a module-level list from inside a subroutine", () => {
      // Cheetahs.tpy's shape: the list is global, the index is the
      // subroutine's own loop variable
      assertEquals(
        runPython(
          `x=[10]*3\ndef f():\n    for n in range(0,3,1):\n        x[n]-=1\nf()\n${printInts(
            "x",
            3,
          )}`,
        ),
        "9 9 9",
      );
    });

    it("adds to a subroutine's own local list", () => {
      assertEquals(
        runPython(
          `def f():\n    y=[10]*3\n    y[1]+=1\n    ${printInts("y", 3)}\nf()`,
        ),
        "10 11 10",
      );
    });

    it("adds at an index that is itself a list element read", () => {
      // Cheetahs.tpy's "gspeednum[gspeed[b]]+=1"
      assertEquals(
        runPython(`x=[10]*3\ni=[2]*3\nx[i[0]]+=1\n${printInts("x", 3)}`),
        "10 10 11",
      );
    });

    it("adds at a negative index, counting from the end", () => {
      assertEquals(
        runPython(`x=[10]*3\nx[-1]+=1\n${printInts("x", 3)}`),
        "10 10 11",
      );
    });

    it("adds to a sublist element of a list of lists", () => {
      assertEquals(
        runPython(
          "w=[[1,2],[3,4]]\nw[1][0]+=10\nprint(str(w[0][0])+' '+str(w[0][1])+' '+str(w[1][0])+' '+str(w[1][1]))",
        ),
        "1 2 13 4",
      );
    });
  });

  describe("strings", () => {
    it("concatenates onto a string variable", () => {
      assertEquals(runPython("s='ab'\ns+='cd'\nprint(s)"), "abcd");
    });

    it("concatenates onto a string list element, leaving its neighbours alone", () => {
      assertEquals(
        runPython("x=['a','b','c']\nx[1]+='z'\nprint(x[0]+'|'+x[1]+'|'+x[2])"),
        "a|bz|c",
      );
    });

    it("concatenates onto a string list element at a variable index", () => {
      assertEquals(
        runPython(
          "x=['aa','bb','cc']\nn=2\nx[n]+='zz'\nprint(x[0]+'|'+x[1]+'|'+x[2])",
        ),
        "aa|bb|cczz",
      );
    });

    it("matches the written-out form", () => {
      assertEquals(
        runPython(
          "x=['a','b','c']\nx[1]=x[1]+'z'\nprint(x[0]+'|'+x[1]+'|'+x[2])",
        ),
        "a|bz|c",
      );
    });

    it("rejects '-=' on a string, which has no meaning", () => {
      // real Python raises a TypeError; before this was caught, "-=" took the
      // difference of two heap addresses and then copied a string from
      // wherever that landed
      assertThrows(
        () => runPython("s='ab'\ns-='b'\nprint(s)"),
        Error,
        "Type error: strings cannot be subtracted.",
      );
    });

    it("rejects '-=' on a string list element", () => {
      assertThrows(
        () => runPython("x=['a','b']\nx[0]-='a'\nprint(x[0])"),
        Error,
        "Type error: strings cannot be subtracted.",
      );
    });
  });

  describe("the index expression is evaluated once", () => {
    // "x[i]+=1" used to desugar to "x[i]=x[i]+1", which encodes `i` twice:
    // once for the element read and once for the element address written to.
    // A pure index (a literal, a variable, another list's element - every
    // shape any example program uses) gives the same answer both times, so it
    // only showed with a side-effecting or random index, where the slot read
    // was not the slot written. The augmented form is now kept as far as the
    // encoder, which computes the address once and holds it on the stack
    // across the read.

    /**
     * `f()`, which counts its calls in `c` and returns each of `values` in
     * turn. Each caller passes enough values for the *doubled* evaluation, so
     * that the old behaviour shows up as a wrong count and a wrong element
     * rather than as an index-out-of-range error.
     */
    const countingIndex = (values: number[]): string =>
      `c=0\nv=[${values.join(
        ",",
      )}]\ndef f() -> int:\n    global c\n    c+=1\n    return v[c-1]\n`;

    it("calls a function in the index once, not once per read and write", () => {
      assertEquals(
        runPython(`${countingIndex([1, 1])}x=[10]*3\nx[f()]+=1\nprint(str(c))`),
        "1",
      );
    });

    it("writes to the element it read, when the index changes between calls", () => {
      // f() gives 0 first and 2 second, so a second evaluation would read
      // element 0 and write element 2
      assertEquals(
        runPython(
          `${countingIndex([0, 2])}x=[10,20,30]\nx[f()]+=1\n${printInts(
            "x",
            3,
          )}`,
        ),
        "11 20 30",
      );
    });

    it("evaluates a subroutine's own local list's index once", () => {
      assertEquals(
        runPython(
          `${countingIndex([0, 2])}def g():\n    y=[10,20,30]\n    y[f()]-=1\n    ${printInts(
            "y",
            3,
          )}\n    print(str(c))\ng()`,
        ),
        "9 20 30\n1",
      );
    });

    it("evaluates a string element's index once", () => {
      assertEquals(
        runPython(
          `${countingIndex([0, 2])}x=['a','b','c']\nx[f()]+='z'\nprint(x[0]+'|'+x[1]+'|'+x[2]+'|'+str(c))`,
        ),
        "az|b|c|1",
      );
    });

    it("evaluates both of a list of lists' indexes once", () => {
      assertEquals(
        runPython(
          `${countingIndex([1, 0, 1, 0])}w=[[1,2],[3,4]]\nw[f()][f()]+=10\nprint(str(w[0][0])+' '+str(w[0][1])+' '+str(w[1][0])+' '+str(w[1][1])+' '+str(c))`,
        ),
        "1 2 13 4 2",
      );
    });
  });
});
