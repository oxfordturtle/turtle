import { describe, it } from "@std/testing/bdd";
import {
  assert,
  assertEquals,
  assertExists,
  assertFalse,
  assertThrows,
} from "@std/assert";
import type {
  ForStatement,
  IfStatement,
  ProcedureCall,
  RepeatStatement,
  ReturnStatement,
  VariableAssignment,
  WhileStatement,
} from "@/core/compiler.ts";
import { assertCompilerError } from "../../machine/lib/helpers.ts";
import { parseProgram } from "./lib/programs.ts";

/**
 * BASIC-specific parser tests: syntax that's too divergent for the shared
 * cross-language table in common.test.ts (line-oriented statements
 * separated by colons/newlines, "END"-terminated main program with
 * PROC/FN subroutines defined afterwards, "$"/"%" typed identifiers) plus
 * error paths for every major statement kind.
 */

describe("parse: BASIC", () => {
  describe("program structure", () => {
    it("throws if the program has no END", () => {
      assertThrows(
        () => parseProgram("BASIC", "x% = 1"),
        Error,
        'Program must end with keyword "END"',
      );
    });

    it("parses an empty program", () => {
      const program = parseProgram("BASIC", "END");
      assertEquals(program.statements.length, 0);
      assertEquals(program.language, "BASIC");
    });

    it("ignores a comment as a pass statement", () => {
      const program = parseProgram("BASIC", "REM hello\nEND");
      assertEquals(program.statements.length, 1);
      assertEquals(program.statements[0]?.kind, "passStatement");
    });

    it("throws on anything but a subroutine definition after END", () => {
      assertThrows(
        () => parseProgram("BASIC", "END\nx% = 1"),
        Error,
        "Only subroutine definitions are permissible",
      );
    });

    it("ignores a comment at the end of a statement's line", () => {
      // the end-of-statement check treats a comment just like a colon or a
      // line break, so the comment doesn't need a separator before it
      const program = parseProgram("BASIC", "x% = 1 REM why not\ny% = 2\nEND");
      assertEquals(program.statements.length, 2);
      assertEquals(program.statements[0]?.kind, "variableAssignment");
      assertEquals(program.statements[1]?.kind, "variableAssignment");
    });

    it("throws when a statement begins with a literal value", () => {
      assertThrows(
        () => parseProgram("BASIC", "1\nEND"),
        Error,
        'Statement cannot begin with "1".',
      );
    });

    it('throws when a statement begins with an operator other than "="', () => {
      assertThrows(
        () => parseProgram("BASIC", "+1\nEND"),
        Error,
        'Statement cannot begin with "+".',
      );
    });

    it("throws when a statement begins with a keyword that can't start one", () => {
      // "ENDIF" at the top level isn't inside any block, so it reaches
      // statement.ts's keyword fallthrough rather than block.ts's
      // "does not have any matching" check
      assertThrows(
        () => parseProgram("BASIC", "ENDIF\nEND"),
        Error,
        'Statement cannot begin with "ENDIF".',
      );
    });

    it("throws on a subroutine definition before END", () => {
      assertThrows(
        () => parseProgram("BASIC", "DEF PROCgo\nEND"),
        Error,
        'Subroutines must be defined after program "END".',
      );
    });
  });

  describe("statement separation", () => {
    it("parses statements separated by a colon on one line", () => {
      const program = parseProgram("BASIC", "x% = 1 : y% = 2\nEND");
      assertEquals(program.statements.length, 2);
    });

    it("throws if two statements aren't separated by a colon or newline", () => {
      assertThrows(
        () => parseProgram("BASIC", "x% = 1 y% = 2\nEND"),
        Error,
        "Statements must be separated by a colon or placed on different lines",
      );
    });
  });

  describe("subroutine definitions", () => {
    it("parses a PROC subroutine with a parameter", () => {
      const program = parseProgram(
        "BASIC",
        "PROCgo(5)\nEND\nDEF PROCgo(n%)\nx% = n%\nENDPROC",
      );
      assertEquals(program.subroutines.length, 1);
      const sub = program.subroutines[0];
      assertEquals(sub?.name, "PROCgo");
      assert(sub?.variables.some((v) => v.isParameter));
    });

    it("parses an FN function with a return statement", () => {
      const program = parseProgram(
        "BASIC",
        "x% = FNdouble(2)\nEND\nDEF FNdouble(n%)\n=n% * 2",
      );
      const sub = program.subroutines[0];
      const returnStatement = sub?.statements.find(
        (s) => s.kind === "returnStatement",
      ) as ReturnStatement | undefined;
      assertExists(returnStatement);
    });

    it("parses a PROC subroutine with several parameters", () => {
      const program = parseProgram(
        "BASIC",
        "PROCgo(1, 2)\nEND\nDEF PROCgo(a%, b%)\na% = b%\nENDPROC",
      );
      const sub = program.subroutines[0]!;
      const parameters = sub.variables.filter((v) => v.isParameter);
      assertEquals(
        parameters.map((v) => v.name),
        ["a%", "b%"],
      );
      assertFalse(parameters.every((v) => v.isReferenceParameter));
    });

    it("parses a RETURN (reference) parameter", () => {
      const program = parseProgram(
        "BASIC",
        "x% = 0\nPROCgo(x%)\nEND\nDEF PROCgo(RETURN n%)\nn% = 1\nENDPROC",
      );
      const parameter = program.subroutines[0]?.variables[0];
      assertEquals(parameter?.name, "n%");
      assert(parameter?.isParameter);
      assert(parameter?.isReferenceParameter);
    });

    it("parses an array parameter (empty brackets after the name)", () => {
      const program = parseProgram(
        "BASIC",
        "DIM a%(5)\nPROCgo(a%)\nEND\nDEF PROCgo(arr%())\narr%(0) = 1\nENDPROC",
      );
      const parameter = program.subroutines[0]?.variables[0];
      assertEquals(parameter?.name, "arr%");
      assert(parameter?.isParameter);
      // dummy dimensions - the real ones come from the argument at call time
      assertEquals(parameter?.arrayDimensions, [[0, 0]]);
    });

    it("throws when an array parameter's brackets aren't empty", () => {
      assertThrows(
        () => parseProgram("BASIC", "END\nDEF PROCgo(arr%(5))\nENDPROC"),
        Error,
        "Closing bracket missing after array parameter specification",
      );
    });

    it('parses a function whose body has statements before its "=" line', () => {
      const program = parseProgram(
        "BASIC",
        "x% = FNfoo\nEND\nDEF FNfoo\ny% = 1\n=y%",
      );
      const sub = program.subroutines[0];
      assertEquals(
        sub?.statements.map((s) => s.kind),
        ["variableAssignment", "returnStatement"],
      );
    });

    it('parses a string function (name ending in "$")', () => {
      const program = parseProgram("BASIC", 'x$ = FNs$\nEND\nDEF FNs$\n="hi"');
      const result = program.subroutines[0]?.variables[0];
      assertEquals(result?.name, "!result");
      assertEquals(result?.type, "string");
      assertEquals(result?.stringLength, 64);
    });

    it('parses a string function with an explicit string length ("$16")', () => {
      const program = parseProgram(
        "BASIC",
        'x$16 = FNs$16\nEND\nDEF FNs$16\n="hi"',
      );
      const result = program.subroutines[0]?.variables[0];
      assertEquals(result?.name, "!result");
      assertEquals(result?.type, "string");
      assertEquals(result?.stringLength, 16);
    });

    it('throws if a function has no "=<expression>" line', () => {
      assertThrows(
        () => parseProgram("BASIC", "x% = FNfoo\nEND\nDEF FNfoo\nx% = 1"),
        Error,
        'Function "FNfoo" does not have an end (expected "=<expression>").',
      );
    });

    it("throws if DEF is the last thing in the program", () => {
      assertThrows(
        () => parseProgram("BASIC", "END\nDEF"),
        Error,
        '"DEF" must be followed by an identifier.',
      );
    });

    it("throws if DEF is followed by something that isn't an identifier", () => {
      assertThrows(
        () => parseProgram("BASIC", "END\nDEF 5\nENDPROC"),
        Error,
        '"5" is not a valid identifier.',
      );
    });

    it("throws if a subroutine declaration has no body at all", () => {
      assertThrows(
        () => parseProgram("BASIC", "END\nDEF PROCgo"),
        Error,
        "No statements found after subroutine declaration",
      );
    });

    it("throws if a subroutine's first statement isn't on a new line", () => {
      assertThrows(
        () => parseProgram("BASIC", "END\nDEF PROCgo : ENDPROC"),
        Error,
        "Statement must be on a new line",
      );
    });

    it("throws for a subroutine name that starts with neither PROC nor FN", () => {
      assertThrows(
        () => parseProgram("BASIC", "END\nDEF go\nENDPROC"),
        Error,
        "is not a valid subroutine name",
      );
    });

    it("throws if a procedure has no ENDPROC", () => {
      assertThrows(
        () => parseProgram("BASIC", "END\nDEF PROCgo\nx% = 1"),
        Error,
        "does not have an end",
      );
    });

    it("throws on a return statement in the main program", () => {
      assertThrows(
        () => parseProgram("BASIC", "=1\nEND"),
        Error,
        "Statement in the main program cannot begin with",
      );
    });

    it("throws on a return statement inside a procedure (not a function)", () => {
      assertThrows(
        () => parseProgram("BASIC", "END\nDEF PROCgo\n=1\nENDPROC"),
        Error,
        "Procedures cannot return a value",
      );
    });

    it("throws if the main program declares a LOCAL variable", () => {
      assertThrows(
        () => parseProgram("BASIC", "LOCAL x%\nEND"),
        Error,
        "Main program cannot declare any LOCAL variables",
      );
    });

    it("throws if the main program declares a PRIVATE variable", () => {
      assertThrows(
        () => parseProgram("BASIC", "PRIVATE x%\nEND"),
        Error,
        "Main program cannot declare any PRIVATE variables",
      );
    });

    it("declares LOCAL variables on the subroutine itself", () => {
      const program = parseProgram(
        "BASIC",
        "PROCgo\nEND\nDEF PROCgo\nLOCAL a%, b$\na% = 1\nENDPROC",
      );
      const sub = program.subroutines[0];
      assertEquals(
        sub?.variables.map((v) => [v.name, v.type]),
        [
          ["a%", "boolint"],
          ["b$", "string"],
        ],
      );
      // locals are not globals
      assertEquals(program.variables.length, 0);
    });

    it("throws on a trailing comma in a LOCAL declaration", () => {
      assertThrows(
        () =>
          parseProgram("BASIC", "PROCgo\nEND\nDEF PROCgo\nLOCAL x%,\nENDPROC"),
        Error,
        "Trailing comma at end of line",
      );
    });

    it("declares PRIVATE variables on the program, owned by the subroutine", () => {
      const program = parseProgram(
        "BASIC",
        "PROCgo\nEND\nDEF PROCgo\nPRIVATE p%\np% = 1\nENDPROC",
      );
      const sub = program.subroutines[0];
      // a PRIVATE variable is stored globally (so it persists between
      // calls) but tagged as belonging to its declaring subroutine
      assertEquals(sub?.variables.length, 0);
      const privateVariable = program.variables[0];
      assertEquals(privateVariable?.name, "p%");
      assertEquals(privateVariable?.private, sub);
    });

    it("throws on a nested subroutine definition", () => {
      // a nested PROC would be swallowed whole by the naive ENDPROC scan
      // that hoists PROCgo's body in the first pass, so use a nested FN
      // (terminated by "=<expr>" instead) to actually reach the nested-def
      // check in the second pass, when PROCgo's own statements are parsed
      assertThrows(
        () =>
          parseProgram("BASIC", "END\nDEF PROCgo\nDEF FNnested\n=1\nENDPROC"),
        Error,
        "cannot contain any nested subroutine definitions",
      );
    });
  });

  describe("constants and arrays", () => {
    it("parses a CONST declaration", () => {
      const program = parseProgram("BASIC", "CONST size% = 5\nEND");
      assertEquals(program.constants.length, 1);
      assertEquals(program.constants[0]?.value, 5);
    });

    it("parses a DIM array declaration", () => {
      const program = parseProgram("BASIC", "DIM arr%(10)\nEND");
      const arr = program.variables.find((v) => v.name === "arr%");
      assertExists(arr);
      assertEquals(arr.arrayDimensions.length, 1);
    });

    it("throws when an array size is zero or negative", () => {
      assertThrows(
        () => parseProgram("BASIC", "DIM arr%(0)\nEND"),
        Error,
        "Array size must be positive",
      );
    });

    it("throws when CONST is not assigned a value", () => {
      assertThrows(
        () => parseProgram("BASIC", "CONST size%\nEND"),
        Error,
        "Constant must be assigned a value",
      );
    });

    it("throws when DIM is not followed by an opening bracket", () => {
      assertThrows(
        () => parseProgram("BASIC", "DIM arr%\nEND"),
        Error,
        "must be followed by dimensions in brackets",
      );
    });

    it("throws when a DIM dimension spans multiple lines", () => {
      assertThrows(
        () => parseProgram("BASIC", "DIM arr%(\n10)\nEND"),
        Error,
        "Array declaration must be one a single line",
      );
    });

    it("parses a multi-dimensional DIM declaration", () => {
      const program = parseProgram(
        "BASIC",
        "DIM grid%(3,4)\ngrid%(1,2) = 5\nEND",
      );
      const grid = program.variables.find((v) => v.name === "grid%");
      assertExists(grid);
      // BASIC arrays run from 0 up to *and including* the declared size
      assertEquals(grid.arrayDimensions, [
        [0, 3],
        [0, 4],
      ]);
    });

    it("throws when DIM's brackets are empty", () => {
      assertThrows(
        () => parseProgram("BASIC", "DIM arr%()\nEND"),
        Error,
        "Expected array size specification",
      );
    });

    it("throws on a trailing comma in a DIM specification", () => {
      assertThrows(
        () => parseProgram("BASIC", "DIM arr%(10,)\nEND"),
        Error,
        "Trailing comma",
      );
    });
  });

  describe("if / then / else", () => {
    it("parses a one-line IF...THEN with no ELSE", () => {
      const program = parseProgram("BASIC", "IF TRUE THEN x% = 1\nEND");
      const ifStatement = program.statements.find(
        (s) => s.kind === "ifStatement",
      ) as IfStatement | undefined;
      assertExists(ifStatement);
      assertEquals(ifStatement.elseStatements.length, 0);
    });

    it("parses a multi-line IF...THEN...ENDIF block", () => {
      const program = parseProgram(
        "BASIC",
        "IF TRUE THEN\nx% = 1\ny% = 2\nENDIF\nEND",
      );
      const ifStatement = program.statements.find(
        (s) => s.kind === "ifStatement",
      ) as IfStatement | undefined;
      assertExists(ifStatement);
      assertEquals(ifStatement.ifStatements.length, 2);
    });

    it("parses a multi-line IF...ELSE block", () => {
      const program = parseProgram(
        "BASIC",
        "IF TRUE THEN\nx% = 1\nELSE\nx% = 2\nENDIF\nEND",
      );
      const ifStatement = program.statements.find(
        (s) => s.kind === "ifStatement",
      ) as IfStatement | undefined;
      assertExists(ifStatement);
      assertEquals(ifStatement.elseStatements.length, 1);
    });

    it("doesn't let a comment between THEN and the body swallow the body", () => {
      // regression test: firstInnerLexeme used to be fetched without
      // skipping a leading comment, so "THEN REM comment" was itself
      // treated as the whole body (a no-op pass statement), leaving the
      // real statement on the next line to be parsed as the next statement
      // at the outer (program) level instead of inside the if.
      const program = parseProgram(
        "BASIC",
        "IF TRUE THEN REM comment\nx% = 1\nENDIF\nEND",
      );
      assertEquals(program.statements.length, 1);
      const ifStatement = program.statements[0] as IfStatement;
      assertEquals(ifStatement.kind, "ifStatement");
      assertEquals(ifStatement.ifStatements.length, 1);
      assertEquals(ifStatement.ifStatements[0]?.kind, "variableAssignment");
    });

    it("doesn't let a comment between ELSE and the body swallow the body", () => {
      const program = parseProgram(
        "BASIC",
        "IF TRUE THEN\nx% = 1\nELSE REM comment\nx% = 2\nENDIF\nEND",
      );
      assertEquals(program.statements.length, 1);
      const ifStatement = program.statements[0] as IfStatement;
      assertEquals(ifStatement.elseStatements.length, 1);
      assertEquals(ifStatement.elseStatements[0]?.kind, "variableAssignment");
    });

    it("throws if IF is not followed by THEN", () => {
      assertThrows(
        () => parseProgram("BASIC", "IF TRUE x% = 1\nEND"),
        Error,
        'must be followed by "THEN"',
      );
    });

    it("throws if a one-line ELSE statement is on a new line", () => {
      assertThrows(
        () => parseProgram("BASIC", "IF TRUE THEN x% = 1 ELSE\nx% = 2\nEND"),
        Error,
        "cannot be on a new line",
      );
    });

    it("throws if a multi-line ELSE statement is not on a new line", () => {
      // "ELSE" (not "ENDIF") terminates the if-block here, so ifStatement.ts
      // reaches its own new-line check on what follows "ELSE"
      assertThrows(
        () => parseProgram("BASIC", "IF TRUE THEN\nx% = 1\nELSE x% = 2\nEND"),
        Error,
        "must be on a new line",
      );
    });

    it("throws on ENDIF with no matching IF (inside a differently-typed block)", () => {
      // at the top level "ENDIF" just hits the generic "statement cannot
      // begin with" error; the "no matching IF" check only fires once
      // we're already inside some other block
      assertThrows(
        () => parseProgram("BASIC", "FOR i% = 1 TO 3\nENDIF\nNEXT\nEND"),
        Error,
        "does not have any matching",
      );
    });
  });

  describe("for loops", () => {
    it("counts up to the final value when there is no STEP", () => {
      const program = parseProgram("BASIC", "FOR i% = 1 TO 10\nNEXT\nEND");
      const forStatement = program.statements[0] as ForStatement;
      assertEquals(forStatement.kind, "forStatement");
      assertEquals(forStatement.condition.kind, "compound");
      if (forStatement.condition.kind === "compound") {
        assertEquals(forStatement.condition.operator, "lseq");
      }
      // the implicit step change is "i% = i% + 1"
      assertEquals(forStatement.change.value.kind, "compound");
      if (forStatement.change.value.kind === "compound") {
        assertEquals(forStatement.change.value.operator, "plus");
        assertEquals(forStatement.change.value.right.kind, "integer");
        if (forStatement.change.value.right.kind === "integer") {
          assertEquals(forStatement.change.value.right.value, 1);
        }
      }
    });

    it("parses a FOR loop with a negative STEP (counting down)", () => {
      const program = parseProgram(
        "BASIC",
        "FOR i% = 10 TO 1 STEP -1\nNEXT\nEND",
      );
      const forStatement = program.statements.find(
        (s) => s.kind === "forStatement",
      ) as ForStatement | undefined;
      assertExists(forStatement);
      // a negative step flips the loop condition from "<=" to ">="
      assertEquals(forStatement.condition.kind, "compound");
      if (forStatement.condition.kind === "compound") {
        assertEquals(forStatement.condition.operator, "mreq");
      }
    });

    it("parses a FOR loop with a positive STEP", () => {
      const program = parseProgram(
        "BASIC",
        "FOR i% = 1 TO 10 STEP 2\nNEXT\nEND",
      );
      const forStatement = program.statements[0] as ForStatement;
      assertEquals(forStatement.kind, "forStatement");
      // a positive step keeps the "<=" condition, but the step change is
      // the given value rather than the default 1
      assertEquals(forStatement.condition.kind, "compound");
      if (forStatement.condition.kind === "compound") {
        assertEquals(forStatement.condition.operator, "lseq");
      }
      assertEquals(forStatement.change.value.kind, "compound");
      if (forStatement.change.value.kind === "compound") {
        assertEquals(forStatement.change.value.right.kind, "integer");
        if (forStatement.change.value.right.kind === "integer") {
          assertEquals(forStatement.change.value.right.value, 2);
        }
      }
    });

    it("reuses an existing variable as the loop counter", () => {
      const program = parseProgram(
        "BASIC",
        "i% = 0\nFOR i% = 1 TO 3\nNEXT\nEND",
      );
      assertEquals(program.variables.filter((v) => v.name === "i%").length, 1);
    });

    it("creates a loop counter declared inside a subroutine as a global", () => {
      const program = parseProgram(
        "BASIC",
        "PROCgo\nEND\nDEF PROCgo\nFOR i% = 1 TO 3\nNEXT\nENDPROC",
      );
      // BASIC has no implicit local declaration: an undeclared FOR counter
      // goes on the program, even when the loop is inside a subroutine
      assertEquals(
        program.variables.map((v) => v.name),
        ["i%"],
      );
      assertEquals(program.subroutines[0]?.variables.length, 0);
    });

    it("doesn't let a comment between the loop initialisation and the body swallow the body", () => {
      // regression test: see the equivalent IF test above for the general
      // bug shape (this is the same bug, in the FOR loop's fallback).
      const program = parseProgram(
        "BASIC",
        "FOR i% = 1 TO 3 REM comment\ni% = i%\nNEXT\nEND",
      );
      const forStatement = program.statements.find(
        (s) => s.kind === "forStatement",
      ) as ForStatement | undefined;
      assertExists(forStatement);
      assertEquals(forStatement.statements.length, 1);
      assertEquals(forStatement.statements[0]?.kind, "variableAssignment");
    });

    it("throws if the STEP value is zero", () => {
      assertThrows(
        () => parseProgram("BASIC", "FOR i% = 1 TO 3 STEP 0\nNEXT\nEND"),
        Error,
        "Step value cannot be zero",
      );
    });

    it("throws if FOR is not followed by TO", () => {
      assertThrows(
        () => parseProgram("BASIC", "FOR i% = 1\nNEXT\nEND"),
        Error,
        'must be followed by "TO"',
      );
    });

    it("throws if FOR is not followed by a variable", () => {
      assertThrows(
        () => parseProgram("BASIC", "FOR 1 TO 3\nNEXT\nEND"),
        Error,
        '"FOR" must be followed by an integer variable.',
      );
    });

    it("throws if a turtle property is used as the loop counter", () => {
      assertThrows(
        () => parseProgram("BASIC", "FOR turtx% = 1 TO 3\nNEXT\nEND"),
        Error,
        'Turtle attribute cannot be used as a "FOR" variable.',
      );
    });

    it("throws if an existing non-integer variable is used as the loop counter", () => {
      assertThrows(
        () => parseProgram("BASIC", 'x$ = "a"\nFOR x$ = 1 TO 3\nNEXT\nEND'),
        Error,
        "is not an integer variable",
      );
    });

    it("throws on NEXT with no matching FOR (inside a differently-typed block)", () => {
      assertThrows(
        () => parseProgram("BASIC", "WHILE TRUE\nNEXT\nENDWHILE\nEND"),
        Error,
        "does not have any matching",
      );
    });

    it("supports a loop body starting on the same line as the FOR", () => {
      // the body is still bracketed by "NEXT", wherever it starts: only
      // the first statement is on the FOR's own line here
      const program = parseProgram(
        "BASIC",
        "FOR i% = 1 TO 3 x% = 1\nNEXT\nEND",
      );
      const forStatement = program.statements.find(
        (s) => s.kind === "forStatement",
      ) as ForStatement | undefined;
      assertExists(forStatement);
      assertEquals(forStatement.statements.length, 1);
      assertEquals(forStatement.statements[0]?.kind, "variableAssignment");
    });

    it("supports a whole FOR loop on one line, colon-separated", () => {
      const program = parseProgram(
        "BASIC",
        "FOR i% = 1 TO 3 x% = 1 : y% = 2 : NEXT\nEND",
      );
      const forStatement = program.statements.find(
        (s) => s.kind === "forStatement",
      ) as ForStatement | undefined;
      assertExists(forStatement);
      assertEquals(forStatement.statements.length, 2);
    });

    it("throws on a same-line FOR body with no NEXT", () => {
      assertThrows(
        () => parseProgram("BASIC", "FOR i% = 1 TO 3 x% = 1\nEND"),
        Error,
        'Unterminated "FOR" statement',
      );
    });
  });

  describe("while and repeat loops", () => {
    it("parses a REPEAT...UNTIL loop", () => {
      const program = parseProgram(
        "BASIC",
        "x% = 0\nREPEAT\nx% = x% + 1\nUNTIL x% = 3\nEND",
      );
      const repeatStatement = program.statements.find(
        (s) => s.kind === "repeatStatement",
      ) as RepeatStatement | undefined;
      assertExists(repeatStatement);
    });

    it("doesn't let a comment between WHILE and the body swallow the body", () => {
      // regression test: see the "if / then / else" describe block above
      // for the general bug shape (this is the same bug, in the WHILE
      // loop's fallback).
      const program = parseProgram(
        "BASIC",
        "WHILE TRUE REM comment\nx% = 1\nENDWHILE\nEND",
      );
      const whileStatement = program.statements.find(
        (s) => s.kind === "whileStatement",
      ) as WhileStatement | undefined;
      assertExists(whileStatement);
      assertEquals(whileStatement.statements.length, 1);
      assertEquals(whileStatement.statements[0]?.kind, "variableAssignment");
    });

    it("doesn't let a comment between REPEAT and the body swallow the body", () => {
      const program = parseProgram(
        "BASIC",
        "REPEAT REM comment\nx% = x% + 1\nUNTIL x% = 3\nEND",
      );
      const repeatStatement = program.statements.find(
        (s) => s.kind === "repeatStatement",
      ) as RepeatStatement | undefined;
      assertExists(repeatStatement);
      assertEquals(repeatStatement.statements.length, 1);
      assertEquals(repeatStatement.statements[0]?.kind, "variableAssignment");
    });

    it("throws on UNTIL with no matching REPEAT (inside a differently-typed block)", () => {
      assertThrows(
        () => parseProgram("BASIC", "FOR i% = 1 TO 3\nUNTIL TRUE\nNEXT\nEND"),
        Error,
        "does not have any matching",
      );
    });

    it("throws on ENDWHILE with no matching WHILE (inside a differently-typed block)", () => {
      assertThrows(
        () => parseProgram("BASIC", "FOR i% = 1 TO 3\nENDWHILE\nNEXT\nEND"),
        Error,
        "does not have any matching",
      );
    });

    it("throws on an unterminated block", () => {
      assertThrows(
        () => parseProgram("BASIC", "WHILE TRUE\nx% = 1\nEND"),
        Error,
        'Unterminated "WHILE" statement',
      );
    });

    it("throws on ELSE with no matching IF", () => {
      assertThrows(
        () => parseProgram("BASIC", "WHILE TRUE\nELSE\nENDWHILE\nEND"),
        Error,
        '"ELSE" does not have any matching "IF".',
      );
    });

    it("supports a loop body starting on the same line as the WHILE", () => {
      const program = parseProgram(
        "BASIC",
        "WHILE FALSE x% = 1\nENDWHILE\nEND",
      );
      const whileStatement = program.statements.find(
        (s) => s.kind === "whileStatement",
      ) as WhileStatement | undefined;
      assertExists(whileStatement);
      assertEquals(whileStatement.statements.length, 1);
      assertEquals(whileStatement.statements[0]?.kind, "variableAssignment");
    });

    it("throws on a same-line WHILE body with no ENDWHILE", () => {
      assertThrows(
        () => parseProgram("BASIC", "WHILE FALSE x% = 1\nEND"),
        Error,
        'Unterminated "WHILE" statement',
      );
    });

    it("supports a loop body starting on the same line as the REPEAT", () => {
      const program = parseProgram("BASIC", "REPEAT x% = 1\nUNTIL TRUE\nEND");
      const repeatStatement = program.statements.find(
        (s) => s.kind === "repeatStatement",
      ) as RepeatStatement | undefined;
      assertExists(repeatStatement);
      assertEquals(repeatStatement.statements.length, 1);
      assertEquals(repeatStatement.statements[0]?.kind, "variableAssignment");
    });

    it("throws on a same-line REPEAT body with no UNTIL", () => {
      assertThrows(
        () => parseProgram("BASIC", "REPEAT x% = 1\nEND"),
        Error,
        'Unterminated "REPEAT" statement',
      );
    });
  });

  describe("variable assignment and identifiers", () => {
    it("parses array element assignment with indexes", () => {
      const program = parseProgram("BASIC", "DIM arr%(10)\narr%(1) = 5\nEND");
      const assignment = program.statements.find(
        (s) => s.kind === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.indexes.length, 1);
    });

    it("parses a string variable with an explicit length suffix", () => {
      const program = parseProgram("BASIC", 'x$16 = "hello"\nEND');
      const x = program.variables.find((v) => v.name === "x$16");
      assertExists(x);
      assertEquals(x.type, "string");
      assertEquals(x.stringLength, 16);
    });

    it("allows one index more than the dimensions for a string array", () => {
      // the extra index picks a character within the string element
      const program = parseProgram("BASIC", 'DIM s$(3)\ns$(1,2) = "a"\nEND');
      const assignment = program.statements.find(
        (s) => s.kind === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.indexes.length, 2);
    });

    it("throws when an array is given too many indexes", () => {
      assertThrows(
        () => parseProgram("BASIC", "DIM arr%(10)\narr%(1,2) = 5\nEND"),
        Error,
        'Too many indexes for array variable "arr%".',
      );
    });

    it('throws when a variable is not followed by "="', () => {
      assertThrows(
        () => parseProgram("BASIC", "x% + 1\nEND"),
        Error,
        'Variable must be followed by assignment operator "=".',
      );
    });

    it("throws when indexing a non-array variable", () => {
      assertThrows(
        () => parseProgram("BASIC", "x% = 1\nx%(1) = 5\nEND"),
        Error,
        "is not an array variable",
      );
    });

    it("throws on trailing comma in array indexes", () => {
      assertThrows(
        () => parseProgram("BASIC", "DIM arr%(10)\narr%(1,) = 5\nEND"),
        Error,
        "Trailing comma",
      );
    });

    it("throws when a turtle property is used as an identifier", () => {
      assertThrows(
        () => parseProgram("BASIC", "DIM turtx%(10)\nEND"),
        Error,
        "already the name of a predefined Turtle property",
      );
    });

    it("throws on a variable name with no recognised type suffix", () => {
      assertThrows(
        () => parseProgram("BASIC", "DIM foo(10)\nEND"),
        Error,
        "is not the name of any recognised command or a valid variable name",
      );
    });

    it("throws when a variable is redeclared in the same scope", () => {
      assertThrows(
        () => parseProgram("BASIC", "DIM x%(10)\nDIM x%(5)\nEND"),
        Error,
        "is already defined in the current scope",
      );
    });
  });

  describe("procedure/function calls", () => {
    it("throws when a procedure is called with no arguments but takes some", () => {
      assertThrows(
        () => parseProgram("BASIC", "FORWARD\nEND"),
        Error,
        "Opening bracket missing",
      );
    });

    it("throws when brackets are used on a zero-parameter command", () => {
      assertThrows(
        () => parseProgram("BASIC", "HOME()\nEND"),
        Error,
        "takes no arguments",
      );
    });

    it("parses a zero-parameter command with no brackets", () => {
      const program = parseProgram("BASIC", "HOME\nEND");
      const call = program.statements.find(
        (s) => s.kind === "procedureCall",
      ) as ProcedureCall | undefined;
      assertExists(call);
      assertEquals(call.arguments.length, 0);
    });

    it("throws when a function is called as a procedure statement", () => {
      assertThrows(
        () => parseProgram("BASIC", 'VAL("1")\nEND'),
        Error,
        "is a function, not a procedure",
      );
    });

    it("reports a missing expression rather than crashing at end of input", () => {
      // BASIC is the one language whose lexeme stream can genuinely run
      // out mid-expression: a function's closing "=<expression>" line can
      // be the very last line of the file, with nothing after it. This used
      // to reach common/factor.ts's `lexemes.get() as Lexeme` cast with
      // `undefined` and die with a raw TypeError ("Cannot read properties
      // of undefined") instead of a compiler error the user can act on.
      assertThrows(
        () => parseProgram("BASIC", "x% = FNfoo\nEND\nDEF FNfoo\n="),
        Error,
        "Expression expected.",
      );
    });
  });

  describe("abrupt end of input", () => {
    // statements in the main program always have the program's "END" lexeme
    // ahead of them, so the parser can only genuinely run out of lexemes
    // inside a function subroutine, whose body ends at its "=<expression>"
    // line: statements chained onto that line with colons can be cut off
    // mid-construct by the end of the file. Each test here truncates the
    // file at a different point of a different construct.
    const truncated = (fragment: string): string =>
      `x% = FNfoo\nEND\nDEF FNfoo\n=1 : ${fragment}`;

    it('throws if the file ends right after "FOR"', () => {
      assertCompilerError(
        "BASIC",
        truncated("FOR"),
        '"FOR" must be followed by an integer variable.',
      );
    });

    it('throws if the file ends after a "FOR" loop initialisation', () => {
      assertCompilerError(
        "BASIC",
        truncated("FOR i% = 1"),
        '"FOR" loop initialisation must be followed by "TO".',
      );
    });

    it('throws if the file ends right after "TO"', () => {
      assertCompilerError(
        "BASIC",
        truncated("FOR i% = 1 TO"),
        '"TO" must be followed by an integer (or integer constant).',
      );
    });

    it('throws if the file ends right after "STEP"', () => {
      assertCompilerError(
        "BASIC",
        truncated("FOR i% = 1 TO 3 STEP"),
        '"STEP" instruction must be followed by an integer value.',
      );
    });

    it('throws if the file ends after a complete "FOR" loop header', () => {
      assertCompilerError(
        "BASIC",
        truncated("FOR i% = 1 TO 3"),
        'No statements found after "FOR" loop initialisation.',
      );
    });

    it('throws if the file ends right after "IF"', () => {
      assertCompilerError(
        "BASIC",
        truncated("IF"),
        '"IF" must be followed by a boolean expression.',
      );
    });

    it('throws if the file ends after an "IF" condition', () => {
      // same message as the "IF TRUE x% = 1" test above, but this trips the
      // end-of-input guard rather than the wrong-lexeme one
      assertCompilerError(
        "BASIC",
        truncated("IF TRUE"),
        '"IF ..." must be followed by "THEN".',
      );
    });

    it('throws if the file ends right after "THEN"', () => {
      assertCompilerError(
        "BASIC",
        truncated("IF TRUE THEN"),
        'No statements found after "IF ... THEN".',
      );
    });

    it('throws if the file ends right after "ELSE"', () => {
      assertCompilerError(
        "BASIC",
        truncated("IF TRUE THEN y% = 1 ELSE"),
        'No statements found after "ELSE".',
      );
    });

    it('throws if the file ends on the line break after "THEN"', () => {
      // the header check passes (a newline lexeme is still there), so this
      // one gets all the way to the block parser before running dry
      assertCompilerError(
        "BASIC",
        truncated("IF TRUE THEN\n"),
        'No commands found after "IF".',
      );
    });

    it('throws if the file ends right after "REPEAT"', () => {
      assertCompilerError(
        "BASIC",
        truncated("REPEAT"),
        'No statements found after "REPEAT".',
      );
    });

    it('throws if the file ends right after "UNTIL"', () => {
      assertCompilerError(
        "BASIC",
        truncated("REPEAT y% = 1 : UNTIL"),
        '"UNTIL" must be followed by a boolean expression.',
      );
    });

    it('throws if the file ends right after "WHILE"', () => {
      assertCompilerError(
        "BASIC",
        truncated("WHILE"),
        '"WHILE" must be followed by a boolean expression.',
      );
    });

    it('throws if the file ends after a "WHILE" condition', () => {
      assertCompilerError(
        "BASIC",
        truncated("WHILE TRUE"),
        'No commands found after "WHILE ... DO".',
      );
    });

    it("throws if the file ends inside array indexes", () => {
      assertCompilerError(
        "BASIC",
        "DIM a%(2)\nx% = FNfoo\nEND\nDEF FNfoo\n=1 : a%(1",
        'Closing bracket ")" needed after array indexes.',
      );
    });

    it("throws if the file ends right after a variable", () => {
      // same message as the "x% + 1" test above, but this trips the
      // end-of-input guard rather than the wrong-lexeme one
      assertCompilerError(
        "BASIC",
        truncated("y%"),
        'Variable must be followed by assignment operator "=".',
      );
    });

    it('throws if the file ends right after an assignment "="', () => {
      assertCompilerError(
        "BASIC",
        truncated("y% ="),
        'Variable "y%" must be assigned a value.',
      );
    });

    it('throws if the file ends after a "DIM" variable name', () => {
      // same message as the "DIM arr%" test above, but this trips the
      // end-of-input guard rather than the wrong-lexeme one
      assertCompilerError(
        "BASIC",
        truncated("DIM a%"),
        '"DIM" variable identifier must be followed by dimensions in brackets.',
      );
    });

    it('throws if the file ends inside a "DIM" specification', () => {
      assertCompilerError(
        "BASIC",
        truncated("DIM a%("),
        "Expected array size specification.",
      );
    });
  });
});
