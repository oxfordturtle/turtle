import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import {
  type Expression,
  formatExpression,
  formatProgram,
  formatStatement,
  formatType,
  type Statement,
  type Type,
} from "@/core/compiler.ts";
import type { Language } from "@/core/constants.ts";
import { bodyStatements, parseProgram } from "./parser/lib/programs.ts";
import { LANGUAGES } from "./lib/languages.ts";

/**
 * The formatter (src/core/compiler/formatter/) is a deliberate stub, listed
 * as such in TODO.md §2.2: `formatProgram` returns the literal string
 * "program", and nine statement/expression arms return "TODO". It is
 * exported from the compiler barrel anyway, so this file can pin what it
 * does today (test/README.md rule 5): the finished arms as real behaviour,
 * the unfinished ones as `[known limitation]` pins. Implementing the
 * formatter means updating those pins as part of the change - they trip
 * loudly instead of the stub drifting or being "fixed" by accident.
 *
 * Every AST node here is obtained by parsing a real program through the
 * barrel's `parse`, never constructed by hand, so the fixtures stay honest
 * about what the parser actually produces.
 */

/** All the variable-assignment values in a parsed program, in order. */
const assignedValues = (language: Language, code: string): Expression[] =>
  bodyStatements(language, parseProgram(language, code))
    .filter((s) => s.statementType === "variableAssignment")
    .map((s) => s.value);

/** The last variable-assignment value in a parsed program - the expression under test. */
const lastAssignedValue = (language: Language, code: string): Expression => {
  const values = assignedValues(language, code);
  return values[values.length - 1];
};

/**
 * Asserts the parser really produced the node kind the test means to cover
 * (so a parser change can't silently swap the fixture out from under the
 * assertion), then formats it.
 */
const formatChecked = (
  language: Language,
  exp: Expression,
  expressionType: Expression["expressionType"],
): string => {
  assertEquals(exp.expressionType, expressionType);
  return formatExpression(exp, language);
};

/** The first body statement of a parsed program. */
const firstStatement = (language: Language, code: string): Statement =>
  bodyStatements(language, parseProgram(language, code))[0];

describe("compiler: formatter (unfinished stub, TODO.md §2.2)", () => {
  describe("formatType", () => {
    // the one finished file: every arm asserted as real behaviour, across
    // all six languages so the per-language spellings can't drift
    const table: [Type | null, Record<Language, string>][] = [
      [
        "boolint",
        {
          BASIC: "boolean",
          C: "bool",
          Java: "boolean",
          Pascal: "boolean",
          Python: "bool",
          TypeScript: "boolean",
        },
      ],
      [
        "boolean",
        {
          BASIC: "boolean",
          C: "bool",
          Java: "boolean",
          Pascal: "boolean",
          Python: "bool",
          TypeScript: "boolean",
        },
      ],
      [
        "integer",
        {
          BASIC: "int",
          C: "int",
          Java: "int",
          Pascal: "integer",
          Python: "int",
          TypeScript: "number",
        },
      ],
      [
        "character",
        {
          BASIC: "char",
          C: "char",
          Java: "char",
          Pascal: "char",
          Python: "char",
          TypeScript: "char",
        },
      ],
      [
        "string",
        {
          BASIC: "string",
          C: "string",
          Java: "String",
          Pascal: "string",
          Python: "str",
          TypeScript: "string",
        },
      ],
      [
        null,
        {
          BASIC: "void",
          C: "void",
          Java: "void",
          Pascal: "void",
          Python: "void",
          TypeScript: "void",
        },
      ],
    ];

    for (const [type, expected] of table) {
      it(`spells ${type === null ? "null (void)" : `"${type}"`} in each language's own way`, () => {
        for (const language of LANGUAGES) {
          assertEquals(formatType(type, language), expected[language]);
        }
      });
    }
  });

  describe("formatExpression", () => {
    describe("literal values render as their own lexeme", () => {
      it("an integer literal", () => {
        const exp = lastAssignedValue("Python", "x = 1");
        assertEquals(formatChecked("Python", exp, "integer"), "1");
      });

      it("a string literal, quotes included", () => {
        const exp = lastAssignedValue("Python", "s = 'hello'");
        assertEquals(formatChecked("Python", exp, "string"), "'hello'");
      });

      it("a colour name", () => {
        const exp = lastAssignedValue("Python", "x = red");
        assertEquals(formatChecked("Python", exp, "colour"), "red");
      });

      it("a constant, by name rather than value", () => {
        const exp = lastAssignedValue(
          "Pascal",
          "program Test;\nconst n = 5;\nvar x: integer;\nbegin\nx := n\nend.",
        );
        assertEquals(formatChecked("Pascal", exp, "constant"), "n");
      });

      it("an input code, backslash included", () => {
        const exp = lastAssignedValue("BASIC", "x% = \\mousex\nEND");
        assertEquals(formatChecked("BASIC", exp, "input"), "\\mousex");
      });
    });

    it("renders a variable address with a leading ampersand", () => {
      // "&" is C-only syntax, so the address arm is only reachable there
      const exp = lastAssignedValue(
        "C",
        "void main () {\nint x = 1;\nint y = &x;\n}",
      );
      assertEquals(formatChecked("C", exp, "address"), "&x");
    });

    describe("casts", () => {
      it("spells a C cast with the parenthesised type", () => {
        const exp = lastAssignedValue(
          "C",
          "void main () {\nchar c = 'a';\nint i = (int) c;\n}",
        );
        assertEquals(formatChecked("C", exp, "cast"), "(int) c");
      });

      it("spells a Java cast with the parenthesised type", () => {
        const exp = lastAssignedValue(
          "Java",
          "class Test {\nvoid main () {\nchar c = 'a';\nint i = (int) c;\n}\n}",
        );
        assertEquals(formatChecked("Java", exp, "cast"), "(int) c");
      });

      it("renders a Pascal cast invisibly, as its inner expression", () => {
        // Pascal has no cast syntax; the parser synthesizes the node when a
        // character is assigned to a string, and the formatter passes through
        const exp = lastAssignedValue(
          "Pascal",
          "program Test;\nvar s: string;\nvar c: char;\nbegin\nc := 'a';\ns := c\nend.",
        );
        assertEquals(formatChecked("Pascal", exp, "cast"), "c");
      });

      it("renders a Python cast invisibly too", () => {
        // print(5) implicitly stringifies its argument via a synthesized cast
        const statement = firstStatement("Python", "print(5)");
        assertEquals(statement.statementType, "procedureCall");
        if (statement.statementType !== "procedureCall") return;
        const exp = statement.arguments[0];
        assertEquals(formatChecked("Python", exp, "cast"), "5");
      });
    });

    describe("compound expressions", () => {
      it("brackets an infix operation", () => {
        const exp = lastAssignedValue("Python", "x = 1\ny = x + 1");
        assertEquals(formatChecked("Python", exp, "compound"), "(x + 1)");
      });

      it('separates a prefix "not" from its operand with a space', () => {
        const exp = lastAssignedValue("Python", "x = 1\nb = not x == 1");
        assertEquals(formatChecked("Python", exp, "compound"), "not (x == 1)");
      });

      it('keeps Pascal\'s "not" spelling', () => {
        const exp = lastAssignedValue(
          "Pascal",
          "program Test;\nvar b: boolean;\nbegin\nb := not true\nend.",
        );
        assertEquals(formatChecked("Pascal", exp, "compound"), "not true");
      });

      it('recognizes BASIC\'s upper-case "NOT" and keeps its spelling', () => {
        const exp = lastAssignedValue("BASIC", "b% = NOT 0\nEND");
        assertEquals(formatChecked("BASIC", exp, "compound"), "NOT 0");
      });

      it("keeps a minus sign tight against its operand", () => {
        const exp = lastAssignedValue("Python", "x = 1\ny = -x");
        assertEquals(formatChecked("Python", exp, "compound"), "-x");
      });

      it('keeps "!" tight against its operand', () => {
        const exp = lastAssignedValue(
          "C",
          "void main () {\nbool a = true;\nbool b = !a;\n}",
        );
        assertEquals(formatChecked("C", exp, "compound"), "!a");
      });
    });

    describe("function calls", () => {
      it("renders a native function call with its arguments", () => {
        const exp = lastAssignedValue("Python", "y = abs(-1)");
        assertEquals(formatChecked("Python", exp, "function"), "abs(-1)");
      });

      it("renders a user-defined function call with its arguments", () => {
        const exp = lastAssignedValue(
          "Python",
          "def f(x):\n    return x + 1\ny = f(1)",
        );
        assertEquals(formatChecked("Python", exp, "function"), "f(1)");
      });

      it("drops the brackets of a zero-argument call in Pascal", () => {
        const exp = lastAssignedValue(
          "Pascal",
          "program Test;\nvar x: integer;\nfunction f: integer;\nbegin\nresult := 1\nend;\nbegin\nx := f\nend.",
        );
        assertEquals(formatChecked("Pascal", exp, "function"), "f");
      });

      it("drops the brackets of a zero-argument call in BASIC", () => {
        const exp = lastAssignedValue(
          "BASIC",
          "x% = FNone\nEND\n\nDEF FNone\n=1",
        );
        assertEquals(formatChecked("BASIC", exp, "function"), "FNone");
      });

      it("keeps the brackets of a zero-argument call in C", () => {
        const program = parseProgram(
          "C",
          "int f () {\nreturn 1;\n}\nvoid main () {\nint y = f();\n}",
        );
        const main = program.subroutines.find((r) => r.name === "main");
        const statement = main?.statements[0];
        assertEquals(statement?.statementType, "variableAssignment");
        if (statement?.statementType !== "variableAssignment") return;
        assertEquals(formatChecked("C", statement.value, "function"), "f()");
      });
    });

    describe("variables", () => {
      it("renders a plain variable as its name", () => {
        const exp = lastAssignedValue("Python", "x = 1\ny = x");
        assertEquals(formatChecked("Python", exp, "variable"), "x");
      });

      it("renders BASIC array indexes in round brackets, comma-separated", () => {
        const exp = lastAssignedValue(
          "BASIC",
          "DIM a%(2, 3)\ny% = a%(1, 2)\nEND",
        );
        assertEquals(formatChecked("BASIC", exp, "variable"), "a%(1, 2)");
      });

      it("renders Pascal array indexes in one pair of square brackets", () => {
        const exp = lastAssignedValue(
          "Pascal",
          "program Test;\nvar a: array[1..2, 1..3] of integer;\nvar x: integer;\nbegin\nx := a[1, 2]\nend.",
        );
        assertEquals(formatChecked("Pascal", exp, "variable"), "a[1, 2]");
      });

      it("renders Python indexes as chained square brackets", () => {
        const exp = lastAssignedValue(
          "Python",
          "a = [[1, 2], [3, 4]]\ny = a[1][0]",
        );
        assertEquals(formatChecked("Python", exp, "variable"), "a[1][0]");
      });
    });

    it("renders a list literal in square brackets", () => {
      const exp = lastAssignedValue("Python", "x = [1, 2]");
      assertEquals(formatChecked("Python", exp, "listLiteral"), "[1, 2]");
    });

    describe("[known limitation] unimplemented expression arms", () => {
      // both arms below literally `return "TODO"` (TODO.md §2.2); the right
      // behaviour is noted per test, and implementing it must update the pin

      it('[known limitation] renders a named argument as "TODO"', () => {
        // should render name and value, e.g. "sep=''"
        const statement = firstStatement("Python", "print('a', sep='')");
        assertEquals(statement.statementType, "procedureCall");
        if (statement.statementType !== "procedureCall") return;
        const exp = statement.arguments[1];
        assertEquals(formatChecked("Python", exp, "namedArgument"), "TODO");
        // and the containing call currently renders with the placeholder
        // embedded, rather than as "print('a', sep='')"
        assertEquals(formatStatement(statement, "Python"), "print('a', TODO)");
      });

      it('[known limitation] renders a query code as "TODO"', () => {
        // should render as its own lexeme, "?mousex", exactly as the input
        // codes already do
        const exp = lastAssignedValue("BASIC", "x% = ?mousex\nEND");
        assertEquals(formatChecked("BASIC", exp, "query"), "TODO");
      });
    });
  });

  describe("formatStatement", () => {
    describe("variable assignments", () => {
      it("renders a Python assignment with =", () => {
        const statement = firstStatement("Python", "x = 1");
        assertEquals(formatStatement(statement, "Python"), "x = 1");
      });

      it("renders a Pascal assignment with :=", () => {
        const statement = firstStatement(
          "Pascal",
          "program Test;\nvar x: integer;\nbegin\nx := 1\nend.",
        );
        assertEquals(formatStatement(statement, "Pascal"), "x := 1");
      });

      it("keeps a BASIC variable's type suffix", () => {
        const statement = firstStatement("BASIC", "x% = 1\nEND");
        assertEquals(formatStatement(statement, "BASIC"), "x% = 1");
      });
    });

    describe("procedure calls", () => {
      it("drops the brackets of a zero-argument call in BASIC", () => {
        const statement = firstStatement("BASIC", "PENUP\nEND");
        assertEquals(formatStatement(statement, "BASIC"), "PENUP");
      });

      it("drops the brackets of a zero-argument call in Pascal", () => {
        const statement = firstStatement(
          "Pascal",
          "program Test;\nbegin\npenup\nend.",
        );
        assertEquals(formatStatement(statement, "Pascal"), "penup");
      });

      it("keeps the brackets of a zero-argument call in Python", () => {
        const statement = firstStatement("Python", "home()");
        assertEquals(formatStatement(statement, "Python"), "home()");
      });

      it("keeps the brackets of a BASIC call with arguments", () => {
        const statement = firstStatement("BASIC", "BLOT(100)\nEND");
        assertEquals(formatStatement(statement, "BASIC"), "BLOT(100)");
      });

      it("renders a user-defined procedure call with its arguments", () => {
        const program = parseProgram("Python", "def f(x):\n    print(x)\nf(1)");
        const statement = program.statements.find(
          (s) => s.statementType === "procedureCall",
        );
        assertEquals(statement === undefined, false);
        assertEquals(formatStatement(statement as Statement, "Python"), "f(1)");
      });
    });

    describe("return statements", () => {
      it("renders a Python return, its value bracketed as a compound", () => {
        const program = parseProgram(
          "Python",
          "def f(x):\n    return x + 1\ny = f(1)",
        );
        const statement = program.subroutines[0].statements.find(
          (s) => s.statementType === "returnStatement",
        );
        assertEquals(statement === undefined, false);
        assertEquals(
          formatStatement(statement as Statement, "Python"),
          "return (x + 1)",
        );
      });

      it("renders a C return", () => {
        const program = parseProgram(
          "C",
          "int f () {\nreturn 1;\n}\nvoid main () {\nint y = f();\n}",
        );
        const f = program.subroutines.find((r) => r.name === "f");
        assertEquals(
          formatStatement(f?.statements[0] as Statement, "C"),
          "return 1",
        );
      });
    });

    describe("[known limitation] unimplemented statement arms", () => {
      // each arm below literally `return "TODO"` (TODO.md §2.2); the right
      // behaviour - rendering the whole construct in the language's own
      // syntax, bodies included - is noted per test, and implementing an arm
      // must update its pin

      /** Asserts the statement parsed as `statementType` and formats to "TODO". */
      const assertTodo = (
        statement: Statement,
        statementType: Statement["statementType"],
        language: Language = "Python",
      ): void => {
        assertEquals(statement.statementType, statementType);
        assertEquals(formatStatement(statement, language), "TODO");
      };

      it('[known limitation] renders an if statement as "TODO"', () => {
        // should be e.g. "if x == 1: ..." with condition and branches
        const statement = bodyStatements(
          "Python",
          parseProgram("Python", "x = 1\nif x == 1:\n    pass"),
        )[1];
        assertTodo(statement, "ifStatement");
      });

      it('[known limitation] renders a for statement as "TODO"', () => {
        // should be e.g. "for i in range(0, 3, 1): ..." with its body
        const statement = firstStatement(
          "Python",
          "for i in range(0, 3, 1):\n    pass",
        );
        assertTodo(statement, "forStatement");
      });

      it('[known limitation] renders a repeat statement as "TODO"', () => {
        // should be e.g. "repeat ... until x = 3" with its body
        const statement = bodyStatements(
          "Pascal",
          parseProgram(
            "Pascal",
            "program Test;\nvar x: integer;\nbegin\nx := 0;\nrepeat\nx := x + 1\nuntil x = 3\nend.",
          ),
        )[1];
        assertTodo(statement, "repeatStatement", "Pascal");
      });

      it('[known limitation] renders a while statement as "TODO"', () => {
        // should be e.g. "while x < 3: ..." with condition and body
        const statement = bodyStatements(
          "Python",
          parseProgram("Python", "x = 0\nwhile x < 3:\n    x = x + 1"),
        )[1];
        assertTodo(statement, "whileStatement");
      });

      it('[known limitation] renders a pass statement as "TODO"', () => {
        // should be "pass"
        const outer = firstStatement("Python", "if 1 == 1:\n    pass");
        assertEquals(outer.statementType, "ifStatement");
        if (outer.statementType !== "ifStatement") return;
        assertTodo(outer.ifStatements[0], "passStatement");
      });

      it('[known limitation] renders break and continue as "TODO"', () => {
        // should be "break" and "continue" (in each language's spelling)
        const loop = bodyStatements(
          "Python",
          parseProgram(
            "Python",
            "x = 0\nwhile x < 3:\n    x = x + 1\n    if x == 1:\n        continue\n    if x == 2:\n        break",
          ),
        )[1];
        assertEquals(loop.statementType, "whileStatement");
        if (loop.statementType !== "whileStatement") return;
        const [ifContinue, ifBreak] = [loop.statements[1], loop.statements[2]];
        assertEquals(ifContinue.statementType, "ifStatement");
        assertEquals(ifBreak.statementType, "ifStatement");
        if (
          ifContinue.statementType !== "ifStatement" ||
          ifBreak.statementType !== "ifStatement"
        ) {
          return;
        }
        assertTodo(ifContinue.ifStatements[0], "continueStatement");
        assertTodo(ifBreak.ifStatements[0], "breakStatement");
      });
    });
  });

  describe("formatProgram", () => {
    it('[known limitation] renders every program as the literal string "program"', () => {
      // should render the entire program's source in its own language;
      // instead the stub ignores its argument entirely (TODO.md §2.2)
      const program = parseProgram("Python", "x = 1\nprint(x)");
      assertEquals(formatProgram(program), "program");
    });
  });
});
