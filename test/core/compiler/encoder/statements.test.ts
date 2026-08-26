import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import { PCode } from "@/core/constants.ts";
import { compileAndEncode, countOf, includesCode } from "./lib/helpers.ts";
import { runPcode } from "../../machine/lib/helpers.ts";

/**
 * Covers `src/core/compiler/encoder/statement.ts` (the statementType
 * dispatcher) and everything under `src/core/compiler/encoder/statements/`.
 * `forStatement.ts` is already fully covered by
 * `test/core/compiler/encode.test.ts` and isn't specifically targeted here
 * (though the break/continue tests below reach it incidentally).
 *
 * `encode()` isn't part of `@/core/compiler.ts`'s public surface beyond the
 * single `encode()` entry point (see `lib/helpers.ts`), so every test here
 * builds a real per-language program that reaches the target branch and
 * inspects the shape of the resulting pcode. Every program opens with the
 * same startup prelude (memory setup, turtle defaults), which belongs to
 * the program encoder, not to any statement - so tests here pin only the
 * statement's *own* lines, located from the end of the program (where the
 * main-program statements always sit, just before the final halt line),
 * plus the relationships between jump operands and their target lines.
 * Jump operands are 1-based line numbers: the line at pcode[i] is line
 * i + 1, and the final halt line is line pcode.length.
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
});

describe("encoder: statements/ifStatement.ts", () => {
  it("encodes a plain IF (no ELSE) with a single forward ifno jump and no jump", () => {
    const pcode = compileAndEncode("Python", "x = 0\nif True:\n    x = 1");
    // the main program is the last four lines: "x = 0", the condition, the
    // branch, and the final halt
    const [assignment, condition, branch, halt] = pcode.slice(-4);
    assertEquals(assignment, [PCode.ldin, 0, PCode.stvg, 19]); // 19 = "x"
    // "True" is just LDIN 1, and the ifno jumps forward past the branch -
    // here, to the halt line
    assertEquals(condition, [PCode.ldin, 1, PCode.ifno, pcode.length]);
    assertEquals(branch, [PCode.ldin, 1, PCode.stvg, 19]);
    assertEquals(halt, [PCode.halt]);
    assertEquals(countOf(pcode, PCode.ifno), 1);
    assertEquals(countOf(pcode, PCode.jump), 0);
  });

  it("encodes an IF-ELSE with an extra middle jump past the ELSE branch", () => {
    const pcode = compileAndEncode(
      "Python",
      "x = 0\nif True:\n    x = 1\nelse:\n    x = 2",
    );
    const [condition, ifBranch, middleJump, elseBranch, halt] = pcode.slice(-5);
    const haltLineNumber = pcode.length;
    // the condition's ifno jumps into the ELSE branch (the line before the
    // halt)...
    assertEquals(condition, [PCode.ldin, 1, PCode.ifno, haltLineNumber - 1]);
    assertEquals(ifBranch, [PCode.ldin, 1, PCode.stvg, 19]); // 19 = "x"
    // ...and the "middle line" jumps unconditionally past that ELSE branch
    assertEquals(middleJump, [PCode.jump, haltLineNumber]);
    assertEquals(elseBranch, [PCode.ldin, 2, PCode.stvg, 19]);
    assertEquals(halt, [PCode.halt]);
    // the IF-ELSE shape adds exactly one unconditional jump (the "middle
    // line") on top of the same single ifno the plain-IF form has
    assertEquals(countOf(pcode, PCode.ifno), 1);
    assertEquals(countOf(pcode, PCode.jump), 1);
  });
});

describe("encoder: statements/procedureCall.ts", () => {
  it("encodes a native command call using the command's own opcode, not PCode.subr", () => {
    const pcode = compileAndEncode("Python", "forward(10)");
    assertFalse(includesCode(pcode, PCode.subr));
  });

  it("encodes a custom subroutine call using PCode.subr with the subroutine's index", () => {
    const pcode = compileAndEncode("Python", "def go():\n    pass\ngo()");
    assert(includesCode(pcode, PCode.subr));
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
    assert(includesCode(pcode, PCode.newl));
  });

  it("Python print(): an explicit sep replaces the default, and is emitted once per gap", () => {
    const pcode = compileAndEncode("Python", 'print("a", "b", "c", sep="")');
    // sep="" still costs an LSTR 0 + WRIT per gap - two gaps, so five WRITs
    assertEquals(countOf(pcode, PCode.writ), 5);
    assert(includesCode(pcode, PCode.newl));
  });

  it("Python print(): a named 'end' replaces PCode.newl and IS itself written", () => {
    const pcode = compileAndEncode("Python", 'print("a", end="!")');
    // LSTR "a", WRIT, LSTR "!", WRIT - no NEWL
    assertEquals(pcode[2], [166, 1, 97, 203, 166, 1, 33, 203, 190]);
    assertEquals(countOf(pcode, PCode.writ), 2);
    assertFalse(includesCode(pcode, PCode.newl));
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
    assertFalse(includesCode(pcode, PCode.stvg));
    assertEquals(runPcode(pcode).output.outputText, "[1, 2, 3]\n");
  });

  // Genuinely unreachable, marked with deno-coverage-ignore in lists.ts:
  //
  // - Both "the receiver isn't a plain variable, so bail out and return
  //   null" guards (listProcedureCallCode's `receiver.expressionType !==
  //   "variable"` and listFunctionCallCode's equivalent ternary + `if
  //   (!variable)`). A dot-method call can only be parsed in two places -
  //   python/statement.ts (statement position) and parser/common/factor.ts
  //   (expression position) - and both require an identifier that resolves
  //   to a variable *first*, then build the receiver with
  //   makeVariableValue(). "[1,2,3].append(4)" and "y.copy().index(2)" are
  //   both rejected by the parser, well before the encoder sees anything.
  //
  // - The three `variable.listElementKind ?? "integer"` fallbacks
  //   (listGrowthGuard, listProcedureCallCode, listFunctionCallCode). A
  //   list variable always reaches the encoder with a definite element
  //   kind: python/parser.ts's checkForUncertainTypes rejects any program
  //   in which a hint-less "x = []" is never pinned to a kind, and
  //   parser/common/typeCheck.ts rejects the one scalar-reassignment shape
  //   ("x = []" then "x = 5") that could otherwise smuggle a kind-less
  //   list-flagged variable past it. The test below pins both rejections,
  //   so if either parser check is ever loosened, this fails and the
  //   fallbacks need real tests.
  it("the parser rejects every program shape that could reach lists.ts's kind-less-list fallbacks", () => {
    // a hint-less "x = []" whose element kind nothing ever reveals
    assertThrows(
      () => compileAndEncode("Python", "x = []\nx.reverse()"),
      Error,
      "Could not infer the type of variable x.",
    );
    // a scalar reassignment cannot strip the pinned list-ness either
    assertThrows(
      () => compileAndEncode("Python", "x = []\nx = 5"),
      Error,
      "Type error: a list was expected.",
    );
  });
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
    const [body, condition, halt] = pcode.slice(-3);
    // "x := x + 1" (19 = "x"; the + 1 folds to a single incr)
    assertEquals(body, [PCode.ldvg, 19, PCode.incr, PCode.stvg, 19]);
    // the condition sits at the END, and its ifno IS the back jump: false
    // means "go round again", back to the body line
    const bodyLineNumber = pcode.length - 2;
    assertEquals(condition, [
      PCode.ldvg,
      19,
      PCode.ldin,
      3,
      PCode.eqal,
      PCode.ifno,
      bodyLineNumber,
    ]);
    assertEquals(halt, [PCode.halt]);
    assertEquals(countOf(pcode, PCode.ifno), 1);
    assertEquals(countOf(pcode, PCode.jump), 0);
  });

  it("Python WHILE: one ifno (forward, out of the loop) plus one unconditional jump back", () => {
    const pcode = compileAndEncode(
      "Python",
      "x = 0\nwhile x < 3:\n    x = x + 1",
    );
    const [condition, body, backJump, halt] = pcode.slice(-4);
    const conditionLineNumber = pcode.length - 3;
    // the condition sits at the TOP, and its ifno jumps forward out of the
    // loop, to the halt line
    assertEquals(condition, [
      PCode.ldvg,
      19, // "x"
      PCode.ldin,
      3,
      PCode.less,
      PCode.ifno,
      pcode.length,
    ]);
    assertEquals(body, [PCode.ldvg, 19, PCode.incr, PCode.stvg, 19]);
    // a separate unconditional jump closes the loop
    assertEquals(backJump, [PCode.jump, conditionLineNumber]);
    assertEquals(halt, [PCode.halt]);
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
  // correct, not just that a jump exists.

  it("a 'while' loop's break jump targets exactly the same line as the loop's own forward ifno (the loop's exit)", () => {
    const pcode = compileAndEncode(
      "Python",
      "x = 0\nwhile x < 3:\n    if x == 1:\n        break\n    x = x + 1",
    );
    // the loop is the last six lines: condition, guarding if, break jump,
    // increment, back-jump, halt
    const [condition, ifCondition, breakJump, , backJump, halt] =
      pcode.slice(-6);
    const exitLineNumber = pcode.length; // the halt line, just past the loop
    // the while condition's own ifno and the break's unconditional jump
    // both target the loop's exit
    assertEquals(condition?.slice(-2), [PCode.ifno, exitLineNumber]);
    assertEquals(breakJump, [PCode.jump, exitLineNumber]);
    // the guarding if skips just the break line itself (to the increment)
    assertEquals(ifCondition?.slice(-2), [PCode.ifno, pcode.length - 2]);
    // and the loop's own back-jump targets the condition line
    assertEquals(backJump, [PCode.jump, pcode.length - 5]);
    assertEquals(halt, [PCode.halt]);
  });

  it("a 'while' loop's continue jump targets exactly the same line as the loop's own back-jump (the condition re-test)", () => {
    const pcode = compileAndEncode(
      "Python",
      "x = 0\nc = 0\nwhile x < 3:\n    x = x + 1\n    if x == 2:\n        continue\n    c = c + 1",
    );
    // the loop is the last seven lines: condition, x-increment, guarding
    // if, continue jump, c-increment, back-jump, halt
    const [condition, , , continueJump, , backJump] = pcode.slice(-7);
    const conditionLineNumber = pcode.length - 6;
    // that line really is the loop condition ("x < 3", 19 = "x", exiting
    // to the halt line)...
    assertEquals(condition, [
      PCode.ldvg,
      19,
      PCode.ldin,
      3,
      PCode.less,
      PCode.ifno,
      pcode.length,
    ]);
    // ...the loop's own back-jump targets it, and continue is encoded as
    // exactly the same jump
    assertEquals(backJump, [PCode.jump, conditionLineNumber]);
    assertEquals(continueJump, [PCode.jump, conditionLineNumber]);
  });

  it("a 'for' loop's continue jump targets the increment step, not the condition - skipping it would infinite-loop", () => {
    const pcode = compileAndEncode(
      "Python",
      "c = 0\nfor i in range(5):\n    if i == 2:\n        continue\n    c = c + 1",
    );
    // the loop is the last six lines: condition, guarding if, continue
    // jump, c-increment, "change" line, halt
    const [condition, , continueJump, , changeLine, halt] = pcode.slice(-6);
    const changeLineNumber = pcode.length - 1;
    const conditionLineNumber = pcode.length - 5;
    // the "change" line increments i (20 = "i") and only then jumps back
    // to the condition...
    assertEquals(changeLine, [
      PCode.ldvg,
      20,
      PCode.incr,
      PCode.stvg,
      20,
      PCode.jump,
      conditionLineNumber,
    ]);
    // ...and continue targets that change line, not the condition line
    assertEquals(continueJump, [PCode.jump, changeLineNumber]);
    // (the condition, for its part, exits the loop to the halt line)
    assertEquals(condition?.slice(-2), [PCode.ifno, pcode.length]);
    assertEquals(halt, [PCode.halt]);
  });

  it("a 'for' loop's break jump targets exactly the same line as the loop's own forward ifno (the loop's exit)", () => {
    const pcode = compileAndEncode(
      "Python",
      "for i in range(5):\n    if i == 2:\n        break",
    );
    // the loop is the last five lines: condition, guarding if, break jump,
    // "change" line, halt
    const [condition, ifCondition, breakJump, changeLine] = pcode.slice(-5);
    const exitLineNumber = pcode.length; // the halt line
    // the for condition's own ifno and the break's unconditional jump both
    // target the loop's exit
    assertEquals(condition?.slice(-2), [PCode.ifno, exitLineNumber]);
    assertEquals(breakJump, [PCode.jump, exitLineNumber]);
    // the guarding if skips just the break line itself (to the change line)
    assertEquals(ifCondition?.slice(-2), [PCode.ifno, pcode.length - 1]);
    // and the change line jumps back to the condition
    assertEquals(changeLine?.slice(-2), [PCode.jump, pcode.length - 4]);
  });

  it("a 'break' in a nested loop only patches the inner loop's exit, not the outer loop's", () => {
    const pcode = compileAndEncode(
      "Python",
      "for i in range(3):\n    for j in range(3):\n        if j == 1:\n            break",
    );
    // the nested loops are the last eight lines: outer condition, inner
    // init, inner condition, guarding if, break jump, inner change line,
    // outer change line, halt
    const [outerCondition, , innerCondition, , breakJump] = pcode.slice(-8);
    // the inner break targets the inner loop's own exit (the outer loop's
    // change line, just before the halt)...
    assertEquals(innerCondition?.slice(-2), [PCode.ifno, pcode.length - 1]);
    assertEquals(breakJump, [PCode.jump, pcode.length - 1]);
    // ...which is a different (earlier) line than the outer loop's exit
    // (the halt line)
    assertEquals(outerCondition?.slice(-2), [PCode.ifno, pcode.length]);
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
      assert(includesCode(pcode, code), `expected ${PCode[code]} in pcode`);
    }
    // the scalar (non-string) branch of variableAssignment.ts's
    // localVariableAssignment is used for the "!result"/result assignment
    // itself, i.e. no PCode.cstr from this return statement
    assertFalse(includesCode(pcode, PCode.cstr));
  });

  it("TypeScript: a string-returning function's return statement", () => {
    const pcode = compileAndEncode(
      "TypeScript",
      'function greet(): string { return "hi"; }\nvar y: string;\ny = greet();',
    );
    for (const code of housekeeping) {
      assert(includesCode(pcode, code), `expected ${PCode[code]} in pcode`);
    }
    // the string branch of localVariableAssignment is used here, so
    // PCode.cstr does appear (both for the return itself and for the
    // caller's own "y = ..." string assignment)
    assert(includesCode(pcode, PCode.cstr));
  });
});

describe("encoder: statements/variableAssignment.ts", () => {
  it("turtle property assignment (e.g. 'turtx := ...') uses PCode.stvg on the turtle address", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nbegin\nturtx := 100;\nend.",
    );
    const [assignment, halt] = pcode.slice(-2);
    // 13 = the turtx cell (turtle address 12 + 1)
    assertEquals(assignment, [PCode.ldin, 100, PCode.stvg, 13]);
    assertEquals(halt, [PCode.halt]);
  });

  it("global scalar (integer) assignment uses PCode.stvg, no string opcodes", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nvar x: integer;\nbegin\nx := 1;\nend.",
    );
    const [assignment, halt] = pcode.slice(-2);
    assertEquals(assignment, [PCode.ldin, 1, PCode.stvg, 19]); // 19 = "x"
    assertEquals(halt, [PCode.halt]);
    assertFalse(includesCode(pcode, PCode.cstr));
  });

  it("global plain string assignment uses PCode.ldvg + PCode.cstr (not the indexed/array path)", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nvar s: string;\nbegin\ns := 'hi';\nend.",
    );
    const [assignment, halt] = pcode.slice(-2);
    // LSTR "hi" (104/105 = "h"/"i"), LDVG the string variable's address
    // (19 = "s"), CSTR the string into it, then clear the temporary heap
    assertEquals(assignment, [
      PCode.lstr,
      2,
      104,
      105,
      PCode.ldvg,
      19,
      PCode.cstr,
      PCode.hclr,
    ]);
    assertEquals(halt, [PCode.halt]);
  });

  it("global integer array element assignment overwrites the trailing PCode.lptr with PCode.sptr", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nvar arr: array[1..3] of integer;\nbegin\narr[1] := 5;\nend.",
    );
    const [assignment, halt] = pcode.slice(-2);
    // ldin 5 (the value), then the element-address calculation for arr[1]
    // (base 19 = "arr"; index 1 minus lower bound 1, bounds-tested) -
    // ending in sptr where a *read* of arr[1] would end in lptr
    assertEquals(assignment, [
      PCode.ldin,
      5,
      PCode.ldvg,
      19,
      PCode.ldin,
      1,
      PCode.ldin,
      1,
      PCode.subt,
      PCode.swap,
      PCode.test,
      PCode.plus,
      PCode.incr,
      PCode.sptr,
    ]);
    assertEquals(halt, [PCode.halt]);
    // overwritten, not appended: no PCode.lptr or PCode.cstr survive
    assertFalse(includesCode(pcode, PCode.lptr));
    assertFalse(includesCode(pcode, PCode.cstr));
  });

  it("global array-of-strings element assignment appends PCode.cstr after the PCode.lptr (not an overwrite)", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nvar arr: array[1..3] of string;\nbegin\narr[1] := 'hi';\nend.",
    );
    const [assignment, halt] = pcode.slice(-2);
    // LSTR "hi", then the same element-address calculation as the integer
    // case - but both survive here: PCode.lptr (loads the element's
    // address) then PCode.cstr (writes the string at that address), unlike
    // the plain integer-array case above where lptr gets overwritten to
    // sptr
    assertEquals(assignment, [
      PCode.lstr,
      2,
      104, // "h"
      105, // "i"
      PCode.ldvg,
      19, // "arr"
      PCode.ldin,
      1,
      PCode.ldin,
      1,
      PCode.subt,
      PCode.swap,
      PCode.test,
      PCode.plus,
      PCode.incr,
      PCode.lptr,
      PCode.cstr,
      PCode.hclr,
    ]);
    assertEquals(halt, [PCode.halt]);
  });

  it("global string char-index assignment ('s[1] := ...') takes the same sptr path as a plain array, via the type===string clause", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nvar s: string;\nbegin\ns[1] := 'x';\nend.",
    );
    const [assignment, halt] = pcode.slice(-2);
    // ldin 120 (= "x", the character being assigned), then index 1
    // decremented to an offset, bounds-tested against the string at 19
    // (= "s"), and written through sptr - the same overwrite-the-lptr
    // ending as a plain array element
    assertEquals(assignment, [
      PCode.ldin,
      120,
      PCode.ldin,
      1,
      PCode.decr,
      PCode.ldvg,
      19,
      PCode.test,
      PCode.plus,
      PCode.incr,
      PCode.sptr,
    ]);
    assertEquals(halt, [PCode.halt]);
    assertFalse(includesCode(pcode, PCode.cstr));
  });

  it("pointer variable assignment (non-string) uses PCode.poke", () => {
    // pointer variables ("int* p") are only ever local (C's top-level
    // declaration dispatcher doesn't understand "*" - see c.test.ts), so
    // this exercises the isPointer branch, which is checked before the
    // isGlobal/local split further down variableAssignment's dispatcher
    const pcode = compileAndEncode("C", "void main () {\nint* p;\np = 5;\n}");
    // the assignment is the last line of main's body, followed by main's
    // memr/plsr/retn housekeeping, the top-level call to main, and the halt
    const [assignment] = pcode.slice(-4);
    // ldvv loads the pointer's own cell (subroutine address 12, variable
    // address 1), then the value, then POKE writes through it
    assertEquals(assignment, [PCode.ldvv, 12, 1, PCode.ldin, 5, PCode.poke]);
    assertFalse(includesCode(pcode, PCode.cstr));
  });

  it("pointer variable assignment (string) uses PCode.cstr instead of PCode.poke", () => {
    const pcode = compileAndEncode(
      "C",
      'void main () {\nstring* p;\np = "hi";\n}',
    );
    // as in the non-string case, the assignment is the last line of main's
    // body, four lines from the end
    const [assignment] = pcode.slice(-4);
    // ldvv the pointer's cell, LSTR "hi" (104/105 = "h"/"i"), then cstr
    // (and a heap clear) instead of poke
    assertEquals(assignment, [
      PCode.ldvv,
      12,
      1,
      PCode.lstr,
      2,
      104,
      105,
      PCode.cstr,
      PCode.hclr,
    ]);
    assertFalse(includesCode(pcode, PCode.poke));
  });

  it("reference (var) parameter assignment uses PCode.stvr, not PCode.stvg/stvv", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nprocedure go(var n: integer);\nbegin\nn := 5;\nend;\nbegin\nend.",
    );
    // the assignment is the last line of go's body, followed by go's
    // memr/plsr/retn housekeeping and the (empty) main program's halt
    const [assignment] = pcode.slice(-3);
    // stvr writes straight through the reference (subroutine address 12,
    // variable address 1)
    assertEquals(assignment, [PCode.ldin, 5, PCode.stvr, 12, 1]);
  });

  it("a reference (var) STRING parameter is excluded from referenceVariableAssignment and falls through to the local-string path", () => {
    // stmt.variable.isReferenceParameter is true here, but the guard also
    // requires the variable not be a string, so this exercises the
    // "excluded because it's a string" leg of that composite condition
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nprocedure go(var s: string);\nbegin\ns := 'hi';\nend;\nbegin\nend.",
    );
    assertFalse(includesCode(pcode, PCode.stvr));
    assert(includesCode(pcode, PCode.cstr));
  });

  it("local scalar (integer) assignment uses PCode.stvv", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nprocedure go;\nvar x: integer;\nbegin\nx := 5;\nend;\nbegin\nend.",
    );
    // the assignment is the last line of go's body, followed by go's
    // memr/plsr/retn housekeeping and the (empty) main program's halt
    const [assignment] = pcode.slice(-3);
    assertEquals(assignment, [PCode.ldin, 5, PCode.stvv, 12, 1]);
    assertFalse(includesCode(pcode, PCode.cstr));
  });

  it("local string assignment uses PCode.ldvv + PCode.cstr", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nprocedure go;\nvar s: string;\nbegin\ns := 'hi';\nend;\nbegin\nend.",
    );
    // the assignment is the last line of go's body, three lines from the
    // end (housekeeping, halt)
    const [assignment] = pcode.slice(-3);
    // the same shape as the global case above, with the LDVG swapped for
    // an LDVV (subroutine address 12, variable address 1)
    assertEquals(assignment, [
      PCode.lstr,
      2,
      104, // "h"
      105, // "i"
      PCode.ldvv,
      12,
      1,
      PCode.cstr,
      PCode.hclr,
    ]);
  });

  it("local integer array element assignment overwrites the trailing PCode.lptr with PCode.sptr", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nprocedure go;\nvar arr: array[1..3] of integer;\nbegin\narr[1] := 5;\nend;\nbegin\nend.",
    );
    // the assignment is the last line of go's body, three lines from the
    // end (housekeeping, halt)
    const [assignment] = pcode.slice(-3);
    // the same element-address calculation as the global case, based on an
    // LDVV instead of an LDVG, and again ending in sptr
    assertEquals(assignment, [
      PCode.ldin,
      5,
      PCode.ldvv,
      12,
      1,
      PCode.ldin,
      1,
      PCode.ldin,
      1,
      PCode.subt,
      PCode.swap,
      PCode.test,
      PCode.plus,
      PCode.incr,
      PCode.sptr,
    ]);
    assertFalse(includesCode(pcode, PCode.cstr));
  });

  it("local array-of-strings element assignment appends PCode.cstr after the PCode.lptr", () => {
    const pcode = compileAndEncode(
      "Pascal",
      "program Test;\nprocedure go;\nvar arr: array[1..3] of string;\nbegin\narr[1] := 'hi';\nend;\nbegin\nend.",
    );
    // the assignment is the last line of go's body, three lines from the
    // end (housekeeping, halt)
    const [assignment] = pcode.slice(-3);
    // as in the global array-of-strings case, both the lptr (loading the
    // element's address) and the appended cstr (writing the string there)
    // survive
    assertEquals(assignment, [
      PCode.lstr,
      2,
      104, // "h"
      105, // "i"
      PCode.ldvv,
      12,
      1,
      PCode.ldin,
      1,
      PCode.ldin,
      1,
      PCode.subt,
      PCode.swap,
      PCode.test,
      PCode.plus,
      PCode.incr,
      PCode.lptr,
      PCode.cstr,
      PCode.hclr,
    ]);
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
    // `!`, not `?.`: an absent line would make an optional chain pass vacuously
    assertFalse(pcode[7]!.includes(PCode.hstr));
    assertFalse(pcode[7]!.includes(PCode.hfix));
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
