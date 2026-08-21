import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import { lexify, parse, tokenize } from "@/core/compiler.ts";
import {
  assertCompilerError,
  runSourceToText,
} from "../machine/lib/helpers.ts";

/**
 * Python's membership tests, "x in y" and "x not in y". "in" used to exist only
 * as part of "for x in ...", and using it as an operator was a type error;
 * `Logic&CS/BinarySearch.tpy` spelled Delphi's
 * `typed in ["C","H","L"]` as a hand-written chain of "!=" comparisons as a
 * result.
 *
 * Behavioural, through the whole pipeline, rather than pcode assertions:
 * neither form adds a PCode, they reuse LIDX (the same full scan
 * ".index()" uses) and POSS (the same search ".find()" uses), and pinning
 * that reuse would lock in the encoding rather than the semantics. What
 * matters is Python's answer, including the corners real Python has
 * opinions about ("'' in s" is true, "not in" is the exact negation).
 */
describe("compiler: Python membership tests", () => {
  /**
   * Evaluates a boolean expression and reports it as "T"/"F". Routed
   * through an "if" rather than printed directly because the machine has no
   * boolean output form - and because "if" is where these expressions
   * actually get used.
   */
  const truthOf = (expression: string, setup = ""): string =>
    runSourceToText(
      "Python",
      `${setup}\nif ${expression}:\n    print('T',newline)\nelse:\n    print('F',newline)`,
    ).replace(/\s+$/, "");

  describe("against a list literal", () => {
    it("finds a string that is present", () => {
      assertEquals(truthOf("'C' in ['A','C']"), "T");
    });

    it("rejects a string that is absent", () => {
      assertEquals(truthOf("'B' in ['A','C']"), "F");
    });

    it("finds an integer that is present", () => {
      assertEquals(truthOf("3 in [1,2,3]"), "T");
    });

    it("rejects an integer that is absent", () => {
      assertEquals(truthOf("4 in [1,2,3]"), "F");
    });

    it("matches on the first element as well as the last", () => {
      assertEquals(truthOf("1 in [1,2,3]"), "T");
    });

    it("compares strings by value, not by heap pointer", () => {
      // the two "ab"s are separate heap allocations; a pointer comparison
      // would answer F here
      assertEquals(truthOf("s in ['ab','cd']", "s='a'+'b'"), "T");
    });

    it("evaluates the left operand exactly once", () => {
      // a chain-of-comparisons encoding would re-evaluate it per element,
      // running the side effect three times
      assertEquals(
        runSourceToText(
          "Python",
          "n=0\ndef bump() -> int:\n    global n\n    n=n+1\n    return 9\nif bump() in [1,2,3]:\n    pass\nprint(str(n),newline)",
        ).replace(/\s+$/, ""),
        "1",
      );
    });
  });

  describe("against a list variable", () => {
    it("finds a value that is present", () => {
      assertEquals(truthOf("2 in n", "n=[1,2,3]"), "T");
    });

    it("rejects a value that is absent", () => {
      assertEquals(truthOf("7 in n", "n=[1,2,3]"), "F");
    });

    it("sees a value appended after the list was built", () => {
      assertEquals(truthOf("7 in n", "n=[1,2,3]\nn.append(7)"), "T");
    });

    it("searches a sublist of a list of lists", () => {
      assertEquals(truthOf("3 in w[1]", "w=[[1,2],[3,4]]"), "T");
    });
  });

  describe("against a string (substring test)", () => {
    it("finds a substring in the middle", () => {
      assertEquals(truthOf("'ell' in 'hello'"), "T");
    });

    it("rejects a substring that is absent", () => {
      assertEquals(truthOf("'x' in 'hello'"), "F");
    });

    it("treats the empty string as present, matching real Python", () => {
      assertEquals(truthOf("'' in 'hello'"), "T");
    });

    it("searches a string variable", () => {
      assertEquals(truthOf("'lo' in s", "s='hello'"), "T");
    });

    it("finds nothing in the empty string except the empty string", () => {
      assertEquals(truthOf("'x' in ''"), "F");
      assertEquals(truthOf("'' in ''"), "T");
    });
  });

  describe('"not in"', () => {
    it("negates a list hit", () => {
      assertEquals(truthOf("'C' not in ['A','C']"), "F");
    });

    it("negates a list miss", () => {
      assertEquals(truthOf("'B' not in ['A','C']"), "T");
    });

    it("negates a substring hit and miss", () => {
      assertEquals(truthOf("'ell' not in 'hello'"), "F");
      assertEquals(truthOf("'x' not in 'hello'"), "T");
    });

    it("negates against a list variable", () => {
      assertEquals(truthOf("7 not in n", "n=[1,2,3]"), "T");
    });
  });

  describe("interaction with the rest of the grammar", () => {
    it("leaves 'for x in range(...)' parsing as a loop, not a membership test", () => {
      assertEquals(
        runSourceToText(
          "Python",
          "for i in range(3):\n    print(str(i),newline)",
        ).replace(/\s+$/, ""),
        "0 \n1 \n2",
      );
    });

    it("leaves 'for x in <list>' parsing as a loop", () => {
      assertEquals(
        runSourceToText(
          "Python",
          "n=[4,5]\nfor e in n:\n    print(str(e),newline)",
        ).replace(/\s+$/, ""),
        "4 \n5",
      );
    });

    it("leaves the ordinary unary 'not' alone", () => {
      assertEquals(truthOf("not x", "x=0"), "T");
    });

    it("still parses 'not' applied to a bracketed membership test", () => {
      assertEquals(truthOf("not ('C' in ['A','C'])"), "F");
    });

    it("chains left to right, like any other level-0 operator", () => {
      // "('a' in 'abc') in [1]" - the inner test yields Python's true (1),
      // which is then looked for in [1]. Worth pinning: it is the shape a
      // reader would expect from an operator at comparison precedence, and
      // it proves the membership loop iterates rather than stopping after one
      assertEquals(truthOf("'a' in 'abc' in [1]"), "T");
    });
  });

  describe("errors", () => {
    it("rejects a right operand that is neither list nor string", () => {
      assertCompilerError(
        "Python",
        "x='a' in 5",
        "must be followed by a list or a string",
      );
    });

    it("rejects an empty list literal, naming the reason", () => {
      assertCompilerError(
        "Python",
        "x=1 in []",
        "is empty, so nothing can be in it",
      );
    });

    it("rejects a list of lists", () => {
      assertCompilerError(
        "Python",
        "w=[[1,2],[3,4]]\nx=1 in w",
        "cannot search a list of lists",
      );
    });

    it("rejects an integer looked for in a list of strings", () => {
      assertCompilerError("Python", "x=1 in ['a','b']", "Type error");
    });

    it("rejects a string looked for in a list of integers", () => {
      assertCompilerError("Python", "x='a' in [1,2]", "Type error");
    });

    it("rejects an integer looked for in a string", () => {
      assertCompilerError("Python", "x=1 in 'abc'", "Type error");
    });

    it("reports the error at the 'in', not at the operand before it", () => {
      assertCompilerError("Python", "x='a' in 5", '("in", line 1');
    });
  });

  describe("other languages are untouched", () => {
    it("does not give Pascal an 'in' operator", () => {
      assertThrows(
        () =>
          parse(
            lexify(
              tokenize(
                "PROGRAM test;\nVAR x: boolean;\nBEGIN\n  x := 1 in 2;\nEND.",
                "Pascal",
              ),
              "Pascal",
            ),
            "Pascal",
          ),
        Error,
      );
    });
  });
});
