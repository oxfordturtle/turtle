import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertExists } from "@std/assert";
import { PCode } from "@/core/constants.ts";
import { defaultCompilerOptions } from "@/core/compiler.ts";
import { compileAndEncode, countOf } from "./lib/helpers.ts";
import { runSourceToText } from "../../machine/lib/helpers.ts";

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

    it("stores a reference array parameter's address with PCode.stvv, and sets up no local block for it", () => {
      // C's arrays are references, so the parser marks an array parameter as a
      // reference parameter and the callee works on the caller's array: the
      // slot holds its address and there is nothing to set up. This line used
      // to be left empty, which the machine halts on
      const pcode = compileAndEncode(
        "C",
        "int arr[3];\nvoid go (int a[3]) {\n}\nvoid main () {\ngo(arr);\n}",
      );
      assertEquals(
        pcode.filter((line) => line.length === 0).length,
        0,
        "an empty pcode line would run the machine past the end of a line",
      );
      // [stvv, subroutineAddress, variableAddress] - the same store a scalar
      // or a reference parameter gets
      assert(pcode.some((line) => line.length === 3 && line[0] === PCode.stvv));
      // setupLocalVariable's array branch (PCode.ldav, claiming a block within
      // the frame and pointing the variable's slot at it) is skipped: there is
      // no zeroing block here either, the parameter being the only variable
      assertEquals(countOf(pcode, PCode.ldav), 0);
    });

    it("stores an array-of-strings parameter's address too, rather than copying it as a string", () => {
      // isArray comes first: the string-copy branch below it must not claim an
      // array whose *elements* are strings, whose slot holds an array address
      const pcode = compileAndEncode(
        "C",
        "string words[3];\nvoid go (string w[3]) {\n}\nvoid main () {\ngo(words);\n}",
      );
      assertEquals(countOf(pcode, PCode.cstr), 0);
      assert(pcode.some((line) => line.length === 3 && line[0] === PCode.stvv));
    });

    it("copies a by-value array parameter into its own block with a PCode.cptr, then rebuilds the block's pointers", () => {
      // Pascal's value parameter, the one array parameter that is a copy: the
      // block is laid out from the parameter's own declared dimensions, so the
      // length is a compile-time constant - here 4, the length byte plus three
      // integer elements
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar arr: array[1..3] of integer;\nprocedure go(a: array[1..3] of integer);\nbegin\nend;\nbegin\ngo(arr);\nend.",
      );
      const copyLine = pcode.find((line) => line.includes(PCode.cptr));
      assertExists(copyLine);
      // [ldav, subroutineAddress, lengthByteAddress, dupl, stvv,
      // subroutineAddress, variableAddress, ldin, 4, cptr]
      assertEquals(copyLine![0], PCode.ldav);
      assertEquals(copyLine![3], PCode.dupl);
      assertEquals(copyLine![4], PCode.stvv);
      assertEquals(copyLine![7], PCode.ldin);
      assertEquals(copyLine![8], 4);
      assertEquals(copyLine![9], PCode.cptr);
      // and the rebuild after it: setupLocalVariable's own PCode.ldav block,
      // which the copy's arrival makes necessary rather than redundant
      const copyLineIndex = pcode.indexOf(copyLine!);
      assert(pcode[copyLineIndex + 1]?.includes(PCode.ldav));
    });

    it("emits no copy for a VAR array parameter, which is the caller's array", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar arr: array[1..3] of integer;\nprocedure go(var a: array of integer);\nbegin\nend;\nbegin\ngo(arr);\nend.",
      );
      assertEquals(countOf(pcode, PCode.cptr), 0);
      assert(pcode.some((line) => line.length === 3 && line[0] === PCode.stvv));
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

  describe("program/subroutines.ts - setupLocalVariable", () => {
    // A string's setup points the variable's slot at its buffer and writes the
    // buffer's maximum length into the word after the slot. That word is only
    // the variable's own when it has a block: getLength gives a single word to
    // whatever holds an address instead - a reference parameter, a pointer -
    // and the word after that one belongs to the variable declared next.
    const stringSetupLine = (line: number[]): boolean =>
      line[0] === PCode.ldav && line.length === 11;

    it("sets up a buffer for a by-value string parameter, which has a block to put one in", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar x: string;\nprocedure go(s: string);\nvar m: integer;\nbegin\nend;\nbegin\ngo(x);\nend.",
      );
      assert(pcode.some(stringSetupLine));
    });

    it("sets up none for a reference string parameter, which is one word holding the caller's address", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar x: string;\nprocedure go(var s: string);\nvar m: integer;\nbegin\nend;\nbegin\ngo(x);\nend.",
      );
      assertEquals(pcode.filter(stringSetupLine).length, 0);
    });

    it("leaves the variable declared after a reference string parameter reading zero [regression]", () => {
      // the observable form of the bug: the maximum length byte (65, for a
      // default 64-character string) was written into m's slot, which the
      // zeroing block had just cleared
      assertEquals(
        runSourceToText(
          "Pascal",
          "program Test;\nvar x: string;\nprocedure go(var s: string);\nvar m: integer;\nbegin\nwriteln(str(m));\nwriteln(s)\nend;\nbegin\nx := 'hello';\ngo(x)\nend.",
        ),
        "0\nhello\n",
      );
    });

    it("does the same for a string pointer, the other single-word string [regression]", () => {
      assertEquals(
        runSourceToText(
          "C",
          "void go () {\n  string *s;\n  int m;\n  print(itoa(m));\n}\nvoid main () {\n  go();\n}",
        ),
        "0\n",
      );
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
