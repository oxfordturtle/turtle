import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { PCode } from "@/core/constants.ts";
import { compileAndEncode, countOf, includesCode } from "./_helpers.ts";
import { runPcode } from "../../machine/_helpers.ts";

/**
 * Covers `src/core/compiler/encoder/statement.ts` (the statementType
 * dispatcher) and everything under `src/core/compiler/encoder/statements/`.
 * `forStatement.ts` is already fully covered by
 * `test/core/compiler/encode.test.ts` and isn't specifically targeted here,
 * beyond one test that reaches the "forStatement" arm of the dispatcher
 * switch so this file's own coverage run exercises every arm of it.
 *
 * `encode()` isn't part of `@/core/compiler.ts`'s public surface beyond the
 * single `encode()` entry point (see `_helpers.ts`), so every test here
 * builds a real per-language program that reaches the target branch and
 * inspects the shape of the resulting pcode - either by exact array
 * equality (for small, fully deterministic programs, values taken from
 * actually running the code) or by searching for specific opcodes.
 */

describe("encoder: statement.ts dispatcher", () => {
  it("passStatement contributes no pcode at all", () => {
    // Python's "pass" keyword is the cleanest real source of a bare
    // passStatement (Pascal only produces one from a comment). If the
    // dispatcher's passStatement arm does anything other than "return []",
    // this equality would fail.
    const withPass = compileAndEncode("Python", "x = 1\npass\ny = 2");
    const withoutPass = compileAndEncode("Python", "x = 1\ny = 2");
    assertEquals(withPass, withoutPass);
  });

  it("reaches the forStatement arm of the dispatcher", () => {
    // forStatement.ts itself is fully covered elsewhere (encode.test.ts);
    // this is only here so statement.ts's own switch is fully exercised by
    // this file's coverage run too.
    const pcode = compileAndEncode("Python", "for i in range(3):\n    x = i");
    assertEquals(includesCode(pcode, PCode.jump), true);
    assertEquals(includesCode(pcode, PCode.ifno), true);
  });
});

describe("encoder: statements/ifStatement.ts", () => {
  it("encodes a plain IF (no ELSE) with a single forward ifno jump and no jump", () => {
    const pcode = compileAndEncode("Python", "x = 0\nif True:\n    x = 1");
    assertEquals(pcode, [
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 7, 172, 160, 19,
        186,
      ],
      [
        15, 1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [160, 0, 167, 19],
      [160, 1, 177, 6],
      [160, 1, 167, 19],
      [178],
    ]);
    assertEquals(countOf(pcode, PCode.ifno), 1);
    assertEquals(countOf(pcode, PCode.jump), 0);
  });

  it("encodes an IF-ELSE with an extra middle jump past the ELSE branch", () => {
    const pcode = compileAndEncode(
      "Python",
      "x = 0\nif True:\n    x = 1\nelse:\n    x = 2",
    );
    assertEquals(pcode, [
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 7, 172, 160, 19,
        186,
      ],
      [
        15, 1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [160, 0, 167, 19],
      [160, 1, 177, 7],
      [160, 1, 167, 19],
      [176, 8],
      [160, 2, 167, 19],
      [178],
    ]);
    // the IF-ELSE shape adds exactly one unconditional jump (the "middle
    // line") on top of the same single ifno the plain-IF form has
    assertEquals(countOf(pcode, PCode.ifno), 1);
    assertEquals(countOf(pcode, PCode.jump), 1);
  });
});

describe("encoder: statements/procedureCall.ts", () => {
  it("encodes a native command call using the command's own opcode, not PCode.subr", () => {
    const pcode = compileAndEncode("Python", "forward(10)");
    assertEquals(includesCode(pcode, PCode.subr), false);
  });

  it("encodes a custom subroutine call using PCode.subr with the subroutine's index", () => {
    const pcode = compileAndEncode("Python", "def go():\n    pass\ngo()");
    assertEquals(includesCode(pcode, PCode.subr), true);
  });

  // print()'s three named-argument behaviours match real Python, and the Delphi
  // Turtle System. The observable
  // semantics are covered behaviourally in
  // test/core/compiler/pythonPrint.test.ts; what's pinned here is the
  // *encoding* - specifically that the default separator is a real LSTR " "
  // written through WRIT, and that the default terminator stays the cheaper
  // PCode.newl rather than becoming an LSTR "\n".

  it("Python print(): writes a default LSTR ' ' separator between positional arguments", () => {
    const pcode = compileAndEncode("Python", 'print("a", "b")');
    // LSTR "a", WRIT, LSTR " ", WRIT, LSTR "b", WRIT, NEWL, then HALT's line
    assertEquals(
      pcode[2],
      [166, 1, 97, 203, 166, 1, 32, 203, 166, 1, 98, 203, 204, 190],
    );
    assertEquals(countOf(pcode, PCode.writ), 3); // "a", the separator, "b"
    assertEquals(includesCode(pcode, PCode.newl), true);
  });

  it("Python print(): an explicit sep replaces the default, and is emitted once per gap", () => {
    const pcode = compileAndEncode("Python", 'print("a", "b", "c", sep="")');
    // sep="" still costs an LSTR 0 + WRIT per gap - two gaps, so five WRITs
    assertEquals(countOf(pcode, PCode.writ), 5);
    assertEquals(includesCode(pcode, PCode.newl), true);
  });

  it("Python print(): a named 'end' replaces PCode.newl and IS itself written", () => {
    const pcode = compileAndEncode("Python", 'print("a", end="!")');
    // LSTR "a", WRIT, LSTR "!", WRIT - no NEWL
    assertEquals(pcode[2], [166, 1, 97, 203, 166, 1, 33, 203, 190]);
    assertEquals(countOf(pcode, PCode.writ), 2);
    assertEquals(includesCode(pcode, PCode.newl), false);
  });

  it("Python print(): a single argument emits no separator at all", () => {
    const pcode = compileAndEncode("Python", 'print("a")');
    assertEquals(pcode[2], [166, 1, 97, 203, 204, 190]);
    assertEquals(countOf(pcode, PCode.writ), 1);
  });
});

describe("encoder: lists.ts (Python list methods in statement position)", () => {
  // ".append"/".insert"/".extend" are prefixed with a growth guard: "if the
  // list is full (and hasn't already been regrown to the fixed 1024-cell
  // target), allocate a new block, copy the old contents in, and store the
  // new base address back into the list variable". That last store is the
  // only part of the guard whose encoding depends on where the variable
  // lives, so it's tested both ways round here.

  it("the growth guard stores the regrown list back with PCode.stvg for a global list", () => {
    const pcode = compileAndEncode(
      "Python",
      "y = [1, 2]\ny.append(3)\nprint(y)",
    );
    // the guard's condition: length (main[base]) >= capacity (main[base+1])
    // AND capacity < 1024, then ifno past the regrow body
    assertEquals(pcode[3], [
      PCode.ldvg,
      19,
      PCode.lptr,
      PCode.ldvg,
      19,
      PCode.ldin,
      1,
      PCode.plus,
      PCode.lptr,
      PCode.mreq,
      PCode.ldvg,
      19,
      PCode.ldin,
      1,
      PCode.plus,
      PCode.lptr,
      PCode.ldin,
      1024,
      PCode.less,
      PCode.and,
      PCode.ifno,
      6,
    ]);
    // the regrow body, ending in the store back into the global "y"
    assertEquals(pcode[4], [
      PCode.lihp,
      1024,
      PCode.dupl,
      PCode.ldvg,
      19,
      PCode.lcpy,
      4,
      PCode.hfix,
      PCode.stvg,
      19,
    ]);
    // and the guard really does fire here (the literal sized the block to
    // exactly 2 cells, so the third element needs the bigger block)
    assertEquals(runPcode(pcode).output.outputText, "[1, 2, 3]\n");
  });

  it("the growth guard stores the regrown list back with PCode.stvv for a local list", () => {
    const pcode = compileAndEncode(
      "Python",
      "def build():\n    y = [1, 2]\n    y.append(3)\n    print(y)\n\nbuild()",
    );
    // same guard, but every read/write of "y" is now a subroutine-local
    // ldvv/stvv pair (subroutine address 12, variable address 1) instead
    assertEquals(pcode[7], [
      PCode.ldvv,
      12,
      1,
      PCode.lptr,
      PCode.ldvv,
      12,
      1,
      PCode.ldin,
      1,
      PCode.plus,
      PCode.lptr,
      PCode.mreq,
      PCode.ldvv,
      12,
      1,
      PCode.ldin,
      1,
      PCode.plus,
      PCode.lptr,
      PCode.ldin,
      1024,
      PCode.less,
      PCode.and,
      PCode.ifno,
      10,
    ]);
    assertEquals(pcode[8], [
      PCode.lihp,
      1024,
      PCode.dupl,
      PCode.ldvv,
      12,
      1,
      PCode.lcpy,
      4,
      PCode.hfix,
      PCode.stvv,
      12,
      1,
    ]);
    assertEquals(includesCode(pcode, PCode.stvg), false);
    assertEquals(runPcode(pcode).output.outputText, "[1, 2, 3]\n");
  });

  // NOT TESTED, believed unreachable: both of lists.ts's "the receiver
  // isn't a plain variable, so bail out and return null" guards
  // (listProcedureCallCode's `receiver.expressionType !== "variable"` and
  // listFunctionCallCode's equivalent ternary + `if (!variable)`). A
  // dot-method call can only be parsed in two places - python/statement.ts
  // (statement position) and parser/common/factor.ts (expression position)
  // - and both require an identifier that resolves to a variable *first*,
  // then build the receiver with makeVariableValue(). "[1,2,3].append(4)"
  // and "y.copy().index(2)" are both rejected by the parser, well before
  // the encoder sees anything.
  //
  // ALSO NOT TESTED, but for a different reason - the three
  // `variable.listElementKind ?? "integer"` fallbacks in lists.ts
  // (listGrowthGuard, listProcedureCallCode, listFunctionCallCode). A list
  // variable normally always reaches the encoder with a definite element
  // kind, because python/parser.ts's checkForUncertainTypes rejects
  // anything still uncertain. The one way round that is a program like
  // "x = []" followed by "x = 5": parser/common/typeCheck.ts sets
  // `isList = true` when it first infers from "[]", and the later scalar
  // assignment then sets `typeIsCertain = true` *without* clearing
  // `isList`, so "x" arrives at the encoder flagged as a list with no
  // element kind (and "x.extend([1,2])" then compiles, emitting pcode that
  // treats the integer 5 as a heap base address). That's a parser
  // soundness hole, not an encoder behaviour worth pinning down with a
  // test - deliberately left uncovered rather than enshrined. See this
  // task's report.
});

describe("encoder: statements/repeatStatement.ts vs statements/whileStatement.ts", () => {
  // These two conceptually-similar loops lower through genuinely different
  // encoder handlers with different jump shapes:
  //  - repeatStatement.ts: condition-at-end, a single PCode.ifno back to
  //    the loop start (the "back jump" IS the conditional jump - false
  //    means "go again"); no separate unconditional PCode.jump at all.
  //  - whileStatement.ts: condition-at-start, PCode.ifno forwards out of
  //    the loop, plus a separate unconditional PCode.jump back to the top.
  //
  // Both Pascal's REPEAT...UNTIL and BASIC's REPEAT...UNTIL parse to a
  // RepeatStatement; C/Java/TypeScript's DO...WHILE *also* parses to a
  // RepeatStatement (confirmed by grep: their doStatement.ts parsers all
  // import makeRepeatStatement, not makeWhileStatement) - it's C/Java's
  // "while" *keyword* loop (and every language's plain WHILE) that
  // produces a WhileStatement. So DO...WHILE and WHILE are the pair that
  // actually needs distinguishing here, not REPEAT vs WHILE.

  it("Pascal REPEAT...UNTIL: one ifno, zero unconditional jumps", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nvar x: integer;\nbegin\nx := 0;\nrepeat\nx := x + 1;\nuntil x = 3;\nend.",
    );
    assertEquals(pcode, [
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 7, 172, 160, 19,
        186,
      ],
      [
        15, -1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [160, 0, 167, 19],
      [161, 19, 7, 167, 19],
      [161, 19, 160, 3, 48, 177, 4],
      [178],
    ]);
    assertEquals(countOf(pcode, PCode.ifno), 1);
    assertEquals(countOf(pcode, PCode.jump), 0);
  });

  it("Python WHILE: one ifno (forward, out of the loop) plus one unconditional jump back", () => {
    const pcode = compileAndEncode(
      "Python",
      "x = 0\nwhile x < 3:\n    x = x + 1",
    );
    assertEquals(pcode, [
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 7, 172, 160, 19,
        186,
      ],
      [
        15, 1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [160, 0, 167, 19],
      [161, 19, 160, 3, 50, 177, 7],
      [161, 19, 7, 167, 19],
      [176, 4],
      [178],
    ]);
    assertEquals(countOf(pcode, PCode.ifno), 1);
    assertEquals(countOf(pcode, PCode.jump), 1);
  });

  it("C DO...WHILE lowers through repeatStatement.ts, not whileStatement.ts", () => {
    // Compare jump counts against an equivalent C WHILE loop, wrapped in
    // an identical single-subroutine ("void main") shape so both pcodes
    // carry the same one "jump over the subroutine definitions" hoist
    // jump - any further difference must come from the loop encoding
    // itself, not from the surrounding program shape.
    const doWhile = compileAndEncode(
      "C",
      "void main () {\nint x;\nx = 0;\ndo {\nx = x + 1;\n} while (x < 3);\n}",
    );
    const plainWhile = compileAndEncode(
      "C",
      "void main () {\nint x;\nx = 0;\nwhile (x < 3) {\nx = x + 1;\n}\n}",
    );
    // both have exactly one ifno (the loop condition test)
    assertEquals(countOf(doWhile, PCode.ifno), 1);
    assertEquals(countOf(plainWhile, PCode.ifno), 1);
    // DO-WHILE (repeatStatement.ts): only the hoist jump, no loop-back jump
    assertEquals(countOf(doWhile, PCode.jump), 1);
    // WHILE (whileStatement.ts): the hoist jump AND a loop-back jump
    assertEquals(countOf(plainWhile, PCode.jump), 2);
  });
});

describe("encoder: statements/breakStatement.ts & statements/continueStatement.ts", () => {
  // Every "break"/"continue" emits a placeholder `[PCode.jump, 0]`
  // (breakStatement.ts/
  // continueStatement.ts) that the enclosing loop's own encoder
  // back-patches once it knows its real target lines (loopContext.ts) - so
  // the interesting thing to verify here is that the *target* ends up
  // correct, not just that a jump exists. Expected arrays are exact
  // copies of real compiler output (per this file's own header comment).

  it("a 'while' loop's break jump targets exactly the same line as the loop's own forward ifno (the loop's exit)", () => {
    const pcode = compileAndEncode(
      "Python",
      "x = 0\nwhile x < 3:\n    if x == 1:\n        break\n    x = x + 1",
    );
    assertEquals(pcode, [
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 7, 172, 160, 19,
        186,
      ],
      [
        15, 1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [160, 0, 167, 19],
      [161, 19, 160, 3, 50, 177, 9],
      [161, 19, 160, 1, 48, 177, 7],
      [176, 9],
      [161, 19, 7, 167, 19],
      [176, 4],
      [178],
    ]);
    // the while condition's own ifno and the break's unconditional jump
    // both target line 9 - the loop's exit
    const conditionLine = pcode[3];
    const breakLine = pcode[5];
    assertEquals(conditionLine.at(-1), breakLine.at(-1));
  });

  it("a 'while' loop's continue jump targets exactly the same line as the loop's own back-jump (the condition re-test)", () => {
    const pcode = compileAndEncode(
      "Python",
      "x = 0\nc = 0\nwhile x < 3:\n    x = x + 1\n    if x == 2:\n        continue\n    c = c + 1",
    );
    assertEquals(pcode, [
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 8, 172, 160, 20,
        186,
      ],
      [
        15, 1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [160, 0, 167, 19],
      [160, 0, 167, 20],
      [161, 19, 160, 3, 50, 177, 11],
      [161, 19, 7, 167, 19],
      [161, 19, 160, 2, 48, 177, 9],
      [176, 5],
      [161, 20, 7, 167, 20],
      [176, 5],
      [178],
    ]);
    const backJumpLine = pcode[9];
    const continueLine = pcode[7];
    assertEquals(continueLine.at(-1), backJumpLine.at(-1));
    assertEquals(continueLine.at(-1), 5);
  });

  it("a 'for' loop's continue jump targets the increment step, not the condition - skipping it would infinite-loop", () => {
    const pcode = compileAndEncode(
      "Python",
      "c = 0\nfor i in range(5):\n    if i == 2:\n        continue\n    c = c + 1",
    );
    assertEquals(pcode, [
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 8, 172, 160, 20,
        186,
      ],
      [
        15, 1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [160, 0, 167, 19],
      [160, 0, 167, 20],
      [161, 20, 160, 5, 50, 177, 10],
      [161, 20, 160, 2, 48, 177, 8],
      [176, 9],
      [161, 19, 7, 167, 19],
      [161, 20, 7, 167, 20, 176, 5],
      [178],
    ]);
    // the "change" line (increment i, then jump back to the condition) is
    // exactly what continue targets - not the condition line (5)
    const changeLine = pcode[8];
    const continueLine = pcode[6];
    assertEquals(continueLine.at(-1), 9);
    assertEquals(changeLine[0], 161); // the change line really does start with the increment
  });

  it("a 'for' loop's break jump targets exactly the same line as the loop's own forward ifno (the loop's exit)", () => {
    const pcode = compileAndEncode(
      "Python",
      "for i in range(5):\n    if i == 2:\n        break",
    );
    assertEquals(pcode, [
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 7, 172, 160, 19,
        186,
      ],
      [
        15, 1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [160, 0, 167, 19],
      [161, 19, 160, 5, 50, 177, 8],
      [161, 19, 160, 2, 48, 177, 7],
      [176, 8],
      [161, 19, 7, 167, 19, 176, 4],
      [178],
    ]);
    const conditionLine = pcode[3];
    const breakLine = pcode[5];
    assertEquals(conditionLine.at(-1), breakLine.at(-1));
  });

  it("a 'break' in a nested loop only patches the inner loop's exit, not the outer loop's", () => {
    const pcode = compileAndEncode(
      "Python",
      "for i in range(3):\n    for j in range(3):\n        if j == 1:\n            break",
    );
    assertEquals(pcode, [
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 8, 172, 160, 20,
        186,
      ],
      [
        15, 1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [160, 0, 167, 19],
      [161, 19, 160, 3, 50, 177, 11],
      [160, 0, 167, 20],
      [161, 20, 160, 3, 50, 177, 10],
      [161, 20, 160, 1, 48, 177, 9],
      [176, 10],
      [161, 20, 7, 167, 20, 176, 6],
      [161, 19, 7, 167, 19, 176, 4],
      [178],
    ]);
    const outerConditionLine = pcode[3];
    const innerConditionLine = pcode[5];
    const breakLine = pcode[7];
    // the inner break targets the inner loop's own exit...
    assertEquals(breakLine.at(-1), innerConditionLine.at(-1));
    // ...which is a different (earlier) line than the outer loop's exit
    assertEquals(outerConditionLine.at(-1) === breakLine.at(-1), false);
  });

  it("reaches the breakStatement/continueStatement arms of the statement.ts dispatcher", () => {
    // belt-and-braces for this file's own coverage run, alongside the
    // shape assertions above
    const withBreak = compileAndEncode("Python", "while True:\n    break");
    const withContinue = compileAndEncode(
      "Python",
      "while True:\n    continue",
    );
    assertEquals(includesCode(withBreak, PCode.jump), true);
    assertEquals(includesCode(withContinue, PCode.jump), true);
  });
});

describe("encoder: statements/returnStatement.ts", () => {
  // returnStatement.ts always has the same shape: it delegates to
  // variableAssignment.ts (to assign the returned value to the "!result"/
  // "result" variable) and then appends a fixed 8-value housekeeping
  // sequence: ldvg <sub>, stvg <result>, memr <sub>, plsr, retn. Only
  // languages/subroutine-kinds that support returning a value can reach
  // it (functions, not void procedures/methods) - tested here via two
  // languages with two different result types, since variableAssignment's
  // own branches differ by type (scalar vs string).
  const housekeeping = [
    PCode.ldvg,
    PCode.stvg,
    PCode.memr,
    PCode.plsr,
    PCode.retn,
  ];

  it("C: an integer-returning function's return statement", () => {
    const pcode = compileAndEncode(
      "C",
      "int doubleIt (int n) {\nreturn n * 2;\n}\nvoid main () {\nint x;\nx = doubleIt(2);\n}",
    );
    for (const code of housekeeping) {
      assertEquals(
        includesCode(pcode, code),
        true,
        `expected ${PCode[code]} in pcode`,
      );
    }
    // the scalar (non-string) branch of variableAssignment.ts's
    // localVariableAssignment is used for the "!result"/result assignment
    // itself, i.e. no PCode.cstr from this return statement
    assertEquals(includesCode(pcode, PCode.cstr), false);
  });

  it("TypeScript: a string-returning function's return statement", () => {
    const pcode = compileAndEncode(
      "TypeScript",
      'function greet(): string { return "hi"; }\nvar y: string;\ny = greet();',
    );
    for (const code of housekeeping) {
      assertEquals(
        includesCode(pcode, code),
        true,
        `expected ${PCode[code]} in pcode`,
      );
    }
    // the string branch of localVariableAssignment is used here, so
    // PCode.cstr does appear (both for the return itself and for the
    // caller's own "y = ..." string assignment)
    assertEquals(includesCode(pcode, PCode.cstr), true);
  });
});

describe("encoder: statements/variableAssignment.ts", () => {
  it("turtle property assignment (e.g. 'turtx := ...') uses PCode.stvg on the turtle address", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nbegin\nturtx := 100;\nend.",
    );
    assertEquals(pcode, [
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 6, 172, 160, 18,
        186,
      ],
      [
        15, -1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [160, 100, 167, 13],
      [178],
    ]);
  });

  it("global scalar (integer) assignment uses PCode.stvg, no string opcodes", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nvar x: integer;\nbegin\nx := 1;\nend.",
    );
    assertEquals(pcode, [
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 7, 172, 160, 19,
        186,
      ],
      [
        15, -1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [160, 1, 167, 19],
      [178],
    ]);
    assertEquals(includesCode(pcode, PCode.cstr), false);
  });

  it("global plain string assignment uses PCode.ldvg + PCode.cstr (not the indexed/array path)", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nvar s: string;\nbegin\ns := 'hi';\nend.",
    );
    assertEquals(pcode, [
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 73, 172, 160, 85,
        186,
      ],
      [
        15, -1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [164, 21, 167, 19, 160, 65, 167, 20],
      [166, 2, 104, 105, 161, 19, 174, 190],
      [178],
    ]);
  });

  it("global integer array element assignment overwrites the trailing PCode.lptr with PCode.sptr", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nvar arr: array[1..3] of integer;\nbegin\narr[1] := 5;\nend.",
    );
    assertEquals(pcode, [
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 11, 172, 160, 23,
        186,
      ],
      [
        15, -1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [164, 20, 167, 19, 160, 3, 167, 20],
      [160, 5, 161, 19, 160, 1, 160, 1, 24, 3, 77, 23, 7, 171],
      [178],
    ]);
    // overwritten, not appended: no PCode.lptr or PCode.cstr survive
    assertEquals(includesCode(pcode, PCode.lptr), false);
    assertEquals(includesCode(pcode, PCode.cstr), false);
  });

  it("global array-of-strings element assignment appends PCode.cstr after the PCode.lptr (not an overwrite)", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nvar arr: array[1..3] of string;\nbegin\narr[1] := 'hi';\nend.",
    );
    assertEquals(pcode, [
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 209, 172, 160, 221,
        186,
      ],
      [
        15, -1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [164, 20, 167, 19, 160, 3, 167, 20],
      [164, 25, 167, 21, 160, 65, 167, 24],
      [164, 91, 167, 22, 160, 65, 167, 90],
      [164, 157, 167, 23, 160, 65, 167, 156],
      [
        166, 2, 104, 105, 161, 19, 160, 1, 160, 1, 24, 3, 77, 23, 7, 170, 174,
        190,
      ],
      [178],
    ]);
    // both survive here: PCode.lptr (loads the element's address) then
    // PCode.cstr (writes the string at that address), unlike the plain
    // integer-array case above where lptr gets overwritten to sptr
    assertEquals(includesCode(pcode, PCode.lptr), true);
    assertEquals(includesCode(pcode, PCode.cstr), true);
  });

  it("global string char-index assignment ('s[1] := ...') takes the same sptr path as a plain array, via the type===string clause", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nvar s: string;\nbegin\ns[1] := 'x';\nend.",
    );
    assertEquals(pcode, [
      [
        160, 12, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 73, 172, 160, 85,
        186,
      ],
      [
        15, -1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [164, 21, 167, 19, 160, 65, 167, 20],
      [160, 120, 160, 1, 8, 161, 19, 77, 23, 7, 171],
      [178],
    ]);
    assertEquals(includesCode(pcode, PCode.cstr), false);
  });

  it("pointer variable assignment (non-string) uses PCode.poke", () => {
    // pointer variables ("int* p") are only ever local (C's top-level
    // declaration dispatcher doesn't understand "*" - see c.test.ts), so
    // this exercises the isPointer branch, which is checked before the
    // isGlobal/local split further down variableAssignment's dispatcher
    const pcode = compileAndEncode("C", "void main () {\nint* p;\np = 5;\n}");
    assertEquals(pcode, [
      [
        160, 13, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 6, 172, 160, 19,
        186,
      ],
      [
        15, -1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [176, 9],
      [181, 1],
      [187, 12, 1],
      [165, 12, 1, 160, 1, 172],
      [162, 12, 1, 160, 5, 124],
      [188, 12, 182, 180],
      [179, 4],
      [178],
    ]);
    assertEquals(includesCode(pcode, PCode.cstr), false);
  });

  it("pointer variable assignment (string) uses PCode.cstr instead of PCode.poke", () => {
    const pcode = compileAndEncode(
      "C",
      'void main () {\nstring* p;\np = "hi";\n}',
    );
    assertEquals(pcode, [
      [
        160, 13, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 6, 172, 160, 19,
        186,
      ],
      [
        15, -1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [176, 10],
      [181, 1],
      [187, 12, 1],
      [165, 12, 1, 160, 1, 172],
      [165, 12, 3, 168, 12, 1, 160, 65, 168, 12, 2],
      [162, 12, 1, 166, 2, 104, 105, 174, 190],
      [188, 12, 182, 180],
      [179, 4],
      [178],
    ]);
    assertEquals(includesCode(pcode, PCode.poke), false);
  });

  it("reference (var) parameter assignment uses PCode.stvr, not PCode.stvg/stvv", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nprocedure go(var n: integer);\nbegin\nn := 5;\nend;\nbegin\nend.",
    );
    assertEquals(pcode, [
      [
        160, 13, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 6, 172, 160, 19,
        186,
      ],
      [
        15, -1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [176, 9],
      [181, 1],
      [187, 12, 1],
      [168, 12, 1],
      [160, 5, 169, 12, 1],
      [188, 12, 182, 180],
      [178],
    ]);
    assertEquals(includesCode(pcode, PCode.stvr), true);
  });

  it("a reference (var) STRING parameter is excluded from referenceVariableAssignment and falls through to the local-string path", () => {
    // stmt.variable.isReferenceParameter is true here, but the guard also
    // requires the variable not be a string, so this exercises the
    // "excluded because it's a string" leg of that composite condition
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nprocedure go(var s: string);\nbegin\ns := 'hi';\nend;\nbegin\nend.",
    );
    assertEquals(includesCode(pcode, PCode.stvr), false);
    assertEquals(includesCode(pcode, PCode.cstr), true);
  });

  it("local scalar (integer) assignment uses PCode.stvv", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nprocedure go;\nvar x: integer;\nbegin\nx := 5;\nend;\nbegin\nend.",
    );
    assertEquals(pcode, [
      [
        160, 13, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 6, 172, 160, 19,
        186,
      ],
      [
        15, -1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [176, 9],
      [181, 1],
      [187, 12, 1],
      [165, 12, 1, 160, 1, 172],
      [160, 5, 168, 12, 1],
      [188, 12, 182, 180],
      [178],
    ]);
    assertEquals(includesCode(pcode, PCode.stvv), true);
    assertEquals(includesCode(pcode, PCode.cstr), false);
  });

  it("local string assignment uses PCode.ldvv + PCode.cstr", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nprocedure go;\nvar s: string;\nbegin\ns := 'hi';\nend;\nbegin\nend.",
    );
    assertEquals(pcode, [
      [
        160, 13, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 6, 172, 160, 19,
        186,
      ],
      [
        15, -1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [176, 10],
      [181, 1],
      [187, 12, 67],
      [165, 12, 1, 160, 67, 172],
      [165, 12, 3, 168, 12, 1, 160, 65, 168, 12, 2],
      [166, 2, 104, 105, 162, 12, 1, 174, 190],
      [188, 12, 182, 180],
      [178],
    ]);
    assertEquals(includesCode(pcode, PCode.ldvv), true);
  });

  it("local integer array element assignment overwrites the trailing PCode.lptr with PCode.sptr", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nprocedure go;\nvar arr: array[1..3] of integer;\nbegin\narr[1] := 5;\nend;\nbegin\nend.",
    );
    assertEquals(pcode, [
      [
        160, 13, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 6, 172, 160, 19,
        186,
      ],
      [
        15, -1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [176, 10],
      [181, 1],
      [187, 12, 5],
      [165, 12, 1, 160, 5, 172],
      [165, 12, 2, 168, 12, 1, 160, 3, 168, 12, 2],
      [160, 5, 162, 12, 1, 160, 1, 160, 1, 24, 3, 77, 23, 7, 171],
      [188, 12, 182, 180],
      [178],
    ]);
    assertEquals(includesCode(pcode, PCode.cstr), false);
  });

  it("local array-of-strings element assignment appends PCode.cstr after the PCode.lptr", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nprocedure go;\nvar arr: array[1..3] of string;\nbegin\narr[1] := 'hi';\nend;\nbegin\nend.",
    );
    assertEquals(pcode, [
      [
        160, 13, 2, 2, 160, 0, 171, 160, 6, 3, 171, 7, 160, 6, 172, 160, 19,
        186,
      ],
      [
        15, -1, 128, 160, 2, 133, 160, 360, 132, 160, 32, 194, 160, 1, 171, 189,
        160, 0, 2, 160, 1000, 2, 2, 2, 126, 125,
      ],
      [176, 13],
      [181, 1],
      [187, 12, 203],
      [165, 12, 1, 160, 203, 172],
      [165, 12, 2, 168, 12, 1, 160, 3, 168, 12, 2],
      [165, 12, 7, 168, 12, 3, 160, 65, 168, 12, 6],
      [165, 12, 73, 168, 12, 4, 160, 65, 168, 12, 72],
      [165, 12, 139, 168, 12, 5, 160, 65, 168, 12, 138],
      [
        166, 2, 104, 105, 162, 12, 1, 160, 1, 160, 1, 24, 3, 77, 23, 7, 170,
        174, 190,
      ],
      [188, 12, 182, 180],
      [178],
    ]);
    assertEquals(includesCode(pcode, PCode.lptr), true);
    assertEquals(includesCode(pcode, PCode.cstr), true);
  });

  it("local integer list element assignment takes the sptr path, with no hstr/hfix fix-up", () => {
    const pcode = compileAndEncode(
      "Python",
      "def f():\n    nums = [1, 2]\n    nums[0] = 9\n    print(nums)\n\nf()",
    );
    // ldin 9 (the value), then the element *read* encoding for "nums[0]"
    // with its trailing lptr swapped for sptr - and nothing else: an
    // integer-kind list element holds no heap pointer, so there's no
    // string to clone (hstr) or block to promote (hfix)
    assertEquals(pcode[7], [
      PCode.ldin,
      9,
      PCode.ldvv,
      12,
      1,
      PCode.ldin,
      0,
      PCode.dupl,
      PCode.ldin,
      0,
      PCode.less,
      PCode.ldvv,
      12,
      1,
      PCode.lptr,
      PCode.mult,
      PCode.plus,
      PCode.swap,
      PCode.test,
      PCode.plus,
      PCode.ldin,
      5,
      PCode.plus,
      PCode.sptr,
    ]);
    assertEquals(pcode[7].includes(PCode.hstr), false);
    assertEquals(pcode[7].includes(PCode.hfix), false);
    assertEquals(runPcode(pcode).output.outputText, "[9, 2]\n");
  });

  it("local string list element assignment clones the value with hstr and promotes the write with hfix", () => {
    const pcode = compileAndEncode(
      "Python",
      'def f():\n    words = ["a", "b"]\n    c = "z"\n    words[0] = c\n    c = "q"\n    print(words)\n\nf()',
    );
    // ldvv (read "c") + hstr (clone it onto a fresh heap block, because a
    // scalar string variable's own buffer is written in place by any later
    // "c = ..." and would otherwise change the list element's content out
    // from under it), then the element write (... sptr), then hfix to
    // promote the newly-stored pointer out of temporary heap space
    assertEquals(pcode[9], [
      PCode.ldvv,
      12,
      2,
      PCode.hstr,
      PCode.ldvv,
      12,
      1,
      PCode.ldin,
      0,
      PCode.dupl,
      PCode.ldin,
      0,
      PCode.less,
      PCode.ldvv,
      12,
      1,
      PCode.lptr,
      PCode.mult,
      PCode.plus,
      PCode.swap,
      PCode.test,
      PCode.plus,
      PCode.ldin,
      5,
      PCode.plus,
      PCode.sptr,
      PCode.hfix,
    ]);
    // the behaviour that hstr buys, end to end: "c" is reassigned to "q"
    // *after* the write, and the list must not follow it. (Verified to be
    // a real regression test rather than a shape check: deleting just the
    // hstr from this pcode by hand makes the program print ['q', 'b'].)
    assertEquals(runPcode(pcode).output.outputText, "['z', 'b']\n");
  });
});
