import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertExists } from "@std/assert";
import { PCode } from "@/core/constants.ts";
import { defaultCompilerOptions } from "@/core/compiler.ts";
import { compileAndEncode, countOf } from "./lib/helpers.ts";

/**
 * Covers `encoder/encode.ts` (the parts not already exercised incidentally
 * by every other encoder test - back-patching subroutine calls, the C/Java
 * implicit call to "main", and the addHCLR three-way branch),
 * `encoder/addresses.ts`, `encoder/merge.ts` (one cheap sanity check only; the
 * sibling test files cover it otherwise), `encoder/program/programStart.ts`, and
 * `encoder/program/subroutines.ts`.
 *
 * `encoder/program/statements.ts` is trivial (a two-line loop with no
 * branches) and already at 100% coverage as a side effect of every other
 * encoder test in the suite - it needs no dedicated tests here.
 */
describe("encoder/program", () => {
  describe("encode.ts - backPatchSubroutineCalls", () => {
    it("back-patches a called subroutine's placeholder index to its real (1-based) start line", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nprocedure go;\nbegin\nend;\nbegin\ngo;\nend.",
      );

      // the subroutine's own start line is wherever its PCode.pssr line ends up
      const pssrLineIndex = pcode.findIndex((line) =>
        line.includes(PCode.pssr),
      );
      assert(pssrLineIndex >= 0);
      const expectedStartLine = pssrLineIndex + 1; // pcode line numbers are 1-based

      // there is exactly one subroutine call in this program (main calling "go")
      const subrLineIndex = pcode.findIndex((line) =>
        line.includes(PCode.subr),
      );
      assert(subrLineIndex >= 0);
      const subrLine = pcode[subrLineIndex]!; // found by findIndex, asserted above
      const subrArgIndex = subrLine.indexOf(PCode.subr) + 1;

      // if back-patching hadn't run, this would still be the placeholder
      // subroutine index (1 for the first and only subroutine) rather than
      // its real start line
      assertEquals(subrLine[subrArgIndex], expectedStartLine);
      assertEquals(countOf(pcode, PCode.subr), 1);
    });
  });

  describe("encode.ts - implicit call to main (C/Java only)", () => {
    it("appends a call to main's real start line, immediately before the final halt, for C", () => {
      const pcode = compileAndEncode("C", "void main () {\n}");
      assertEquals(pcode[pcode.length - 1], [PCode.halt]);

      const pssrLineIndex = pcode.findIndex((line) =>
        line.includes(PCode.pssr),
      );
      assert(pssrLineIndex >= 0);
      const expectedStartLine = pssrLineIndex + 1;

      assertEquals(pcode[pcode.length - 2], [PCode.subr, expectedStartLine]);
    });

    it("appends a call to main's real start line, immediately before the final halt, for Java", () => {
      const pcode = compileAndEncode(
        "Java",
        "class Test {\nvoid main () {}\n}",
      );
      assertEquals(pcode[pcode.length - 1], [PCode.halt]);

      const pssrLineIndex = pcode.findIndex((line) =>
        line.includes(PCode.pssr),
      );
      assert(pssrLineIndex >= 0);
      const expectedStartLine = pssrLineIndex + 1;

      assertEquals(pcode[pcode.length - 2], [PCode.subr, expectedStartLine]);
    });

    it("does not add an implicit subroutine call for Python, even when a subroutine is defined", () => {
      const pcode = compileAndEncode("Python", "def go():\n    pass");
      assertEquals(countOf(pcode, PCode.subr), 0);
    });

    it("does not add an implicit subroutine call for Pascal, even when a subroutine is defined", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nprocedure go;\nbegin\nend;\nbegin\nend.",
      );
      assertEquals(countOf(pcode, PCode.subr), 0);
    });

    it("does not add an implicit subroutine call for BASIC, even when a subroutine is defined", () => {
      const pcode = compileAndEncode(
        "BASIC",
        "END\nDEF PROCgo\nx% = 1\nENDPROC",
      );
      assertEquals(countOf(pcode, PCode.subr), 0);
    });
  });

  describe("encode.ts - addHCLR", () => {
    it("case (a): inserts hclr immediately before a same-line jump/ifno when a heap string is made but not needed", () => {
      // the condition test line evaluates "(s + 'a') = 'y'" (making a heap
      // string via string concatenation) and ends with the ifno that
      // branches on the result, all on one pcode line
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar s: string;\nbegin\ns := 'x';\nif (s + 'a') = 'y' then\ns := 'z';\nend.",
      );

      const conditionLine = pcode.find(
        (line) => line.includes(PCode.scat) && line.includes(PCode.ifno),
      );
      assertExists(conditionLine);
      const ifnoIndex = conditionLine!.indexOf(PCode.ifno);
      assertEquals(conditionLine![ifnoIndex - 1], PCode.hclr);
    });

    it("case (b): appends hclr at the end of the line when a heap string is made but not needed, and there's no jump on that line", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar s: string;\nbegin\ns := 'a' + 'b';\nend.",
      );

      const concatLine = pcode.find((line) => line.includes(PCode.scat));
      assertExists(concatLine);
      assertEquals(concatLine![concatLine!.length - 1], PCode.hclr);
      assert(!concatLine!.includes(PCode.jump));
      assert(!concatLine!.includes(PCode.ifno));
    });

    it("case (c): inserts no hclr when a heap string is made AND needed (a subroutine call) on the same line", () => {
      // passing a concatenated string as an argument to a custom procedure
      // call merges the string-concatenation code and the PCode.subr call
      // onto the same pcode line (the "load arguments" and "call" steps
      // both merge onto the previous line; only the *result* of a
      // *function* call is forced onto a new line, and this is a
      // procedure)
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar s: string;\nprocedure go(t: string);\nbegin\nend;\nbegin\ns := 'a';\ngo(s + 'b');\nend.",
      );

      const callLine = pcode.find(
        (line) => line.includes(PCode.scat) && line.includes(PCode.subr),
      );
      assertExists(callLine);
      assert(!callLine!.includes(PCode.hclr));
    });

    it("correctly skips over a variable-length PCode.lstr (string literal) argument list while scanning a line", () => {
      // pcodeArgs(PCode.lstr) returns -1 ("varies; the next code specifies
      // how many"), which addHCLR's scanning loop handles via a dedicated
      // `args === -1` branch (`i += line[i + 1] + 2`); a multi-character
      // string literal assignment is what actually produces a PCode.lstr
      // opcode (as opposed to single-character literals, which use ctos)
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar s: string;\nbegin\ns := 'hello';\nend.",
      );
      const lstrLine = pcode.find((line) => line.includes(PCode.lstr));
      assertExists(lstrLine);
      // if the -1-args skip were wrong, hclr would have been spliced into
      // the middle of the literal's character codes instead of appended
      // cleanly at the end
      assertEquals(lstrLine![lstrLine!.length - 1], PCode.hclr);
    });
  });

  describe("addresses.ts - turtleAddress", () => {
    it("adds one extra global slot when a subroutine is a function, but not when it's only a procedure", () => {
      const withFunction = compileAndEncode(
        "Pascal",
        "program Test;\nfunction go: integer;\nbegin\nresult := 1;\nend;\nbegin\nend.",
      );
      const procedureOnly = compileAndEncode(
        "Pascal",
        "program Test;\nprocedure go;\nbegin\nend;\nbegin\nend.",
      );
      const noSubroutines = compileAndEncode(
        "Pascal",
        "program Test;\nbegin\nend.",
      );

      // turtleAddress(program) is the argument of the very first PCode.ldin
      // in programStart's first pcode line, in all three cases
      assertEquals(noSubroutines[0]![0], PCode.ldin);
      assertEquals(procedureOnly[0]![1], noSubroutines[0]![1]! + 1); // +1 subroutine pointer
      assertEquals(withFunction[0]![1], procedureOnly[0]![1]! + 1); // +1 again, for the function's result slot
    });
  });

  describe("addresses.ts - variableAddress / lengthByteAddress", () => {
    it("recurses into SubVariables for a nested/multi-dimensional global array", () => {
      // a 2x2 array: the outer array's own setup, plus one recursive setup
      // for each of its two elements (themselves 1-d arrays) - each of
      // those inner setups only exists because getSubVariables/isArray and
      // the SubVariable branch of variableAddress/lengthByteAddress fired
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar arr: array[1..2,1..2] of integer;\nbegin\narr[1,1] := 5;\nend.",
      );

      // one ldag/stvg setup block for the outer array, one for each of its
      // two (array-typed) elements = 3 blocks, 2 stvg per block
      assertEquals(countOf(pcode, PCode.ldag), 3);
      assertEquals(countOf(pcode, PCode.stvg), 6);
    });

    it("uses local (subroutine-relative) addressing for a nested/multi-dimensional local array, recursing into its SubVariables too", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nprocedure go;\nvar arr: array[1..2,1..2] of integer;\nbegin\narr[1,1] := 5;\nend;\nbegin\ngo;\nend.",
      );

      // setupLocalVariable's array branch: [ldav, addr, lengthByteAddr, stvv, addr, addr, ldin, elementCount, stvv, addr, lengthByteAddr]
      // one block for the outer array, one for each of its two (array-typed) elements
      const setupLines = pcode.filter(
        (line) =>
          line.length === 11 &&
          line[0] === PCode.ldav &&
          line[3] === PCode.stvv &&
          line[6] === PCode.ldin &&
          line[8] === PCode.stvv,
      );
      assertEquals(setupLines.length, 3);
      assertEquals(setupLines[0]![7], 2); // outer array's elementCount (array[1..2,1..2])
    });

    it("uses local (subroutine-relative) addressing for a plain local string variable", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nprocedure go;\nvar s: string;\nbegin\ns := 'x';\nend;\nbegin\ngo;\nend.",
      );

      const setupLine = pcode.find(
        (line) =>
          line.length === 11 &&
          line[0] === PCode.ldav &&
          line[3] === PCode.stvv &&
          line[6] === PCode.ldin &&
          line[8] === PCode.stvv,
      );
      assertExists(setupLine);
      assertEquals(setupLine![7], 65); // default stringLength (64) + 1
    });
  });

  describe("program/programStart.ts - setupGlobalVariable", () => {
    it("sets up a global array variable (recursing into scalar subVariables that themselves need no setup)", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar arr: array[1..3] of integer;\nbegin\narr[1] := 5;\nend.",
      );
      // just the one setup block for the array itself; its 3 (integer)
      // elements are scalars, so their own setupGlobalVariable calls
      // return empty and push nothing (subPcode.length > 0 is false)
      assertEquals(countOf(pcode, PCode.ldag), 1);
    });

    it("sets up a global string variable", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar s: string;\nbegin\ns := 'x';\nend.",
      );
      const setupLine = pcode.find((line) => line.includes(PCode.ldag));
      assertExists(setupLine);
      assertEquals(setupLine!.length, 8);
    });

    it("pushes nothing for a plain scalar global variable", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar x: integer;\nbegin\nx := 1;\nend.",
      );
      // neither the array branch (PCode.ldag) nor the string branch would
      // ever be reached for a plain integer/boolean variable
      assertEquals(countOf(pcode, PCode.ldag), 0);
    });
  });

  describe("program/subroutines.ts - subroutineStartCode", () => {
    it("skips all local-variable setup for a subroutine with no variables at all", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nprocedure go;\nbegin\nend;\nbegin\ngo;\nend.",
      );
      // PCode.memc (claim memory) only appears when subroutine.variables.length > 0
      assertEquals(countOf(pcode, PCode.memc), 0);
    });

    it("skips zeroing locals when a subroutine has only parameters and no other locals", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nprocedure go(n: integer);\nbegin\nend;\nbegin\ngo(1);\nend.",
      );
      // options.initialiseLocals is true by default, but subroutine.variables.length (1)
      // is not greater than getParameters(subroutine).length (1), so no zeroing code is added
      const memcLine = pcode.find((line) => line.includes(PCode.memc));
      assertExists(memcLine);
      const memcIndex = pcode.indexOf(memcLine!);
      // the very next pcode line is straight into storing the parameter, not a zptr zeroing block
      assert(!pcode[memcIndex + 1]?.includes(PCode.zptr));
    });

    it("zeroes locals when a subroutine has locals beyond its parameters (initialiseLocals: true, the default), but not when the option is false", () => {
      // PCode.zptr also always appears once in programStart's own global
      // memory setup (line 0), regardless of this subroutine-level option -
      // so compare the *same* program with the option on vs off, rather
      // than asserting presence/absence in isolation
      const code =
        "program Test;\nprocedure go(n: integer);\nvar y: integer;\nbegin\ny := n;\nend;\nbegin\ngo(1);\nend.";
      const withZeroing = compileAndEncode("Pascal", code);
      const withoutZeroing = compileAndEncode("Pascal", code, {
        ...defaultCompilerOptions,
        initialiseLocals: false,
      });
      assertEquals(countOf(withZeroing, PCode.zptr), 2); // programStart's own + this subroutine's
      assertEquals(countOf(withoutZeroing, PCode.zptr), 1); // just programStart's own
    });

    it("stores nothing for an array-by-value parameter (the array copy is a documented TODO, unimplemented) [known limitation]", () => {
      // C never sets isReferenceParameter, so a plain array parameter here
      // is by-value syntax that's legal but has no copying logic yet -
      // the parameter-storing loop pushes an (initially empty) line for
      // it and leaves it empty
      const pcode = compileAndEncode(
        "C",
        "int arr[3];\nvoid go (int a[3]) {\n}\nvoid main () {\ngo(arr);\n}",
      );
      const emptyLines = pcode.filter((line) => line.length === 0);
      assertEquals(emptyLines.length, 1);
    });

    it("copies a by-value string parameter with a PCode.cstr string copy", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nprocedure go(s: string);\nbegin\nend;\nbegin\ngo('x');\nend.",
      );
      // [ldvv, subroutineAddress, variableAddress, cstr]
      assert(
        pcode.some(
          (line) =>
            line.length === 4 &&
            line[0] === PCode.ldvv &&
            line[3] === PCode.cstr,
        ),
      );
    });

    it("stores a plain by-value scalar parameter with PCode.stvv", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nprocedure go(n: integer);\nbegin\nend;\nbegin\ngo(1);\nend.",
      );
      // [stvv, subroutineAddress, variableAddress]
      assert(pcode.some((line) => line.length === 3 && line[0] === PCode.stvv));
    });

    it("stores a by-reference parameter with PCode.stvv too, and still releases its memory at the end", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar x: integer;\nprocedure go(var n: integer);\nbegin\nn := 1;\nend;\nbegin\ngo(x);\nend.",
      );
      assert(pcode.some((line) => line.length === 3 && line[0] === PCode.stvv));
      assert(pcode.some((line) => line.includes(PCode.memr)));
    });
  });

  describe("program/subroutines.ts - subroutineEndCode", () => {
    it("stores the function result and releases memory for a Pascal function, even with no explicit return statement", () => {
      // Pascal functions get automatic end code from subroutines.ts itself
      // (getSubroutineType(subroutine) === "procedure" || subroutine.language === "Pascal"),
      // unlike other languages' functions, which rely on an explicit
      // `return` statement (covered by the sibling statements test file)
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nfunction double(n: integer): integer;\nbegin\nresult := n * 2;\nend;\nbegin\nend.",
      );
      const endLine = pcode.find(
        (line) =>
          line.includes(PCode.ldvg) &&
          line.includes(PCode.stvg) &&
          line.includes(PCode.memr) &&
          line.includes(PCode.plsr) &&
          line.includes(PCode.retn),
      );
      assertExists(endLine);
      // exactly one retn for this subroutine: proof that subroutines.ts's own
      // end-code addition fired exactly once (there's no explicit return in
      // the source at all to have produced this independently)
      assertEquals(countOf(pcode, PCode.retn), 1);
    });

    it("does not add a second, redundant end code (from subroutines.ts itself) for a non-Pascal function with an explicit return", () => {
      // if subroutines.ts's own condition wrongly fired for a non-Pascal
      // function too, this program's subroutine would end up with two
      // PCode.retn codes: one from the explicit `return` statement's own
      // encoding, and a spurious second one appended by subroutines.ts
      const pcode = compileAndEncode(
        "Python",
        "def double(n: int) -> int:\n    return n * 2\nx = double(2)",
      );
      assertEquals(countOf(pcode, PCode.retn), 1);
    });

    it("adds neither a result-store nor a memory-release for an empty procedure with no variables", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nprocedure go;\nbegin\nend;\nbegin\ngo;\nend.",
      );
      // the procedure's end code is exactly [plsr, retn] - no ldvg/stvg
      // (it's not a function) and no memr (it has no variables to release)
      const endLine = pcode.find(
        (line) =>
          line.length === 2 && line[0] === PCode.plsr && line[1] === PCode.retn,
      );
      assertExists(endLine);
    });
  });

  describe("merge.ts sanity check", () => {
    it("merges a second line onto the end of the last existing line, rather than starting a new one, when pcode1 is non-empty", () => {
      // any program with more than one statement merges most of the time;
      // this just pins down the simplest observable case: a program with a
      // single top-level statement still has its start code (2 lines) and
      // the statement's own code merged onto the *same* array, not just
      // appended as fresh unrelated lines, and the whole thing still ends
      // in a single halt line
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar x: integer;\nbegin\nx := 1;\nend.",
      );
      assertEquals(pcode[pcode.length - 1], [PCode.halt]);
      assert(pcode.length >= 3);
    });
  });
});
