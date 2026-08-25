import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertExists, assertThrows } from "@std/assert";
import type { VariableAssignment } from "@/core/compiler.ts";
import { parseProgram } from "./lib/programs.ts";

/**
 * Coverage for `src/core/compiler/parser/common/*.ts` and
 * `src/core/compiler/parser/definitions/*.ts` -- the shared plumbing every
 * language's parser calls into, but which the six per-language test files
 * (and common.test.ts's cross-language statement-kind table) don't happen to
 * exercise, because none of them use input/query codes, colour names, the
 * "not"/address-of unary operators, string-comparison operators, or
 * method-call syntax as *expressions*.
 *
 * A note on things confirmed genuinely unreachable while writing these tests
 * (confirmed by direct experiment, not assumed -- see this file's own
 * describe blocks below for where each was checked):
 *
 * - `common/factor.ts`'s "{lex} is not a valid input code."/"...query
 *   code." throws (the `if (input) {...} throw ...` / `if (query) {...}
 *   throw ...` shapes) are dead code. The tokenizer only ever produces an
 *   "input"/"query" typed lexeme for codes that already matched the exact
 *   same `inputs` name list (see `tokenizer/tokenize.ts`'s `inputCode`/
 *   `queryCode`, and `lexer/lexeme.ts`'s `inputCodeLexeme`/`queryCodeLexeme`
 *   which apply the same Pascal-lowercasing `find.input`/`find.query` do);
 *   anything that doesn't match becomes a "badInputCode"/"badQueryCode"
 *   token instead, which `lexify.ts` rejects itself ("Unrecognised input
 *   code."/"Unrecognised input query.") before the parser ever sees it.
 * - `common/typeCheck.ts`'s former function-result-type-inference branch
 *   (`found.expressionType === "function" && found.command.__ ===
 *   "Subroutine" && !found.command.typeIsCertain`) was dead code given the
 *   shape of `common/functionCall.ts`'s `parseFunctionCall`: it *always*
 *   flips `command.typeIsCertain` to `true` (creating the "!result"
 *   variable if needed) before returning the `FunctionCall` expression, for
 *   every language including Python and including recursive self-calls --
 *   so by the time any caller passed that expression to `typeCheck`, the
 *   flag was already `true` and the branch's own condition could never be
 *   met. Removed (see the comment left in its place in typeCheck.ts).
 * - `common/find.ts`'s `isDuplicate`'s `routine.globals.some(...)` check
 *   (only the `globals` line, not `nonlocals`, which *is* covered below) was
 *   effectively unreachable: `python/subroutine.ts`'s hoisting pass eagerly
 *   creates the corresponding Program-level variable for every name in a
 *   `global` statement (if it doesn't already exist) before the subroutine
 *   body is parsed for real, so by the time a same-named declaration would
 *   run `find.isDuplicate`, `find.variable` already succeeds first and a
 *   different code path (redeclaration of an already-typed variable) fires
 *   instead. `nonlocal` names get no such eager pre-creation, so the
 *   equivalent `nonlocals` branch *is* reachable (and tested below). Removed
 *   (see the comment left in its place in find.ts).
 * - `definitions/variable.ts`'s `getLength`/`getSubVariables`/
 *   `baseLength`/`makeSubVariable`, and `definitions/routine.ts`'s
 *   `getMemoryNeeded`, are never called anywhere under `parser/` -- their
 *   only callers are `compiler/encoder/**`. They're out of scope for this
 *   stage (parsing only produces the AST; the encoder has its own tests) and
 *   are left untested here.
 * - `definitions/expression.ts`'s `getType`'s `"namedArgument"` case is
 *   similarly never reached from the parser: the one place a
 *   `NamedArgument` expression is constructed (Python's `print(end=...)`
 *   handling in `common/arguments.ts`) calls `typeCheck`/`getType` on the
 *   raw argument *before* wrapping it in `makeNamedArgument`, so the
 *   wrapped expression's own type is never queried again during parsing.
 *   Nor by anything downstream: the encoder's only `getType` calls are on a
 *   `CastExpression`'s inner expression, and the one cast the print
 *   handling creates wraps the raw argument *inside* the `NamedArgument`,
 *   never the other way round.
 *
 * Further confirmed-unreachable branches, found while closing the rest of
 * this gap (each checked against every call site, not assumed):
 *
 * - `common/evaluate.ts`'s `"lmul"` case (and therefore the two `break`s
 *   that fall through to its final "This expression cannot be evaluated as
 *   a constant." throw), and the `"listLiteral"` case's `"string"`/
 *   `"array"`/`"step"` context arms. `lmul` and list literals are both
 *   Python-only, and "constant" is the only one of `evaluate`'s four
 *   contexts Python can reach -- it has no array-size specification
 *   (`basic/variable.ts`, `c/variable.ts`, `java/type.ts`,
 *   `typescript/type.ts`, `pascal/type.ts`), no string-size specification
 *   (`pascal/type.ts`) and no FOR-loop step (`basic/statements/
 *   forStatement.ts`; Python's own `range(a,b,step)` handling *is* the
 *   "step" context, but a list there is rejected by the integer type check
 *   before `evaluate` ever sees it). Its `default: expression satisfies
 *   never` arm is dead by TypeScript's own exhaustiveness check.
 * - `common/typeCheck.ts`'s `pinListElementKind`'s "already known, nothing
 *   to do" early return. Both call sites (`common/arguments.ts`'s
 *   `matchesListElement` handling, and `python/statements/
 *   variableAssignment.ts`'s indexed-write handling) only call it *after*
 *   establishing that the element kind is still unknown, so the guard can
 *   never fire. It's a defensive no-op, not a live path.
 * - `common/find.ts`'s `assignmentTarget`'s Pascal lower-casing arm.
 *   `assignmentTarget` exists for Python's binding rules and is called from
 *   `python/statement.ts` and `python/statements/forStatement.ts` only (see
 *   its own doc comment), so `routine.language` is always "Python" there.
 *   Its `input`/`query` equivalents in the same file *are* reachable from
 *   Pascal, and are tested below.
 * - `definitions/expression.ts`'s `getListElementKind`'s three "not (or no
 *   longer) a list" fall-throughs -- the `!isList` early return, the
 *   `>= 2`-indexes arm of the list-of-lists case, and the indexed arm of
 *   the flat-list case. Every call site either guards with
 *   `isListExpression` first (which already returns false for all three
 *   shapes), or is `common/arguments.ts`'s `matchesListElement` handling --
 *   and every `pElement` parameter in `constants/commands.ts` is preceded
 *   by a `pList` receiver parameter, so by the time the element parameter
 *   is checked the receiver has already been proved list-typed.
 * - `definitions/routines/subroutine.ts`'s `getResultType`'s `null` return,
 *   and `definitions/variable.ts`'s `elementCount`'s `0` return. Both are
 *   fallbacks for a case their callers have already excluded:
 *   `getResultType` is only called where the routine is known to be a
 *   function (the four per-language `statements/returnStatement.ts` files
 *   all reject a value-returning `return` in a procedure first, and
 *   `definitions/expressions/functionCall.ts` is only reached past
 *   `common/functionCall.ts`'s own "is a procedure, not a function" throw),
 *   and every `elementCount` caller has already tested `isArray`.
 */

describe("parse: shared parser plumbing (common/ and definitions/)", () => {
  describe("factor.ts: unary operators", () => {
    it('parses a "not" prefix expression', () => {
      const program = parseProgram("BASIC", "x% = NOT TRUE\nEND");
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.expressionType, "compound");
      if (assignment.value.expressionType === "compound") {
        assertEquals(assignment.value.operator, "not");
        assertEquals(assignment.value.left, null);
      }
    });

    it('throws when the address-of operator "&" is used outside C', () => {
      // success and the "must be followed by a variable" error are already
      // covered for C in c.test.ts's "address-of operator" tests; this
      // closes the other branch of `if (routine.language !== "C")`
      assertThrows(
        () => parseProgram("Python", "x = &1"),
        Error,
        "Expression cannot begin with",
      );
    });
  });

  describe("factor.ts and find.ts: input and query codes", () => {
    it("parses an input code as an expression value", () => {
      const program = parseProgram("Python", "x = \\key");
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.expressionType, "input");
    });

    it("parses a query code as an expression value", () => {
      const program = parseProgram("Python", "x = ?key");
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.expressionType, "query");
    });
  });

  describe("factor.ts and find.ts: colour constants", () => {
    it("parses a predefined colour name as an expression value", () => {
      const program = parseProgram("Python", "x = green");
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.expressionType, "colour");
    });

    it('normalises the American "gray" spelling to "grey"', () => {
      const program = parseProgram("Python", "x = darkgray");
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.expressionType, "colour");
      if (assignment.value.expressionType === "colour") {
        // 0x404040 is "darkgrey"'s defined value in src/core/constants/colours.ts
        assertEquals(assignment.value.colour.value, 0x404040);
      }
    });
  });

  describe("factor.ts: constant character indexing", () => {
    it("parses a character index into a string constant (BASIC, parens)", () => {
      const program = parseProgram(
        "BASIC",
        'CONST size$ = "hello"\nx$ = size$(0)\nEND',
      );
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.expressionType, "constant");
      if (assignment.value.expressionType === "constant") {
        assertEquals(assignment.value.indexes.length, 1);
      }
    });

    it("parses a character index into a string constant (TypeScript, square brackets)", () => {
      const program = parseProgram(
        "TypeScript",
        'const size: string = "hello";\nvar x: string;\nx = size[0];',
      );
      const assignment = program.statements.find(
        (s) =>
          s.statementType === "variableAssignment" && s.variable.name === "x",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.expressionType, "constant");
      if (assignment.value.expressionType === "constant") {
        assertEquals(assignment.value.indexes.length, 1);
      }
    });

    it("throws when indexing a non-string constant", () => {
      assertThrows(
        () => parseProgram("BASIC", "CONST size% = 5\nx% = size%(0)\nEND"),
        Error,
        "is not a string constant",
      );
    });

    it("throws when the constant character index is missing its closing bracket", () => {
      assertThrows(
        () => parseProgram("BASIC", 'CONST size$ = "hello"\nx$ = size$(0\nEND'),
        Error,
        'Closing bracket ")" missing after string variable index',
      );
    });
  });

  describe("factor.ts: variable array/string indexing as an expression value", () => {
    it('parses a multi-dimensional array element, skipping "][" (C)', () => {
      const program = parseProgram(
        "C",
        "int arr[2][3];\nvoid main () {\nint y = arr[0][1];\n}",
      );
      const sub = program.subroutines[0];
      const assignment = sub.statements.find(
        (s) =>
          s.statementType === "variableAssignment" && s.variable.name === "y",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.expressionType, "variable");
      if (assignment.value.expressionType === "variable") {
        assertEquals(assignment.value.indexes.length, 2);
      }
    });

    it("parses comma-separated array indexes as an expression value (BASIC)", () => {
      const program = parseProgram(
        "BASIC",
        "DIM arr%(3,3)\nx% = arr%(1,2)\nEND",
      );
      const assignment = program.statements.find(
        (s) =>
          s.statementType === "variableAssignment" && s.variable.name === "x%",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      if (assignment?.value.expressionType === "variable") {
        assertEquals(assignment.value.indexes.length, 2);
      }
    });

    it("throws on a trailing comma in array indexes as an expression value (BASIC)", () => {
      assertThrows(
        () => parseProgram("BASIC", "DIM arr%(3,3)\nx% = arr%(1,)\nEND"),
        Error,
        "Trailing comma at the end of array indexes",
      );
    });

    it("throws when array indexes run out of lexemes before a closing bracket", () => {
      assertThrows(
        () => parseProgram("C", "int arr[3];\nvoid main () {\nint y = arr[0"),
        Error,
        'Closing bracket "]" needed after array indexes',
      );
    });

    it("throws when too many indexes are given for an array variable as an expression value", () => {
      assertThrows(
        () =>
          parseProgram(
            "C",
            "int arr[3];\nvoid main () {\nint y = arr[0][1];\n}",
          ),
        Error,
        "Too many indexes for array variable",
      );
    });

    it("parses a Python string slice x[a:b]", () => {
      const program = parseProgram("Python", 's = "hello"\nx = s[1:3]');
      const assignment = program.statements.find(
        (s) =>
          s.statementType === "variableAssignment" && s.variable.name === "x",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      if (assignment?.value.expressionType === "variable") {
        assertExists(assignment.value.slice);
        assertEquals(assignment.value.slice?.length, 2);
      }
    });

    it("throws when indexing a non-string, non-array variable as an expression value", () => {
      assertThrows(
        () => parseProgram("Python", "x = 1\ny = x[0]"),
        Error,
        "is not a string or array variable",
      );
    });
  });

  describe("factor.ts and functionCall.ts: method-call syntax as an expression value", () => {
    // only Python and Pascal tokenize "." as a delimiter; only Pascal has any
    // ".name" native command (e.g. ".length"), so Pascal is the only language
    // that can reach this path today
    it('parses "s.length" (no parens: the method has no extra parameters)', () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar s: string;\nvar x: integer;\nbegin\nx := s.length;\nend.",
      );
      const assignment = program.statements.find(
        (s) =>
          s.statementType === "variableAssignment" && s.variable.name === "x",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.expressionType, "function");
    });

    it("throws when a method name is missing after the dot", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar s: string;\nvar x: integer;\nbegin\nx := s.5;\nend.",
          ),
        Error,
        "Method name missing after '.'",
      );
    });

    it("throws when the named method is not a recognised native command", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar s: string;\nvar x: integer;\nbegin\nx := s.bogus;\nend.",
          ),
        Error,
        'Method "bogus" is not defined.',
      );
    });

    it("throws when the method is not defined for the variable's type", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar n: integer;\nvar x: integer;\nbegin\nx := n.length;\nend.",
          ),
        Error,
        'Method ".length" is not defined for type "integer"',
      );
    });
  });

  describe("factor.ts: identifiers that resolve to nothing", () => {
    it("throws when an identifier used as an expression value is not defined (non-Python)", () => {
      // Python instead auto-creates the variable and retries (see
      // python.test.ts); every other language throws immediately
      assertThrows(
        () => parseProgram("C", "int x = 1;\nvoid main () {\nint y = foo;\n}"),
        Error,
        "is not defined",
      );
    });
  });

  describe("common/typeCheck.ts: coercion branches", () => {
    it("allows a string literal where a character is expected", () => {
      const program = parseProgram("C", 'void main () {\nchar c = "a";\n}');
      const sub = program.subroutines[0];
      const assignment = sub.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
    });

    it("allows an integer literal where a character is expected", () => {
      const program = parseProgram("C", "void main () {\nchar c = 97;\n}");
      const sub = program.subroutines[0];
      const assignment = sub.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
    });

    it("allows an integer where a boolean is expected (Python)", () => {
      const program = parseProgram("Python", "x = 1\nif x:\n    pass");
      assertExists(
        program.statements.find((s) => s.statementType === "ifStatement"),
      );
    });

    it("allows an integer where a boolean is expected (TypeScript)", () => {
      const program = parseProgram(
        "TypeScript",
        "var x: number = 1;\nif (x) {\n}",
      );
      assertExists(
        program.statements.find((s) => s.statementType === "ifStatement"),
      );
    });
  });

  describe("common/expression.ts: string/character operator promotion", () => {
    it('promotes a comparison operator (not just "plus") when a string is involved', () => {
      const program = parseProgram("Python", 'x = "a" == "b"');
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.expressionType, "compound");
      if (assignment.value.expressionType === "compound") {
        assertEquals(assignment.value.operator, "seql");
      }
    });

    it('promotes "plus" to string concatenation when a string is involved', () => {
      const program = parseProgram("Python", 'x = "a" + "b"');
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      if (assignment?.value.expressionType === "compound") {
        assertEquals(assignment.value.operator, "scat");
      }
    });

    it('promotes "plus" to concatenation when both sides are characters (no string present)', () => {
      // exercises the character-only special case (the "TODO: reconsider
      // this" block), distinct from the string-present promotion above:
      // both operands stay type "character" through typeCheck (character
      // expected/character found is a no-op coercion), so the *string*
      // branch's condition is false and only the character branch fires
      const program = parseProgram(
        "C",
        "void main () {\nchar c1 = 'a';\nchar c2 = 'b';\nstring[10] s;\ns = c1 + c2;\n}",
      );
      const sub = program.subroutines[0];
      const assignment = sub.statements.find(
        (s) =>
          s.statementType === "variableAssignment" && s.variable.name === "s",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      if (assignment?.value.expressionType === "compound") {
        assertEquals(assignment.value.operator, "scat");
      }
    });

    it('leaves a non-"plus" operator alone when both sides are characters', () => {
      // covers the false branch of `if (op === "plus")` inside the
      // character-type special case
      const program = parseProgram(
        "C",
        "void main () {\nchar c1 = 'a';\nchar c2 = 'b';\nbool b;\nb = c1 == c2;\n}",
      );
      const sub = program.subroutines[0];
      const assignment = sub.statements.find(
        (s) =>
          s.statementType === "variableAssignment" && s.variable.name === "b",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      if (assignment?.value.expressionType === "compound") {
        assertEquals(assignment.value.operator, "eqal");
      }
    });
  });

  describe("definitions/operators.ts: stringOperator", () => {
    it('falls back to the original operator when no string equivalent exists (e.g. "subt")', () => {
      // reachable because typeCheck only cares that both operand types
      // match (string === string); it doesn't care whether the operator
      // makes semantic sense for strings
      const program = parseProgram("Python", 'x = "a" - "b"');
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      if (assignment?.value.expressionType === "compound") {
        assertEquals(assignment.value.operator, "subt");
      }
    });
  });

  describe("common/evaluate.ts: constant folding", () => {
    it("evaluates a representative spread of operators via a compound CONST expression", () => {
      const cases: [string, string, number][] = [
        ["plus/mult", "CONST x% = 1 + 2 * 3\nEND", 7],
        ["subt (binary)", "CONST x% = 10 - 3\nEND", 7],
        ["subt (unary neg)", "CONST x% = -5\nEND", -5],
        ["not", "CONST x% = NOT TRUE\nEND", 0],
        ["eqal", "CONST x% = (1 = 1)\nEND", -1],
        ["less", "CONST x% = (1 < 2)\nEND", -1],
        ["lseq", "CONST x% = (1 <= 2)\nEND", -1],
        ["more", "CONST x% = (2 > 1)\nEND", -1],
        ["mreq", "CONST x% = (2 >= 1)\nEND", -1],
        ["noeq", "CONST x% = (1 <> 2)\nEND", -1],
        // and the falsifying case of each comparison, so that a folded
        // comparison can't silently degenerate into "always true"
        ["eqal (false)", "CONST x% = (1 = 2)\nEND", 0],
        ["less (false)", "CONST x% = (2 < 1)\nEND", 0],
        ["lseq (false)", "CONST x% = (2 <= 1)\nEND", 0],
        ["more (false)", "CONST x% = (1 > 2)\nEND", 0],
        ["mreq (false)", "CONST x% = (1 >= 2)\nEND", 0],
        ["noeq (false)", "CONST x% = (1 <> 1)\nEND", 0],
        ["not (of false)", "CONST x% = NOT FALSE\nEND", -1],
        // "subt" is implemented as "left ? left - right : -right", so a
        // left operand of zero takes the negation path rather than the
        // subtraction path - the answer has to come out the same either way
        ["subt (zero left)", "CONST x% = (0 - 3)\nEND", -3],
        ["or", "CONST x% = (1 OR 2)\nEND", 3],
        ["orl", "CONST x% = (TRUE OR FALSE)\nEND", -1],
        ["xor", "CONST x% = (1 EOR 2)\nEND", 3],
        ["and", "CONST x% = (3 AND 1)\nEND", 1],
        ["andl", "CONST x% = (TRUE AND FALSE)\nEND", 0],
        ["div", "CONST x% = (7 DIV 2)\nEND", 3],
        ["divr", "CONST x% = (7 / 2)\nEND", 4],
        ["mod", "CONST x% = (7 MOD 2)\nEND", 1],
        ["mult", "CONST x% = (3 * 4)\nEND", 12],
      ];
      for (const [label, code, expected] of cases) {
        const program = parseProgram("BASIC", code);
        assertEquals(
          program.constants[0]?.value,
          expected,
          `operator: ${label}`,
        );
      }
    });

    it("evaluates string concatenation via a compound CONST expression", () => {
      const program = parseProgram("BASIC", 'CONST x$ = ("a" + "b")\nEND');
      assertEquals(program.constants[0]?.value, "ab");
    });
  });

  describe("common/evaluate.ts: 'variable'/'function' not allowed, per context", () => {
    it("throws when a string size specification refers to a variable", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar n: integer;\nvar s: string[n];\nbegin\nend.",
          ),
        Error,
        "String size specification cannot refer to any variables",
      );
    });

    it("throws when a string size specification invokes a function", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar s: string[abs(-1)];\nbegin\nend.",
          ),
        Error,
        "String size specification cannot invoke any functions",
      );
    });

    it("throws when an array size specification refers to a variable", () => {
      assertThrows(
        () => parseProgram("BASIC", "n% = 5\nDIM arr%(n%)\nEND"),
        Error,
        "Array size specification cannot refer to any variables",
      );
    });

    it("throws when an array size specification invokes a function", () => {
      assertThrows(
        () => parseProgram("BASIC", "DIM arr%(ABS(-1))\nEND"),
        Error,
        "Array size specification cannot invoke any functions",
      );
    });

    it("throws when a FOR loop step specification refers to a variable", () => {
      assertThrows(
        () =>
          parseProgram("BASIC", "n% = 1\nFOR i% = 1 TO 10 STEP n%\nNEXT\nEND"),
        Error,
        "FOR loop step change specification cannot refer to any variables",
      );
    });

    it("throws when a FOR loop step specification invokes a function", () => {
      assertThrows(
        () => parseProgram("BASIC", "FOR i% = 1 TO 10 STEP ABS(-1)\nNEXT\nEND"),
        Error,
        "FOR loop step change specification cannot invoke any functions",
      );
    });

    // "constant" context's own variable/function errors are already covered
    // by pascal.test.ts's "CONST declarations" tests
  });

  describe("common/find.ts: BASIC PRIVATE variables", () => {
    it("allows a PRIVATE variable to be referenced from within its own declaring subroutine", () => {
      // PRIVATE variables are pushed onto the *program's* variables array
      // (see basic/statement.ts's "private" case), so find.ts's `variable()`
      // has to track the routine that originated the lookup separately from
      // the routine the ancestor-search recursion has currently reached, to
      // compare the match's owner against the right one
      const program = parseProgram(
        "BASIC",
        "END\nDEF PROCa\nPRIVATE x%\nx% = 1\nENDPROC",
      );
      const sub = program.subroutines.find((s) => s.name === "PROCa");
      assertExists(sub);
      assert(
        sub.statements.some((s) => s.statementType === "variableAssignment"),
      );
    });

    it("throws when a PRIVATE variable is referenced from another subroutine", () => {
      assertThrows(
        () =>
          parseProgram(
            "BASIC",
            "END\nDEF PROCa\nPRIVATE x%\nENDPROC\nDEF PROCb\nx% = 1\nENDPROC",
          ),
        Error,
        "is already defined in the current scope",
      );
    });
  });

  describe("common/find.ts: isDuplicate against Python global/nonlocal declarations", () => {
    it("throws when a new typed declaration collides with an enclosing 'nonlocal' name", () => {
      assertThrows(
        () =>
          parseProgram(
            "Python",
            "def outer():\n    def inner():\n        nonlocal z\n        z: int = 5\n    inner()\nouter()",
          ),
        Error,
        "is already the name of a variable or subroutine in the current scope",
      );
    });

    // the equivalent `routine.globals.some(...)` branch is effectively
    // unreachable -- see this file's top-level comment
  });

  describe("common/find.ts: Pascal case-insensitivity for input and query codes", () => {
    // Pascal is the only case-insensitive language, so `find.input`/
    // `find.query` lower-case the name before matching; every other
    // language's lookup (covered above, in Python) is exact. Written in
    // upper case here precisely so the lower-casing is what makes it match.
    it("resolves an upper-case input code in Pascal", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar x: integer;\nbegin\nx := \\KEY;\nend.",
      );
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.expressionType, "input");
      if (assignment.value.expressionType === "input") {
        assertEquals(assignment.value.input.name, "key");
      }
    });

    it("resolves an upper-case query code in Pascal", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar x: integer;\nbegin\nx := ?KEY;\nend.",
      );
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.expressionType, "query");
      if (assignment.value.expressionType === "query") {
        assertEquals(assignment.value.input.name, "key");
      }
    });
  });

  describe("factor.ts: expressions that run out of lexemes", () => {
    // Python throughout this block: it has the least syntactic ceremony of
    // the six (no statement terminator, no program shell), so a fragment
    // can be truncated exactly where the branch under test needs it
    it("throws when an expression begins with an operator that cannot be unary", () => {
      // "*" lexes as an operator, so this reaches parseFactor's *operator*
      // switch's own default case -- a different throw site from the
      // identically-worded one in the outermost default case (reached only
      // by non-operator lexemes)
      assertThrows(
        () => parseProgram("Python", "x = *2"),
        Error,
        'Expression cannot begin with "*"',
      );
    });

    it("throws when a bracketed expression is never closed", () => {
      assertThrows(
        () => parseProgram("Python", "x = (1 + 2"),
        Error,
        "Closing bracket missing after expression",
      );
    });

    it("throws when a string variable index is never closed", () => {
      assertThrows(
        () => parseProgram("Python", 's = "hello"\nx = s[1'),
        Error,
        'Closing bracket "]" missing after string variable index',
      );
    });

    it("throws when a list variable index is never closed", () => {
      assertThrows(
        () => parseProgram("Python", "x = [1,2]\ny = x[0"),
        Error,
        'Closing bracket "]" missing after list variable index',
      );
    });

    it("throws when a list-of-lists' second index is never closed", () => {
      assertThrows(
        () => parseProgram("Python", "x = [[1,2],[3,4]]\ny = x[0][1"),
        Error,
        'Closing bracket "]" missing after list variable index',
      );
    });

    it("throws when a list literal runs out of lexemes before its first element", () => {
      // the error lexeme is what distinguishes this from the "x = [1, 2"
      // case (covered in python.test.ts): there the element loop is entered
      // and throws against the last element parsed, whereas here the loop
      // is never entered at all and the post-loop check fires against the
      // opening bracket itself
      assertThrows(
        () => parseProgram("Python", "x = ["),
        Error,
        'Closing bracket "]" needed after list elements. ("["',
      );
    });
  });

  describe("factor.ts: nested list literals", () => {
    it("parses a nested list literal as a list of lists", () => {
      const program = parseProgram("Python", "x = [[1,2],[3,4]]");
      const variable = program.variables.find((v) => v.name === "x");
      assertExists(variable);
      assert(variable.isList);
      assert(variable.isListOfLists);
      // the outer elements are opaque sublist pointers ("integer"); the
      // sublists' own scalar element kind is tracked separately
      assertEquals(variable.listElementKind, "integer");
      assertEquals(variable.innerListElementKind, "integer");
    });

    it("throws when a nested list literal mixes a list with a non-list element", () => {
      assertThrows(
        () => parseProgram("Python", "x = [[1,2], 3]"),
        Error,
        "Type error: a list was expected.",
      );
    });

    it("throws when a nested list literal mixes lists of different element kinds", () => {
      assertThrows(
        () => parseProgram("Python", "x = [[1,2], ['a','b']]"),
        Error,
        "Type error: a list of 'integer' was expected but a list of 'string' was found.",
      );
    });
  });

  describe("common/evaluate.ts: non-arithmetic constant value kinds", () => {
    // BASIC for the first three: its CONST syntax takes a bare expression
    // with no type annotation, so each value kind can be written directly
    it("evaluates an input code as a constant value", () => {
      const program = parseProgram("BASIC", "CONST x% = \\key\nEND");
      // -9 is "key"'s defined value in src/core/constants/inputs.ts
      assertEquals(program.constants[0]?.value, -9);
    });

    it("evaluates a query code as a constant value", () => {
      const program = parseProgram("BASIC", "CONST x% = ?key\nEND");
      assertEquals(program.constants[0]?.value, -9);
    });

    it("evaluates a colour name as a constant value", () => {
      const program = parseProgram("BASIC", "CONST x% = GREEN\nEND");
      // 0x228B22 is "green"'s defined value in src/core/constants/colours.ts
      assertEquals(program.constants[0]?.value, 0x228b22);
    });

    it("evaluates through a type cast (Java)", () => {
      // C and Java are the only languages with cast syntax; the cast is
      // only wrapped around the expression when the target type actually
      // differs from the expression's own, hence 'a' (a character) cast to
      // int rather than a same-type no-op cast
      const program = parseProgram(
        "Java",
        "class Test {\nfinal int x = (int) 'a';\nvoid main () {\n}\n}",
      );
      assertEquals(program.constants[0]?.value, 97);
    });
  });

  describe("common/evaluate.ts: logical vs bitwise and/or", () => {
    // Python's "and"/"or" lex as the *logical* operators "andl"/"orl"
    // (as do "&&"/"||" in C, Java and TypeScript), whereas BASIC's
    // "AND"/"OR" lex as the bitwise "and"/"or" -- these fold to genuinely
    // different values, which is the whole point of the pairing below
    it('folds Python "or" as JavaScript "||", not as a bitwise or', () => {
      const program = parseProgram("Python", "MAX: Final = 2 or 4");
      assertEquals(program.constants[0]?.value, 2);
    });

    it('folds BASIC "OR" as a bitwise or', () => {
      const program = parseProgram("BASIC", "CONST x% = (2 OR 4)\nEND");
      assertEquals(program.constants[0]?.value, 6);
    });

    it('folds Python "and" as JavaScript "&&", not as a bitwise and', () => {
      const program = parseProgram("Python", "MAX: Final = 2 and 4");
      assertEquals(program.constants[0]?.value, 4);
    });

    it('folds BASIC "AND" as a bitwise and', () => {
      const program = parseProgram("BASIC", "CONST x% = (2 AND 4)\nEND");
      assertEquals(program.constants[0]?.value, 0);
    });

    it('yields the right-hand operand when "or"\'s left operand is falsy', () => {
      const program = parseProgram("Python", "MAX: Final = 0 or 4");
      assertEquals(program.constants[0]?.value, 4);
    });

    it('yields the left-hand operand when "and"\'s left operand is falsy', () => {
      const program = parseProgram("Python", "MAX: Final = 0 and 4");
      assertEquals(program.constants[0]?.value, 0);
    });
  });

  describe("common/evaluate.ts: 'address'/'list' values not allowed", () => {
    it("throws when a constant value takes the address of a variable", () => {
      // C is the only language with the address-of operator "&"
      assertThrows(
        () => parseProgram("C", "int y;\nconst int x = &y;\nvoid main () {\n}"),
        Error,
        "Constant value cannot refer to any variables.",
      );
    });

    it("throws when a constant value is a list literal", () => {
      // lists are Python-only, and "constant" is the only one of evaluate's
      // four contexts Python can reach (it has no array-size, string-size
      // or FOR-step specifications) -- see this file's top-level comment
      assertThrows(
        () => parseProgram("Python", "MAX: Final = [1,2]"),
        Error,
        "Constant value cannot be a list.",
      );
    });
  });

  describe("common/arguments.ts: argument list errors", () => {
    it("throws when the argument list runs out of lexemes mid-way", () => {
      // "setxy" takes two parameters, so after the first there is nothing
      // left at all -- distinct from the ")" and "not a comma" cases, which
      // do have a lexeme to complain about
      assertThrows(
        () => parseProgram("Python", "setxy(1"),
        Error,
        "Comma needed after parameter",
      );
    });

    it("throws when the argument list is not closed after the last parameter", () => {
      // all parameters are satisfied, so the argument loop exits normally
      // and it's the post-loop closing-bracket check that fires
      assertThrows(
        () => parseProgram("Python", "setxy(1, 2 3)"),
        Error,
        'Closing bracket missing after command "setxy"',
      );
    });
  });

  describe("common/arguments.ts: the length command accepts an array", () => {
    it("accepts an array variable as the argument to Pascal's length()", () => {
      // the length command is spelled "length" in Java, Pascal and
      // TypeScript, "LEN" in BASIC, "strlen" in C and "len" in Python;
      // Pascal is used here because its array declaration syntax is the
      // most explicit about the bounds. An array argument bypasses the
      // normal type check entirely (the parameter's declared type is
      // "string"), which is what makes this compile at all
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar arr: array[1..5] of integer;\nvar x: integer;\nbegin\nx := length(arr);\nend.",
      );
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.expressionType, "function");
      if (assignment.value.expressionType === "function") {
        assertEquals(assignment.value.arguments.length, 1);
        assertEquals(assignment.value.arguments[0].expressionType, "variable");
      }
    });
  });

  describe("common/arguments.ts and typeCheck.ts: lists of lists", () => {
    it("appends a sublist to a list of lists", () => {
      const program = parseProgram(
        "Python",
        "wins = [[0,1],[2,3]]\nwins.append([4,5])",
      );
      const call = program.statements.find(
        (s) => s.statementType === "procedureCall",
      );
      assertExists(call);
      if (call.statementType === "procedureCall") {
        // arguments[0] is the receiver, arguments[1] the appended sublist
        assertEquals(call.arguments.length, 2);
        assertEquals(call.arguments[1].expressionType, "listLiteral");
      }
    });

    it("throws when a scalar is appended to a list of lists", () => {
      assertThrows(
        () => parseProgram("Python", "wins = [[0,1],[2,3]]\nwins.append(5)"),
        Error,
        "Type error: a list was expected.",
      );
    });

    it("throws when a sublist of the wrong element kind is appended", () => {
      assertThrows(
        () =>
          parseProgram(
            "Python",
            "wins = [[0,1],[2,3]]\nwins.append(['a','b'])",
          ),
        Error,
        "Type error: a list of 'integer' was expected but a list of 'string' was found.",
      );
    });

    it("pins a list of lists' inner element kind from a later append", () => {
      // "thisgen.append(xlist)" pins thisgen as a list *of lists*, but
      // xlist's own element kind isn't known yet, so the inner kind is left
      // undefined; the second append is the first thing that reveals it
      const program = parseProgram(
        "Python",
        "thisgen = []\nxlist = []\nthisgen.append(xlist)\nylist = [1,2]\nthisgen.append(ylist)\nxlist.append(3)",
      );
      const thisgen = program.variables.find((v) => v.name === "thisgen");
      assertExists(thisgen);
      assert(thisgen.isListOfLists);
      assertEquals(thisgen.innerListElementKind, "integer");
      assert(thisgen.typeIsCertain);
    });

    it("propagates list-of-lists-ness when assigned to a fresh variable", () => {
      // typeCheck's "expected type isn't certain yet" inference has to copy
      // isListOfLists/innerListElementKind across too, not just isList --
      // otherwise the sublists get mistaken for plain integers
      const program = parseProgram(
        "Python",
        "wins = [[0,1],[2,3]]\nnewlist = wins",
      );
      const newlist = program.variables.find((v) => v.name === "newlist");
      assertExists(newlist);
      assert(newlist.isList);
      assert(newlist.isListOfLists);
      assertEquals(newlist.innerListElementKind, "integer");
    });

    it("throws when a list is reassigned a list of a different element kind", () => {
      // both sides are lists, so the scalar coercion ladder is skipped
      // entirely and only the element kinds are compared
      assertThrows(
        () => parseProgram("Python", "x = [1,2]\nx = ['a','b']"),
        Error,
        "Type error: a list of 'integer' was expected but a list of 'string' was found.",
      );
    });

    it("checks an assignment between two list-of-lists variables by element kind", () => {
      const program = parseProgram("Python", "a = [[1,2]]\nb = [[3,4]]\na = b");
      const assignments = program.statements.filter(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment[];
      assertEquals(assignments.length, 3);
      assertEquals(assignments[2].value.expressionType, "variable");
    });
  });

  describe("definitions/expression.ts: getType and getListElementKind", () => {
    it("types an indexed string constant as a character (C)", () => {
      // C, Java and Pascal are the three languages with a distinct
      // "character" type; the two cast errors below differ only in the type
      // getType reported for the indexed vs the unindexed constant, so this
      // pair pins that behavior precisely
      assertThrows(
        () =>
          parseProgram(
            "C",
            'const string s = "hi";\nvoid main () {\nbool b = (bool) s[0];\n}',
          ),
        Error,
        "Characters cannot be cast as booleans.",
      );
      assertThrows(
        () =>
          parseProgram(
            "C",
            'const string s = "hi";\nvoid main () {\nbool b = (bool) s;\n}',
          ),
        Error,
        "Strings cannot be cast as booleans.",
      );
    });

    it('types an element of a not-yet-typed list as "boolint"', () => {
      // "x = []" leaves x's element kind unknown, so reading "x[0]" has no
      // definite type yet and falls back to the same "boolint" placeholder
      // a fresh Python variable starts out with; "x.append(1)" afterwards
      // is what stops the program failing the uncertain-type check
      const program = parseProgram("Python", "x = []\ny = x[0]\nx.append(1)");
      const y = program.variables.find((v) => v.name === "y");
      assertExists(y);
      assertEquals(y.type, "boolint");
    });

    it("reports a sublist reference's element kind as the inner kind", () => {
      // "wins[0]" is still list-typed (one index into a list of lists), and
      // ".copy()" returns a list of the *receiver's* element kind -- which
      // for a sublist reference is the inner kind, not the outer "integer"
      // sublist-pointer kind
      const program = parseProgram(
        "Python",
        "wins = [[1,2],[3,4]]\nsub = wins[0].copy()",
      );
      const sub = program.variables.find((v) => v.name === "sub");
      assertExists(sub);
      assert(sub.isList);
      assertEquals(sub.listElementKind, "integer");
    });

    it("type-checks an argument against a sublist receiver's inner element kind", () => {
      // the receiver here is "wins[0]" (an *indexed* reference), so the
      // list-of-lists shortcut doesn't apply and the element kind has to be
      // read off the sublist itself
      assertThrows(
        () =>
          parseProgram(
            "Python",
            "wins = [[1,2],[3,4]]\nx = wins[0].index('a')",
          ),
        Error,
        "Type error: 'integer' expected but 'string' found.",
      );
    });
  });

  describe("common/procedureCall.ts: method calls as bare statements", () => {
    it("throws when a list method is called on a non-list variable", () => {
      // the receiver's type check failing is reported as "no such method
      // for this type", not as the raw type error it actually was
      assertThrows(
        () => parseProgram("Python", "x = 1\nx.append(2)"),
        Error,
        'Method ".append" is not defined for type "integer".',
      );
    });
  });
});
