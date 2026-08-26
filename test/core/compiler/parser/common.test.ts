import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import type { Language } from "@/core/constants.ts";
import type { IfStatement, VariableAssignment } from "@/core/compiler.ts";
import { bodyStatements, parseProgram, wrapProgram } from "./lib/programs.ts";
import { LANGUAGES } from "../lib/languages.ts";

/**
 * Shared, cross-language statement-kind tests. Each language has wildly
 * different concrete syntax for the same statement shape (see the fixture
 * tables below); this file parses the language-appropriate fixture for
 * every language and asserts on the resulting `Program`/`Statement`
 * structure being equivalent. Behaviour that's
 * genuinely divergent (Python's indentation blocks, Pascal's begin/end,
 * etc.) belongs in each language's own test file, not here.
 */

describe("parse: shared statement-kind behavior", () => {
  describe("variable assignment", () => {
    const fixtures: Record<Language, { varDecl?: string; body: string }> = {
      BASIC: { body: "x% = 1" },
      C: { body: "int x = 1;" },
      Java: { body: "int x = 1;" },
      Pascal: { varDecl: "var x: integer;", body: "x := 1;" },
      Python: { body: "x = 1" },
      TypeScript: { varDecl: "var x: number;", body: "x = 1;" },
    };

    for (const language of LANGUAGES) {
      it(`parses a variable assignment in ${language}`, () => {
        const { varDecl, body } = fixtures[language];
        const code = wrapProgram(language, body, varDecl);
        const program = parseProgram(language, code);
        const statements = bodyStatements(language, program);
        const assignment = statements.find(
          (s) => s.kind === "variableAssignment",
        ) as VariableAssignment | undefined;
        assertExists(assignment);
        assertEquals(
          assignment.variable.name.toLowerCase(),
          language === "BASIC" ? "x%" : "x",
        );
        assertEquals(assignment.value.kind, "integer");
      });
    }
  });

  describe("if / else", () => {
    const fixtures: Record<Language, { varDecl?: string; body: string }> = {
      BASIC: { body: "IF TRUE THEN x% = 1 ELSE x% = 2" },
      C: {
        varDecl: "int x = 0;",
        body: "if (true) { x = 1; } else { x = 2; }",
      },
      Java: {
        varDecl: "int x = 0;",
        body: "if (true) { x = 1; } else { x = 2; }",
      },
      Pascal: {
        varDecl: "var x: integer;",
        body: "if true then x := 1 else x := 2;",
      },
      Python: { body: "x = 0\nif True:\n    x = 1\nelse:\n    x = 2" },
      TypeScript: {
        varDecl: "var x: number;",
        body: "if (true) { x = 1; } else { x = 2; }",
      },
    };

    for (const language of LANGUAGES) {
      it(`parses an if/else statement in ${language}`, () => {
        const { varDecl, body } = fixtures[language];
        const code = wrapProgram(language, body, varDecl);
        const program = parseProgram(language, code);
        const statements = bodyStatements(language, program);
        const ifStatement = statements.find((s) => s.kind === "ifStatement") as
          | IfStatement
          | undefined;
        assertExists(ifStatement);
        assertEquals(ifStatement.condition.kind, "integer");
        // every fixture has exactly one statement in each branch
        assertEquals(ifStatement.ifStatements.length, 1);
        assertEquals(ifStatement.elseStatements.length, 1);
      });
    }
  });

  describe("while loop", () => {
    const fixtures: Record<Language, { varDecl?: string; body: string }> = {
      BASIC: { body: "x% = 0\nWHILE x% < 3\nx% = x% + 1\nENDWHILE" },
      C: { varDecl: "int x = 0;", body: "while (x < 3) { x = x + 1; }" },
      Java: { varDecl: "int x = 0;", body: "while (x < 3) { x = x + 1; }" },
      Pascal: {
        varDecl: "var x: integer;",
        body: "x := 0;\nwhile x < 3 do x := x + 1;",
      },
      Python: { body: "x = 0\nwhile x < 3:\n    x = x + 1" },
      TypeScript: {
        varDecl: "var x: number;",
        body: "x = 0;\nwhile (x < 3) { x = x + 1; }",
      },
    };

    for (const language of LANGUAGES) {
      it(`parses a while loop in ${language}`, () => {
        const { varDecl, body } = fixtures[language];
        const code = wrapProgram(language, body, varDecl);
        const program = parseProgram(language, code);
        const statements = bodyStatements(language, program);
        const whileStatement = statements.find(
          (s) => s.kind === "whileStatement",
        );
        assertExists(whileStatement);
        // every fixture has exactly one statement in the loop body
        assertEquals(whileStatement.statements.length, 1);
      });
    }
  });

  describe("for loop", () => {
    const fixtures: Record<Language, { varDecl?: string; body: string }> = {
      BASIC: { body: "FOR i% = 1 TO 3\nNEXT" },
      C: {
        varDecl: "int x = 0;",
        body: "for (int i = 0; i < 3; i = i + 1) { x = i; }",
      },
      Java: {
        varDecl: "int x = 0;",
        body: "for (int i = 0; i < 3; i = i + 1) { x = i; }",
      },
      Pascal: {
        varDecl: "var i: integer;",
        body: "for i := 1 to 3 do i := i;",
      },
      Python: { body: "for i in range(3):\n    pass" },
      TypeScript: {
        varDecl: "var i: number;\nvar x: number;",
        body: "for (i = 0; i < 3; i = i + 1) { x = i; }",
      },
    };

    for (const language of LANGUAGES) {
      it(`parses a for loop in ${language}`, () => {
        const { varDecl, body } = fixtures[language];
        const code = wrapProgram(language, body, varDecl);
        const program = parseProgram(language, code);
        const statements = bodyStatements(language, program);
        const forStatement = statements.find((s) => s.kind === "forStatement");
        assertExists(forStatement);
      });
    }
  });

  describe("procedure call", () => {
    const fixtures: Record<Language, string> = {
      BASIC: "FORWARD(10)",
      C: "forward(10);",
      Java: "forward(10);",
      Pascal: "forward(10);",
      Python: "forward(10)",
      TypeScript: "forward(10);",
    };

    for (const language of LANGUAGES) {
      it(`parses a procedure call in ${language}`, () => {
        const code = wrapProgram(language, fixtures[language]);
        const program = parseProgram(language, code);
        const statements = bodyStatements(language, program);
        const call = statements.find((s) => s.kind === "procedureCall");
        assertExists(call);
        assertEquals(call.kind, "procedureCall");
        assertEquals(call.arguments.length, 1);
        assertEquals(call.arguments[0]?.kind, "integer");
      });
    }
  });

  describe("constant folding", () => {
    /**
     * Every language routes its constant declarations through the same
     * `common/evaluate.ts`, which folds the whole expression down to a
     * single value at parse time (so the encoder never sees the
     * arithmetic). The fixtures can't go through `wrapProgram` because a
     * constant declaration's *placement* is language-specific (Java's has
     * to sit inside the class body, C's outside any function, etc.).
     */
    const fixtures: Record<Language, string> = {
      BASIC: "CONST x% = 2 * 3 + 1\nEND",
      C: "const int x = 2 * 3 + 1;\nvoid main () {\n}",
      Java: "class Test {\nfinal int x = 2 * 3 + 1;\nvoid main () {\n}\n}",
      Pascal: "program Test;\nconst x = 2 * 3 + 1;\nbegin\nend.",
      Python: "x: Final = 2 * 3 + 1",
      TypeScript: "const x: number = 2 * 3 + 1;",
    };

    for (const language of LANGUAGES) {
      it(`folds a compound constant expression at parse time in ${language}`, () => {
        const program = parseProgram(language, fixtures[language]);
        assertEquals(program.constants.length, 1);
        // 7, not 8: "*" binds tighter than "+", so this also pins the
        // operator precedence the folding is done against
        assertEquals(program.constants[0]?.value, 7);
      });
    }
  });
});
