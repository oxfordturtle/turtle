import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { PCode } from "@/core/constants.ts";
import { compileAndEncode, flatten, includesCode } from "./lib/helpers.ts";
import { wrapProgram } from "../parser/lib/programs.ts";
import { runPcode } from "../../machine/lib/helpers.ts";

/**
 * Coverage for `src/core/compiler/encoder/expression.ts` (the dispatcher)
 * and everything under `src/core/compiler/encoder/expressions/*.ts`. The
 * encoder internals aren't part of the public API: the only entry point is
 * `encode()` via `@/core/compiler.ts`, so
 * every test here compiles a real per-language program and inspects the
 * shape of the resulting pcode (`number[][]`), rather than importing the
 * encoder's `expression()`/`statement()` functions or anything under
 * `encoder/expressions/*.ts` directly.
 *
 * A note on one confirmed genuinely-unreachable branch (see the
 * "expression.ts: namedArgument dispatch" describe block below for where
 * this was checked): `expression.ts`'s `"namedArgument"` switch case can
 * never actually run through `encode()`. A `NamedArgument` expression is
 * only ever constructed in one place (`common/arguments.ts`, for Python's
 * `print(sep=... / end=...)` syntax), and the only encoder that ever meets
 * one (`encoder/statements/procedureCall.ts`'s print special case) filters
 * named arguments out of the positional list and calls `expression()` on
 * their inner `.expression` directly, never on the wrapper itself. No other
 * command can produce a `NamedArgument` (Python's `print` is the sole
 * caller of `makeNamedArgument`), and `print` is a procedure
 * (`returns: null`), so it can never appear as a `"function"` expression
 * either (which is the other place `expression()` is invoked on a command's
 * arguments). Marked with deno-coverage-ignore in expression.ts; the case
 * itself must stay, for the switch to be exhaustive over Expression.
 */

describe("encoder/expressions", () => {
  describe("expression.ts: dispatcher switch", () => {
    it('dispatches "integer" to literalIntegerValue', () => {
      const pcode = compileAndEncode("Python", "x = 42");
      assert(includesCode(pcode, PCode.ldin));
      assert(flatten(pcode).includes(42));
    });

    it('dispatches "string" to literalStringValue', () => {
      const pcode = compileAndEncode("Python", 'x = "hi"');
      assert(includesCode(pcode, PCode.lstr));
    });

    it('dispatches "input" to inputValue', () => {
      const pcode = compileAndEncode("Python", "x = \\key");
      // inputValue is just [ldin, input.value] -- confirm it's actually
      // reachable and produces a ldin somewhere distinct from other code
      assert(includesCode(pcode, PCode.ldin));
    });

    it('dispatches "query" to queryValue', () => {
      const pcode = compileAndEncode("Python", "x = ?key");
      assert(includesCode(pcode, PCode.stat));
    });

    it('dispatches "colour" to colourValue', () => {
      const pcode = compileAndEncode("Python", "x = green");
      assert(includesCode(pcode, PCode.ldin));
    });

    it('dispatches "constant" to constantValue', () => {
      const pcode = compileAndEncode(
        "BASIC",
        "CONST size% = 5\nx% = size%\nEND",
      );
      assert(includesCode(pcode, PCode.ldin));
      assert(flatten(pcode).includes(5));
    });

    it('dispatches "address" to variableAddress', () => {
      const pcode = compileAndEncode(
        "C",
        "int x = 1;\nvoid main () {\nint* p = &x;\n}",
      );
      assert(includesCode(pcode, PCode.ldag));
    });

    it('dispatches "function" to functionValue', () => {
      const pcode = compileAndEncode("Python", "x = abs(-5)");
      assert(includesCode(pcode, PCode.abs));
    });

    it('dispatches "compound" to compoundExpression', () => {
      const pcode = compileAndEncode("Python", "x = 2 * 3");
      assert(includesCode(pcode, PCode.mult));
    });

    it('dispatches "cast" to castExpression', () => {
      const pcode = compileAndEncode(
        "C",
        "void main () {\nint n = 5;\nstring s;\ns = (string)n;\n}",
      );
      assert(includesCode(pcode, PCode.itos));
    });

    describe("namedArgument dispatch (confirmed unreachable)", () => {
      it("Python print(end=...) does not route its named argument through expression() at all", () => {
        // if this ever changes (e.g. a new command starts taking named
        // arguments, or print's own encoding stops special-casing them),
        // expression.ts's "namedArgument" case would become reachable and
        // should get its own real test; for now this just documents,
        // via a real compile, that print(..., end="") compiles fine even
        // though nothing ever calls expression() on the named argument.
        const pcode = compileAndEncode("Python", 'print("hi", end="")');
        assert(includesCode(pcode, PCode.writ));
        // no trailing newl, because the named "end" argument suppressed it
        assertFalse(includesCode(pcode, PCode.newl));
      });
    });
  });

  describe("expression.ts: reference parameters and referenceVariableAddressIsValue", () => {
    it("passes a plain (non-array, non-string) variable to a reference parameter via variableAddress", () => {
      // "address" is a native function whose sole parameter is a reference
      // parameter (see src/core/constants/commands.ts) and whose argument
      // type-check is skipped entirely (common/arguments.ts's
      // typeCheckArgument special-cases "address"), so it's usable with any
      // variable to reach expression.ts's `reference && !referenceVariableAddressIsValue`
      // branch for real
      const pcode = compileAndEncode("Python", "x = 1\ny = address(x)");
      assert(includesCode(pcode, PCode.ldag));
    });

    it("passes an unindexed array variable to a reference parameter via variableValue (array not fully indexed)", () => {
      const pcode = compileAndEncode(
        "C",
        "int arr[3];\nvoid main () {\nint y = address(arr);\n}",
      );
      // routed through variableValue (ldvg for the whole array), not variableAddress
      assert(includesCode(pcode, PCode.ldvg));
    });

    it("passes an unindexed string variable to a reference parameter via variableValue (string, zero indexes)", () => {
      const pcode = compileAndEncode(
        "C",
        'void main () {\nstring s;\ns = "hi";\nint y = address(s);\n}',
      );
      assert(includesCode(pcode, PCode.ldvv));
    });

    it("passes a fully-indexed array element to a reference parameter via variableAddress", () => {
      const pcode = compileAndEncode(
        "C",
        "int arr[3];\nvoid main () {\nint y = address(arr[0]);\n}",
      );
      assert(includesCode(pcode, PCode.ldag));
    });
  });

  describe("castExpression.ts", () => {
    it("casts character to string (ctos)", () => {
      const pcode = compileAndEncode(
        "C",
        "void main () {\nchar c = 'a';\nstring s;\ns = (string)c;\n}",
      );
      assert(includesCode(pcode, PCode.ctos));
      assertFalse(includesCode(pcode, PCode.itos));
    });

    it("casts integer to string (itos)", () => {
      const pcode = compileAndEncode(
        "C",
        "void main () {\nint n = 5;\nstring s;\ns = (string)n;\n}",
      );
      assert(includesCode(pcode, PCode.itos));
      assertFalse(includesCode(pcode, PCode.ctos));
    });

    it("casts string to integer (ldin 0, sval)", () => {
      const pcode = compileAndEncode(
        "C",
        'void main () {\nstring s;\ns = "hi";\nint n;\nn = (int)s;\n}',
      );
      assert(includesCode(pcode, PCode.sval));
      const flat = flatten(pcode);
      const svalIndex = flat.indexOf(PCode.sval);
      // the ldin immediately preceding sval loads the literal 0
      assertEquals(flat[svalIndex - 2], PCode.ldin);
      assertEquals(flat[svalIndex - 1], 0);
    });

    it("leaves a cast with no matching combination alone (integer <-> character needs no pcode cast)", () => {
      const pcode = compileAndEncode(
        "C",
        "void main () {\nchar c = 'a';\nint x;\nx = (int)c;\n}",
      );
      assertFalse(includesCode(pcode, PCode.ctos));
      assertFalse(includesCode(pcode, PCode.itos));
      assertFalse(includesCode(pcode, PCode.sval));
    });

    it("casts a string-kind list to a string (Python print) via lprt, with a string lp operand", () => {
      const pcode = compileAndEncode("Python", 'print(["a"])');
      // lihp 1 (capacity = the one element), dupl, lstr "a", lapp 5, hfix,
      // then the implicit list->string cast: lprt with lp operand 5 (= a
      // 1-dimensional list of strings)
      assertEquals(pcode[2], [
        PCode.lihp,
        1,
        PCode.dupl,
        PCode.lstr,
        1,
        "a".charCodeAt(0),
        PCode.lapp,
        5,
        PCode.hfix,
        PCode.lprt,
        5,
        PCode.writ,
        PCode.newl,
      ]);
      assertEquals(runPcode(pcode).output.outputText, "['a']\n");
    });

    it("casts a kind-less empty list literal to a string with lprt's lp operand defaulting to integer", () => {
      // an empty list literal ("[]") is the only list-valued expression
      // whose element kind is genuinely unknown - it never gets pinned,
      // because there's no element to pin it from (see
      // parser/common/factor.ts, which only computes a listElementKind when
      // elements.length > 0). castExpression.ts's `?? "integer"` fallback
      // exists exactly for this case; without the operand byte the pcode
      // stream would desync from here on, and without the default it
      // couldn't be emitted at all
      const pcode = compileAndEncode("Python", "print([])");
      assertEquals(pcode[2], [
        PCode.lihp,
        8,
        PCode.hfix,
        PCode.lprt,
        4,
        PCode.writ,
        PCode.newl,
      ]);
      // and it really does run, printing Python's own empty-list repr
      assertEquals(runPcode(pcode).output.outputText, "[]\n");
    });
  });

  describe("colourValue.ts / inputValue.ts / queryValue.ts / literalStringValue.ts", () => {
    it("encodes a predefined colour name as ldin <value>", () => {
      const pcode = compileAndEncode("Python", "x = darkgray");
      // 0x404040 is "darkgrey"'s defined value (American spelling normalised)
      assert(flatten(pcode).includes(0x404040));
    });

    it("encodes an input code as ldin <value>", () => {
      const pcode = compileAndEncode("Python", "x = \\key");
      assert(includesCode(pcode, PCode.ldin));
    });

    it("encodes a query code as ldin <value>, stat", () => {
      const pcode = compileAndEncode("Python", "x = ?key");
      const flat = flatten(pcode);
      const statIndex = flat.indexOf(PCode.stat);
      assert(statIndex > 0);
      assertEquals(flat[statIndex - 2], PCode.ldin);
    });

    it("encodes a plain string literal as lstr <length> <charcodes...>", () => {
      const pcode = compileAndEncode("Python", 'x = "hi"');
      const flat = flatten(pcode);
      const lstrIndex = flat.indexOf(PCode.lstr);
      assert(lstrIndex >= 0);
      assertEquals(flat[lstrIndex + 1], 2);
      assertEquals(flat[lstrIndex + 2], "h".charCodeAt(0));
      assertEquals(flat[lstrIndex + 3], "i".charCodeAt(0));
    });
  });

  describe("constantValue.ts", () => {
    it("encodes an integer constant as ldin <value>", () => {
      const pcode = compileAndEncode(
        "BASIC",
        "CONST size% = 5\nx% = size%\nEND",
      );
      assert(flatten(pcode).includes(5));
    });

    it("encodes a boolean constant as ldin <value>", () => {
      const pcode = compileAndEncode(
        "BASIC",
        "CONST flag% = TRUE\nx% = flag%\nEND",
      );
      assert(flatten(pcode).includes(-1));
    });

    it("encodes an unindexed string constant as just lstr (no index math)", () => {
      const pcode = compileAndEncode(
        "BASIC",
        'CONST size$ = "hello"\nx$ = size$\nEND',
      );
      assert(includesCode(pcode, PCode.lstr));
      assertFalse(includesCode(pcode, PCode.lptr));
    });

    it("encodes an indexed string constant with index math (non-Pascal, no decr)", () => {
      const pcode = compileAndEncode(
        "BASIC",
        'CONST size$ = "hello"\nx$ = size$(0)\nEND',
      );
      assert(includesCode(pcode, PCode.lstr));
      assert(includesCode(pcode, PCode.swap));
      assert(includesCode(pcode, PCode.lptr));
    });

    it("encodes an indexed string constant with the Pascal 1-indexing decr", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nconst size = 'hello';\nvar c: char;\nbegin\nc := size[1];\nend.",
      );
      assert(includesCode(pcode, PCode.lstr));
      assert(includesCode(pcode, PCode.decr));
      assert(includesCode(pcode, PCode.lptr));
    });
  });

  describe("functionValue.ts", () => {
    it("encodes a call to a native command function (not a subroutine)", () => {
      const pcode = compileAndEncode("Python", "x = abs(-5)");
      assert(includesCode(pcode, PCode.abs));
      // no subr placeholder, since this isn't a custom subroutine call
      assertFalse(includesCode(pcode, PCode.subr));
    });

    it("encodes a call to a custom (integer-returning) subroutine function", () => {
      // N.B. Pascal requires "var" declarations above any subroutine
      // definitions (see pascal/parser.ts), so the global "x" must come first
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar x: integer;\nfunction double(n: integer): integer;\nbegin\nresult := n * 2;\nend;\nbegin\nx := double(3);\nend.",
      );
      assert(includesCode(pcode, PCode.subr));
      assert(includesCode(pcode, PCode.ldvv));
      assertFalse(includesCode(pcode, PCode.hstr));
    });

    it("encodes a call to a custom string-returning subroutine function (hstr)", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar s: string;\nfunction greet: string;\nbegin\nresult := 'hi';\nend;\nbegin\ns := greet;\nend.",
      );
      assert(includesCode(pcode, PCode.subr));
      assert(includesCode(pcode, PCode.hstr));
    });
  });

  describe("variableAddress.ts / variableValue.ts: shared branch structure", () => {
    it("array element, single dimension, zero start index (no subtraction)", () => {
      const pcode = compileAndEncode(
        "C",
        "int arr[3];\nvoid main () {\nint y = arr[0];\n}",
      );
      // zero start index: no "ldin <start>, subt" pair should appear before swap/test/plus/incr
      assert(includesCode(pcode, PCode.swap));
      assert(includesCode(pcode, PCode.incr));
    });

    it("array element with a non-zero start index requires an explicit subtraction", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar arr: array[1..3] of integer;\nvar y: integer;\nbegin\ny := arr[1];\nend.",
      );
      // N.B. deliberately not searching the *whole* flattened program: the
      // fixed two-line startup preamble (heap init + turtle/canvas defaults,
      // present verbatim at the start of every compiled program) ends with
      // a "stmt" line-count marker whose preceding opcode is itself computed
      // arithmetically and can coincidentally be PCode.subt depending on the
      // exact line count -- confirmed by direct experiment, not assumed.
      // Restricting to the real statement body (after that preamble) avoids
      // that false match and isolates the actual index-adjustment code.
      const body = flatten(pcode.slice(2));
      const subtIndex = body.indexOf(PCode.subt);
      assert(subtIndex > 0);
      assertEquals(body[subtIndex - 2], PCode.ldin);
      assertEquals(body[subtIndex - 1], 1); // the array's declared start index
    });

    it("array of strings: extra index selects a character, with Pascal's decr for 1-based strings", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar arr: array[1..3] of string;\nvar c: char;\nbegin\nc := arr[1,1];\nend.",
      );
      assert(includesCode(pcode, PCode.decr));
      assert(includesCode(pcode, PCode.lptr));
    });

    it("array of strings: address-of the same construct routes through variableAddress instead", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar arr: array[1..3] of string;\nvar y: integer;\nbegin\ny := address(arr[1,1]);\nend.",
      );
      assert(includesCode(pcode, PCode.decr));
      assert(includesCode(pcode, PCode.ldag));
    });

    it("character from a string variable (C, no decr, no ctos: C has a character type)", () => {
      const pcode = compileAndEncode(
        "C",
        'string s;\nvoid main () {\ns = "hi";\nchar c;\nc = s[0];\n}',
      );
      assert(includesCode(pcode, PCode.test));
      assertFalse(includesCode(pcode, PCode.ctos));
    });

    it("character from a string variable (Python: adds ctos, since Python has no character type)", () => {
      const pcode = compileAndEncode("Python", 's = "hi"\nc = s[0]');
      assert(includesCode(pcode, PCode.ctos));
    });

    it("character from a string variable (Pascal: adds decr for 1-based string indexing)", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar s: string;\nvar c: char;\nbegin\ns := 'hi';\nc := s[1];\nend.",
      );
      assert(includesCode(pcode, PCode.decr));
    });

    it("address-of a character within a string variable (variableAddress's own branch, Pascal decr)", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nvar s: string;\nvar y: integer;\nbegin\ns := 'hi';\ny := address(s[1]);\nend.",
      );
      assert(includesCode(pcode, PCode.decr));
      assert(includesCode(pcode, PCode.ldag));
    });

    it("predefined turtle property, read as a value", () => {
      const pcode = compileAndEncode("Python", "x = turtx");
      assert(includesCode(pcode, PCode.ldvg));
    });

    it("predefined turtle property, address-of", () => {
      const pcode = compileAndEncode("Python", "y = address(turtx)");
      assert(includesCode(pcode, PCode.ldag));
    });

    it("global variable, read as a value and address-of", () => {
      const valuePcode = compileAndEncode("Python", "x = 1\ny = x");
      assert(includesCode(valuePcode, PCode.ldvg));

      const addressPcode = compileAndEncode("Python", "x = 1\ny = address(x)");
      assert(includesCode(addressPcode, PCode.ldag));
    });

    it("local (non-reference, non-array, non-string) variable, read as a value and address-of", () => {
      const code = wrapProgram(
        "C",
        "int y = 1;\nint z = y;\nint w = address(y);",
        "",
      );
      const pcode = compileAndEncode("C", code);
      assert(includesCode(pcode, PCode.ldvv));
      assert(includesCode(pcode, PCode.ldav));
    });

    it("local reference-parameter variable (not array/string) reads via ldvr", () => {
      const pcode = compileAndEncode(
        "Pascal",
        "program Test;\nprocedure inc1(var n: integer);\nbegin\nn := n + 1;\nend;\nbegin\nend.",
      );
      assert(includesCode(pcode, PCode.ldvr));
    });

    it("pointer variable read: appends a trailing lptr peek", () => {
      const pcode = compileAndEncode(
        "C",
        "int x = 1;\nvoid main () {\nint* p = &x;\nint y = p;\n}",
      );
      assert(includesCode(pcode, PCode.ldvv));
      assert(includesCode(pcode, PCode.lptr));
    });
  });

  describe("listLiteral.ts", () => {
    it("an empty literal allocates DEFAULT_LIST_CAPACITY cells and appends nothing", () => {
      // a hint-less "x=[]" can't be compiled on its own (parse() rejects it
      // with "Could not infer the type"), so the hint is what makes an
      // element-less literal reachable at all here
      const pcode = compileAndEncode("Python", "x: List[int] = []");
      // lihp 8 (the default capacity, since there are no elements to size
      // the block from), hfix, stvg - no lapp at all
      assertEquals(pcode[2], [PCode.lihp, 8, PCode.hfix, PCode.stvg, 19]);
      assertFalse(includesCode(pcode, PCode.lapp));
    });

    it("a literal of scalar string variables clones each element with hstr before appending it", () => {
      const pcode = compileAndEncode("Python", 'a = "p"\nb = "q"\nx = [a, b]');
      // lihp 2 (capacity = element count), then per element: dupl, ldvg
      // <address>, hstr (the clone), lapp 5 - then one trailing hfix for
      // the whole literal
      assertEquals(pcode[6], [
        PCode.lihp,
        2,
        PCode.dupl,
        PCode.ldvg,
        19,
        PCode.hstr,
        PCode.lapp,
        5,
        PCode.dupl,
        PCode.ldvg,
        86,
        PCode.hstr,
        PCode.lapp,
        5,
        PCode.hfix,
        PCode.stvg,
        153,
      ]);
    });

    // Genuinely unreachable, marked with deno-coverage-ignore in
    // listLiteral.ts: its `exp.listElementKind ?? "integer"` fallback sits
    // *inside* its `elements.length > 0` guard, and parser/common/factor.ts
    // always computes a definite listElementKind ("integer" or "string")
    // whenever a literal has at least one element - the kind is only ever
    // left undefined for an element-less "[]", which never reaches that line.
  });

  describe("compoundExpression.ts", () => {
    it("unary operator: left is null (neg)", () => {
      const pcode = compileAndEncode("Python", "x = -5");
      assert(includesCode(pcode, PCode.neg));
    });

    it('"+1" is special-cased to incr instead of plus', () => {
      const pcode = compileAndEncode("Python", "y = 1\nx = y + 1");
      // exact assertion on the real observed pcode for the "x = y + 1" line:
      // ldvg <y's address>, incr, stvg <x's address> -- no separate
      // "ldin 1, plus" pair at all, confirming the special case fired
      assertEquals(pcode[3], [PCode.ldvg, 19, PCode.incr, PCode.stvg, 20]);
    });

    it('"-1" is special-cased to decr instead of subt', () => {
      const pcode = compileAndEncode("Python", "y = 1\nx = y - 1");
      assertEquals(pcode[3], [PCode.ldvg, 19, PCode.decr, PCode.stvg, 20]);
    });

    it("a right operand of literal 1 with a non-plus/subt operator falls through to the general case", () => {
      const pcode = compileAndEncode("Python", "y = 1\nx = (y == 1)");
      // ldvg <y>, ldin 1, eqal, stvg <x> -- the literal 1 is pushed via a
      // plain "ldin 1" (not absorbed into incr/decr), because the outer
      // "left && right === 1" check's inner ifs only special-case "plus"
      // and "subt", and "eqal" is neither
      assertEquals(pcode[3], [
        PCode.ldvg,
        19,
        PCode.ldin,
        1,
        PCode.eqal,
        PCode.stvg,
        20,
      ]);
    });

    it('"not" uses PCode.not directly outside C/Python/TypeScript', () => {
      const pcode = compileAndEncode("BASIC", "x% = NOT TRUE\nEND");
      assert(includesCode(pcode, PCode.not));
    });

    it('"not" is rewritten as "ldin 0, eqal" for C/Python/TypeScript', () => {
      const pcode = compileAndEncode("Python", "x = 1\ny = not x");
      assertFalse(includesCode(pcode, PCode.not));
      const flat = flatten(pcode);
      const eqalIndex = flat.indexOf(PCode.eqal);
      assert(eqalIndex > 0);
      assertEquals(flat[eqalIndex - 2], PCode.ldin);
      assertEquals(flat[eqalIndex - 1], 0);
    });

    it('"lmul" (Python list multiplication) carries an lp operand and a trailing hfix', () => {
      const pcode = compileAndEncode("Python", 'x = ["a"] * 3');
      // lihp 1, dupl, lstr "a", lapp 5, hfix (the "["a"]" literal), then
      // ldin 3, lmul 5 (lp = 1-dimensional list of strings), hfix, stvg
      assertEquals(pcode[2], [
        PCode.lihp,
        1,
        PCode.dupl,
        PCode.lstr,
        1,
        "a".charCodeAt(0),
        PCode.lapp,
        5,
        PCode.hfix,
        PCode.ldin,
        3,
        PCode.lmul,
        5,
        PCode.hfix,
        PCode.stvg,
        19,
      ]);
    });

    it('"lmul" on a kind-less empty list literal defaults its lp operand to integer', () => {
      // "[] * n" is the only way to reach lmul with an unknown element kind
      // (see the castExpression tests above for why an empty literal is the
      // only list expression whose kind is never pinned) - the operand byte
      // has to be emitted regardless, since LMUL always consumes one
      const pcode = compileAndEncode("Python", "x = [] * 3");
      assertEquals(pcode[2], [
        PCode.lihp,
        8,
        PCode.hfix,
        PCode.ldin,
        3,
        PCode.lmul,
        4,
        PCode.hfix,
        PCode.stvg,
        19,
      ]);
    });

    it('the lp operand emitted for "[] * n" keeps the pcode stream in sync for what follows', () => {
      // the real point of the operand byte: LMUL reads it inline, so if it
      // were ever omitted the machine would consume the *next* opcode as
      // its operand and everything after would be misread - this asserts
      // the following statement still executes correctly by running it
      const pcode = compileAndEncode("Python", 'x = [] * 3\nprint("ok")');
      assertEquals(runPcode(pcode).output.outputText, "ok\n");
    });

    it("a representative spread of generic operators looked up via PCode[op]", () => {
      const cases: [string, PCode][] = [
        ["x = 2 * 3", PCode.mult],
        ["x = 7 / 2", PCode.divr],
        ["x = 7 % 2", PCode.mod],
      ];
      for (const [code, pc] of cases) {
        const pcode = compileAndEncode("Python", code);
        assert(includesCode(pcode, pc), `expected ${PCode[pc]} in: ${code}`);
      }
    });
  });
});
