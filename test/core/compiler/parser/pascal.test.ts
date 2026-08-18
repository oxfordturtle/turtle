import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertExists, assertThrows } from "@std/assert";
import type {
  ForStatement,
  IfStatement,
  ProcedureCall,
  RepeatStatement,
  VariableAssignment,
  WhileStatement,
} from "@/core/compiler.ts";
import { parseProgram } from "./_programs.ts";

/**
 * Pascal-specific parser tests: syntax that's too divergent for the shared
 * cross-language table in common.test.ts ("program ... begin ... end."
 * structure, REPEAT...UNTIL, CONST/VAR ordering rules, "result"-variable
 * function returns, case-insensitive lowercased identifiers) plus error
 * paths for every major statement kind, covering everything under
 * src/core/compiler/parser/pascal/.
 */

describe("parse: Pascal", () => {
  describe("program structure", () => {
    it("throws if the program does not begin with PROGRAM", () => {
      assertThrows(
        () => parseProgram("Pascal", "begin\nend."),
        Error,
        'Program must begin with keyword "PROGRAM"',
      );
    });

    it("throws if PROGRAM is not followed by anything", () => {
      assertThrows(
        () => parseProgram("Pascal", "program"),
        Error,
        "must be followed by an identifier",
      );
    });

    it("throws if PROGRAM is followed by a non-identifier", () => {
      assertThrows(
        () => parseProgram("Pascal", "program ;\nbegin\nend."),
        Error,
        "is not a valid identifier",
      );
    });

    it("throws if the program name is a predefined Turtle property", () => {
      assertThrows(
        () => parseProgram("Pascal", "program turtx;\nbegin\nend."),
        Error,
        "already the name of a predefined Turtle property",
      );
    });

    it("throws if there is no semicolon after the program declaration", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test\nbegin\nend."),
        Error,
        "Semicolon needed after program declaration",
      );
    });

    it("parses program name and language case-insensitively (lowercased)", () => {
      const program = parseProgram("Pascal", "PROGRAM Test;\nBEGIN\nEND.");
      assertEquals(program.name, "test");
      assertEquals(program.language, "Pascal");
    });

    it("throws if BEGIN is missing (statement found instead)", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nx := 1;\nend."),
        Error,
        'Keyword "begin" missing for main program',
      );
    });

    it("throws if BEGIN is missing (unrecognised keyword found instead)", () => {
      // "until" is a keyword, but not one of const/var/procedure/function/begin,
      // so it goes through the keyword-specific "begin missing" branch
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nuntil true;\nend."),
        Error,
        'Keyword "begin" missing for main program',
      );
    });

    it("throws if BEGIN is missing (lexemes run out entirely first)", () => {
      // distinct from the two cases above: here the token stream runs out
      // while still only inside var declarations, so the *final* "begun"
      // check after the main loop is what fires, not either inline check
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nvar x: integer;"),
        Error,
        'Keyword "begin" missing for main program',
      );
    });

    // Note: the "{lex} makes no sense here." throws that sit under each
    // "if (!begun)" check in parser.ts (and, identically, in subroutine.ts)
    // are dead code. Reaching either would need the declaration loop to come
    // round again with begun === true, but the only way out of the "begin"
    // arm's statement loop is either end-of-lexemes or the lexeme "end" --
    // and both of those also end the enclosing declaration loop. So once
    // "begin" has been seen, the declaration loop body never runs again, and
    // the two error branches guarded by "begun" can only ever produce the
    // 'Keyword "begin" missing' message (exercised by the tests above).

    it("throws if END is missing after the main program", () => {
      // also exercises eosCheck's "no more lexemes" branch (skips silently)
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar x: integer;\nbegin\nx := 1",
          ),
        Error,
        'Keyword "end" missing after main program',
      );
    });

    it("throws if the full stop is missing after the final END", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nbegin\nend"),
        Error,
        'Full stop missing after program "end"',
      );
    });

    it("throws if anything follows the final full stop", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nbegin\nend.\ny := 1;"),
        Error,
        'No text can appear after program "end"',
      );
    });

    it("parses an empty program body", () => {
      const program = parseProgram("Pascal", "program Test;\nbegin\nend.");
      assertEquals(program.statements.length, 0);
    });

    it("skips a comment in the top-level declaration section, before VAR/CONST/a subroutine/BEGIN", () => {
      // regression test: distinct from the two "declaration ordering"
      // regression tests below - this one exercises pascal/parser.ts's own
      // top-level loop skipping a comment directly (variable.ts's fix
      // only helps once already inside a VAR block, so a comment that
      // shows up *before* the VAR section even starts reaches this loop's
      // switch on lexeme.type unaided).
      const program = parseProgram(
        "Pascal",
        "program Test;\n{ intro comment }\nvar x: integer;\nbegin\nend.",
      );
      assertEquals(
        program.variables.map((v) => v.name),
        ["x"],
      );
    });

    it("ignores a Pascal-style comment as a pass statement", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nbegin\n{ a comment }\nend.",
      );
      assertEquals(program.statements.length, 1);
      assertEquals(program.statements[0].statementType, "passStatement");
    });

    it("doesn't require a semicolon between a comment and the statement that follows it", () => {
      // regression test: parseStatement used to run eosCheck() even for a
      // comment "statement", wrongly demanding a semicolon before whatever
      // lexeme followed the comment (fine when that happened to be "end",
      // as in the test above, since eosCheck exempts it - not fine otherwise).
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar x: integer;\nbegin\n{ a comment }\nx := 1;\nend.",
      );
      assertEquals(
        program.statements.map((s) => s.statementType),
        ["passStatement", "variableAssignment"],
      );
    });
  });

  describe("declaration ordering", () => {
    it("throws if CONST is not followed by an identifier", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nconst\nbegin\nend."),
        Error,
        '"CONST" must be followed by an identifier',
      );
    });

    it("throws if a constant is declared after a variable", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar x: integer;\nconst size = 5;\nbegin\nend.",
          ),
        Error,
        "Constant definitions must be placed above any variable declarations",
      );
    });

    it("throws if a constant is declared after a subroutine", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nprocedure go;\nbegin\nend;\nconst size = 5;\nbegin\nend.",
          ),
        Error,
        "Constant definitions must be placed above any subroutine definitions",
      );
    });

    it("throws if a variable is declared after a subroutine", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nprocedure go;\nbegin\nend;\nvar x: integer;\nbegin\nend.",
          ),
        Error,
        "Variable declarations must be placed above any subroutine definitions",
      );
    });

    it("throws when a variable is redeclared in a later var block", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar x: integer;\nvar x: integer;\nbegin\nend.",
          ),
        Error,
        "is already defined in the current scope",
      );
    });

    it("parses multiple comma-separated names in one var line", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar x, y: integer;\nbegin\nend.",
      );
      assertEquals(program.variables.length, 2);
      assertEquals(program.variables[0].type, "integer");
      assertEquals(program.variables[1].type, "integer");
    });

    it("parses several declaration lines stacked under a single VAR keyword", () => {
      // classic Pascal style: one "var" followed by several ";"-terminated
      // groups, each potentially with its own type - variables() recurses
      // when it finds another identifier immediately following a ";"
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar\nx: integer;\ny: string;\nbegin\nend.",
      );
      assertEquals(
        program.variables.map((v) => v.name),
        ["x", "y"],
      );
      assertEquals(
        program.variables.map((v) => v.type),
        ["integer", "string"],
      );
    });

    it("skips a comment separating one variable declaration from the next under one VAR keyword", () => {
      // regression test: the top-level declaration-section loop (before
      // "begin") only understood "keyword"-type lexemes, so a comment
      // lexeme left dangling where variables() stopped (right after a
      // declaration's semicolon) threw "begin missing" instead of being skipped.
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar\nx: integer; { first }\ny: string; { second }\nbegin\nend.",
      );
      assertEquals(
        program.variables.map((v) => v.name),
        ["x", "y"],
      );
    });

    it("throws when a comma is missing between variable names", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar x y: integer;\nbegin\nend.",
          ),
        Error,
        "Comma missing between variable names",
      );
    });

    it("throws on an unrecognised keyword at program level (once begun)", () => {
      // to reach the "makes no sense here" branch we need to be inside the
      // main program's own body-scanning loop after "begin" - but that loop
      // only runs until it hits the top-level "end", so it never sees a
      // stray keyword; the only way to reach the *keyword* variant of this
      // branch pre-"begin" is via a keyword this switch doesn't recognise
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nrepeat\nbegin\nend."),
        Error,
        'Keyword "begin" missing for main program',
      );
    });
  });

  describe("CONST declarations", () => {
    it("parses a constant and evaluates its value", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nconst size = 5;\nbegin\nend.",
      );
      assertEquals(program.constants.length, 1);
      assertEquals(program.constants[0].name, "size");
      assertEquals(program.constants[0].value, 5);
    });

    it("throws if a constant name is reused", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nconst size = 5;\nconst size = 6;\nbegin\nend.",
          ),
        Error,
        "is already defined in the current scope",
      );
    });

    it("throws if the constant is not assigned a value", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nconst size;\nbegin\nend."),
        Error,
        "Constant must be assigned a value",
      );
    });

    it("throws if the constant definition has no semicolon", () => {
      assertThrows(
        () =>
          parseProgram("Pascal", "program Test;\nconst size = 5\nbegin\nend."),
        Error,
        "Semicolon needed after constant definition",
      );
    });

    it("throws if a constant value refers to a (turtle) variable", () => {
      // find.variable() always resolves the built-in turtle properties, even
      // though no ordinary variable is in scope yet at CONST-parsing time
      // (const must precede var) - this is the only way to get a "variable"
      // expression into evaluate() from a Pascal const definition
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nconst size = turtx;\nbegin\nend.",
          ),
        Error,
        "Constant value cannot refer to any variables",
      );
    });

    it("throws if a constant value invokes a function", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nconst size = abs(-5);\nbegin\nend.",
          ),
        Error,
        "Constant value cannot invoke any functions",
      );
    });

    it("skips a comment between the CONST keyword and the first constant definition", () => {
      // the CONST arm scoops up definitions with "while lexemes.get()?.type
      // === 'identifier'", so a comment sitting directly under the keyword
      // (e.g. a heading for the block) would otherwise end the block
      // immediately and trigger '"CONST" must be followed by an identifier.'
      const program = parseProgram(
        "Pascal",
        "program Test;\nconst\n{ sizes }\nwidth = 5;\nheight = 6;\nbegin\nend.",
      );
      assertEquals(
        program.constants.map((c) => c.name),
        ["width", "height"],
      );
      assertEquals(
        program.constants.map((c) => c.value),
        [5, 6],
      );
    });

    it("skips a comment separating one constant definition from the next", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nconst\nwidth = 5; { across }\nheight = 6; { down }\nbegin\nend.",
      );
      assertEquals(
        program.constants.map((c) => c.name),
        ["width", "height"],
      );
      assertEquals(
        program.constants.map((c) => c.value),
        [5, 6],
      );
    });
  });

  describe("variable types", () => {
    it("parses a boolean/char/string variable", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar a: boolean;\nvar b: char;\nvar c: string;\nbegin\nend.",
      );
      assertEquals(
        program.variables.map((v) => v.type),
        ["boolean", "character", "string"],
      );
    });

    it("defaults a string's length to 64 when unspecified", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar s: string;\nbegin\nend.",
      );
      assertEquals(program.variables[0].stringLength, 64);
    });

    it("parses an explicit string length", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar s: string[10];\nbegin\nend.",
      );
      assertEquals(program.variables[0].stringLength, 10);
    });

    it("throws if the string length specification has no closing bracket (EOF)", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nvar s: string[10"),
        Error,
        'Closing bracket "]" missing after string size specification',
      );
    });

    it("throws if the string length specification has no closing bracket (wrong token)", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar s: string[10 x;\nbegin\nend.",
          ),
        Error,
        'Closing bracket "]" missing after string size specification',
      );
    });

    it("parses a one-dimensional array declaration", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar arr: array[1..3] of integer;\nbegin\nend.",
      );
      assertEquals(program.variables[0].arrayDimensions, [[1, 3]]);
    });

    it("parses a multi-dimensional array declaration", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar arr: array[1..3,1..2] of integer;\nbegin\nend.",
      );
      assertEquals(program.variables[0].arrayDimensions, [
        [1, 3],
        [1, 2],
      ]);
    });

    it("throws if array is not followed by any dimensions (EOF)", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nvar arr: array"),
        Error,
        'Keyword "array" must be followed by array dimensions',
      );
    });

    it("throws if array is not followed by an opening bracket (wrong token)", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar arr: array integer;\nbegin\nend.",
          ),
        Error,
        'Keyword "array" must be followed by array dimensions',
      );
    });

    it("throws if a comma is missing between array dimensions", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar arr: array[1..3 4..6] of integer;\nbegin\nend.",
          ),
        Error,
        "Comma missing between array dimensions",
      );
    });

    it("throws if the array start index is not followed by '..'", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar arr: array[1] of integer;\nbegin\nend.",
          ),
        Error,
        'Array start index must be followed by ".."',
      );
    });

    it("throws if the closing bracket is missing after array dimensions (EOF)", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nvar arr: array[1..3,"),
        Error,
        'Closing bracket "]" missing after array dimensions',
      );
    });

    it("throws if 'of' is missing after array dimensions", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar arr: array[1..3] integer;\nbegin\nend.",
          ),
        Error,
        '"array[...]" must be followed by "of"',
      );
    });

    it("throws if no type specification (':') is given at all", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nvar x"),
        Error,
        "Expected type specification",
      );
    });

    it("throws if a function has no type specification at all (no colon)", () => {
      // type() is called directly after a function's (optional) parameters,
      // with no "loop until colon" pattern first - unlike var/parameter
      // declarations, this is the only path that can reach type()'s
      // "lexemes.get() present but isn't ':'" branch
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nfunction f;\nbegin\nend;\nbegin\nend.",
          ),
        Error,
        "Expected type specification",
      );
    });

    it("throws if no type definition is given after the colon (EOF)", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nvar x: "),
        Error,
        "Expected type definition",
      );
    });

    it("throws if the type given is not a recognised type keyword", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nvar x: 5;\nbegin\nend."),
        Error,
        "is not a valid type definition",
      );
    });
  });

  describe("REPEAT...UNTIL loop", () => {
    it("parses a REPEAT...UNTIL loop", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar x: integer;\nbegin\nx := 0;\nrepeat\nx := x + 1;\nuntil x = 3;\nend.",
      );
      const repeatStatement = program.statements.find(
        (s) => s.statementType === "repeatStatement",
      ) as RepeatStatement | undefined;
      assertExists(repeatStatement);
      assertEquals(repeatStatement.statements.length, 1);
      assertEquals(repeatStatement.condition.expressionType, "compound");
    });

    it("throws if UNTIL is missing (unterminated REPEAT block)", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar x: integer;\nbegin\nrepeat\nx := 1;",
          ),
        Error,
        '"REPEAT" does not have any matching "UNTIL"',
      );
    });

    it("throws if REPEAT is immediately followed by nothing", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nbegin\nrepeat"),
        Error,
        'No commands found after "REPEAT"',
      );
    });

    it('throws if "END" closes a REPEAT block instead of "UNTIL"', () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar x: integer;\nbegin\nrepeat\nx := 1;\nend;\nend.",
          ),
        Error,
        '"END" does not have any matching "BEGIN"',
      );
    });

    it('throws if "UNTIL" closes a BEGIN block instead of "END"', () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar x: integer;\nbegin\nif true then begin\nx := 1;\nuntil true;\nend;\nend.",
          ),
        Error,
        '"UNTIL" does not have any matching "REPEAT"',
      );
    });

    it("throws if UNTIL is not followed by a boolean expression (EOF)", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar x: integer;\nbegin\nrepeat\nx := 1;\nuntil",
          ),
        Error,
        '"UNTIL" must be followed by a boolean expression',
      );
    });

    it("throws if a nested BEGIN block is unterminated", () => {
      // the top-level program body has its own inline "scan to end" loop
      // (parser.ts) that never calls block.ts, so to reach block.ts's own
      // '"BEGIN" does not have any matching "END".' check we need a BEGIN
      // block nested inside another construct (e.g. an IF), which does
      // route through parseBlock
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar x: integer;\nbegin\nif true then begin\nx := 1;",
          ),
        Error,
        '"BEGIN" does not have any matching "END"',
      );
    });

    it("throws if UNTIL's condition is not boolean", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar x: integer;\nbegin\nrepeat\nx := 1;\nuntil x;\nend.",
          ),
        Error,
        "Type error",
      );
    });
  });

  describe("procedure/function definitions", () => {
    it("parses a procedure with a parameter", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nprocedure go(n: integer);\nbegin\nend;\nbegin\nend.",
      );
      assertEquals(program.subroutines.length, 1);
      const sub = program.subroutines[0];
      assertEquals(sub.name, "go");
      assertEquals(sub.variables[0].isParameter, true);
      assertEquals(sub.variables[0].type, "integer");
    });

    it("parses a reference (var) parameter", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nprocedure go(var n: integer);\nbegin\nend;\nbegin\nend.",
      );
      assertEquals(
        program.subroutines[0].variables[0].isReferenceParameter,
        true,
      );
    });

    it("parses several parameters separated by semicolons", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nprocedure go(a: integer; b: string);\nbegin\nend;\nbegin\nend.",
      );
      assertEquals(
        program.subroutines[0].variables.map((v) => v.type),
        ["integer", "string"],
      );
    });

    it("parses several comma-separated parameter names sharing one type", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nprocedure go(a, b: integer);\nbegin\nend;\nbegin\nend.",
      );
      assertEquals(
        program.subroutines[0].variables.map((v) => v.name),
        ["a", "b"],
      );
      assertEquals(
        program.subroutines[0].variables.map((v) => v.type),
        ["integer", "integer"],
      );
    });

    it("parses a local variable declared inside a subroutine body", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nprocedure go;\nvar y: integer;\nbegin\ny := 1;\nend;\nbegin\nend.",
      );
      const sub = program.subroutines[0];
      const local = sub.variables.find((v) => v.name === "y");
      assertExists(local);
      assertEquals(local.type, "integer");
    });

    it("parses a function with a return type and a 'result' variable", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nfunction double(n: integer): integer;\nbegin\nresult := n * 2;\nend;\nbegin\nend.",
      );
      const sub = program.subroutines[0];
      const result = sub.variables.find((v) => v.name === "result");
      assertExists(result);
      assertEquals(result.type, "integer");
    });

    it("throws if a function tries to return an array", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nfunction go: array[1..3] of integer;\nbegin\nend;\nbegin\nend.",
          ),
        Error,
        "Functions cannot return arrays",
      );
    });

    it("throws if no semicolon follows the subroutine declaration", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nprocedure go()\nbegin\nend;\nbegin\nend.",
          ),
        Error,
        "Semicolon needed after procedure definition",
      );
    });

    it("throws if BEGIN is missing for a subroutine (statement found instead)", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nprocedure go;\nx := 1;\nend;\nbegin\nend.",
          ),
        Error,
        'Keyword "begin" missing for procedure go',
      );
    });

    it("throws if END is missing for a subroutine", () => {
      assertThrows(
        () =>
          parseProgram("Pascal", "program Test;\nprocedure go;\nbegin\nhome"),
        Error,
        'Keyword "end" missing for procedure go',
      );
    });

    it("throws if a subroutine body begins with an unrecognised keyword (before BEGIN)", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nprocedure go;\nuntil true;\nend;\nbegin\nend.",
          ),
        Error,
        'Keyword "begin" missing for procedure go',
      );
    });

    it("throws if BEGIN is missing for a subroutine (lexemes run out entirely first)", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nprocedure go;\nvar y: integer;",
          ),
        Error,
        'Keyword "begin" missing for procedure go',
      );
    });

    it("throws if no semicolon follows the subroutine's END", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nprocedure go;\nbegin\nend\nbegin\nend.",
          ),
        Error,
        "Semicolon needed after procedure end",
      );
    });

    it("throws if a comma is missing between parameter names", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nprocedure go(a b: integer);\nbegin\nend;\nbegin\nend.",
          ),
        Error,
        "Comma missing between parameter names",
      );
    });

    it("throws if a semicolon is missing between parameters", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nprocedure go(a: integer b: integer);\nbegin\nend;\nbegin\nend.",
          ),
        Error,
        "Semicolon missing between parameters",
      );
    });

    it("throws on a trailing semicolon in the parameter list", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nprocedure go(a: integer;);\nbegin\nend;\nbegin\nend.",
          ),
        Error,
        "Trailing semicolon at end of parameter list",
      );
    });

    it("throws if the closing bracket is missing after parameters", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nprocedure go(a: integer;"),
        Error,
        "Closing bracket missing after procedure parameters",
      );
    });

    it("supports a self-recursive procedure call within its own body", () => {
      // find.subroutine()'s special-case: a Pascal subroutine can call
      // itself by name before it has been added to its parent's subroutine
      // list (which only happens once the whole definition has been parsed)
      const program = parseProgram(
        "Pascal",
        "program Test;\nprocedure go;\nbegin\ngo;\nend;\nbegin\nend.",
      );
      const sub = program.subroutines[0];
      const call = sub.statements[0] as ProcedureCall;
      assertEquals(call.statementType, "procedureCall");
      assertEquals(call.command, sub);
    });

    it("parses nested subroutine definitions", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nprocedure outer;\nprocedure inner;\nbegin\nend;\nbegin\nend;\nbegin\nend.",
      );
      assertEquals(program.subroutines[0].subroutines.length, 1);
      assertEquals(program.subroutines[0].subroutines[0].name, "inner");
    });

    it("parses an 'array of' parameter type", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nprocedure go(a: array of integer);\nbegin\nend;\nbegin\nend.",
      );
      assertEquals(
        program.subroutines[0].variables[0].arrayDimensions.length,
        1,
      );
    });

    it("parses a nested 'array of array of' parameter type", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nprocedure go(a: array of array of integer);\nbegin\nend;\nbegin\nend.",
      );
      assertEquals(
        program.subroutines[0].variables[0].arrayDimensions.length,
        2,
      );
    });

    it("throws if an array parameter's 'array' is not followed by 'of'", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nprocedure go(a: array integer);\nbegin\nend;\nbegin\nend.",
          ),
        Error,
        'Keyword "array" must be followed by "of"',
      );
    });

    it("throws if there is no type specification for a parameter (EOF)", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nprocedure go(a"),
        Error,
        "Expected type specification",
      );
    });

    it("skips comments in a subroutine's declaration section, before VAR/a nested subroutine/BEGIN", () => {
      // subroutine.ts's declaration loop has its own "comment" arm, mirroring
      // the top-level one in parser.ts (tested under "program structure"):
      // without it a comment documenting a local variable or a nested
      // subroutine would fall through to the default arm and throw
      // 'Keyword "begin" missing for procedure outer.'
      const program = parseProgram(
        "Pascal",
        "program Test;\nprocedure outer;\n{ locals }\nvar y: integer;\n{ helper }\nprocedure inner;\nbegin\nend;\n{ body }\nbegin\ny := 1;\nend;\nbegin\nend.",
      );
      const sub = program.subroutines[0];
      assertEquals(sub.name, "outer");
      assertExists(sub.variables.find((v) => v.name === "y"));
      assertEquals(
        sub.subroutines.map((s) => s.name),
        ["inner"],
      );
      assertEquals(
        sub.statements.map((s) => s.statementType),
        ["variableAssignment"],
      );
    });
  });

  describe("if / then / else", () => {
    it("parses if/then with no else", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar x: integer;\nbegin\nif true then x := 1;\nend.",
      );
      const ifStatement = program.statements.find(
        (s) => s.statementType === "ifStatement",
      ) as IfStatement | undefined;
      assertExists(ifStatement);
      assertEquals(ifStatement.elseStatements.length, 0);
    });

    it("parses a begin/end block for the if and else branches", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar x: integer;\nbegin\nif true then begin\nx := 1;\nx := 2;\nend else begin\nx := 3;\nend;\nend.",
      );
      const ifStatement = program.statements.find(
        (s) => s.statementType === "ifStatement",
      ) as IfStatement | undefined;
      assertExists(ifStatement);
      assertEquals(ifStatement.ifStatements.length, 2);
      assertEquals(ifStatement.elseStatements.length, 1);
    });

    it("doesn't let a comment between THEN and the body swallow the body", () => {
      // regression test: firstSubLexeme used to be fetched without skipping
      // a leading comment, so "then {c} x := 2;" treated the comment itself
      // as the entire (pass-statement) body, leaving "x := 2;" to be parsed
      // as the next statement at the outer (program) level instead of
      // inside the if.
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar x: integer;\nbegin\nif true then { comment }\nx := 2;\nend.",
      );
      assertEquals(program.statements.length, 1);
      const ifStatement = program.statements[0] as IfStatement;
      assertEquals(ifStatement.statementType, "ifStatement");
      assertEquals(ifStatement.ifStatements.length, 1);
      assertEquals(
        ifStatement.ifStatements[0].statementType,
        "variableAssignment",
      );
    });

    it("doesn't let a comment between ELSE and the body swallow the body", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar x: integer;\nbegin\nif true then x := 1 else { comment }\nx := 2;\nend.",
      );
      assertEquals(program.statements.length, 1);
      const ifStatement = program.statements[0] as IfStatement;
      assertEquals(ifStatement.elseStatements.length, 1);
      assertEquals(
        ifStatement.elseStatements[0].statementType,
        "variableAssignment",
      );
    });

    it("throws if IF has no boolean expression (EOF)", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nbegin\nif"),
        Error,
        '"IF" must be followed by a boolean expression',
      );
    });

    it("throws if IF's condition is not boolean", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nbegin\nif 5 then\nend."),
        Error,
        "Type error",
      );
    });

    it("throws if THEN is missing", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar x: integer;\nbegin\nif true x := 1;\nend.",
          ),
        Error,
        '"IF ..." must be followed by "THEN"',
      );
    });

    it("throws if no commands follow THEN", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nbegin\nif true then"),
        Error,
        'No commands found after "IF ... THEN"',
      );
    });

    it("throws if no commands follow ELSE", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar x: integer;\nbegin\nif true then x := 1 else",
          ),
        Error,
        'No commands found after "ELSE"',
      );
    });
  });

  describe("while / do", () => {
    it("parses a while loop", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar x: integer;\nbegin\nx := 0;\nwhile x < 3 do x := x + 1;\nend.",
      );
      const whileStatement = program.statements.find(
        (s) => s.statementType === "whileStatement",
      ) as WhileStatement | undefined;
      assertExists(whileStatement);
      assertEquals(whileStatement.statements.length, 1);
    });

    it("parses a while loop with a begin/end block", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar x: integer;\nbegin\nx := 0;\nwhile x < 3 do begin\nx := x + 1;\nend;\nend.",
      );
      const whileStatement = program.statements.find(
        (s) => s.statementType === "whileStatement",
      ) as WhileStatement | undefined;
      assertExists(whileStatement);
      assertEquals(whileStatement.statements.length, 1);
    });

    it("doesn't let a comment between DO and the body swallow the body", () => {
      // regression test: see the equivalent IF test above for the general
      // bug shape (this is the same bug, in the WHILE loop's fallback).
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar x: integer;\nbegin\nx := 0;\nwhile x < 3 do { comment }\nx := x + 1;\nend.",
      );
      assertEquals(program.statements.length, 2);
      const whileStatement = program.statements[1] as WhileStatement;
      assertEquals(whileStatement.statementType, "whileStatement");
      assertEquals(whileStatement.statements.length, 1);
      assertEquals(
        whileStatement.statements[0].statementType,
        "variableAssignment",
      );
    });

    it("throws if WHILE has no boolean expression (EOF)", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nbegin\nwhile"),
        Error,
        '"WHILE" must be followed by a boolean expression',
      );
    });

    it("throws if DO is missing (EOF right after condition)", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nbegin\nwhile true"),
        Error,
        '"WHILE ..." must be followed by "DO"',
      );
    });

    it("throws if DO is missing (some other token found)", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar x: integer;\nbegin\nwhile true x := 1;\nend.",
          ),
        Error,
        '"WHILE ..." must be followed by "DO"',
      );
    });

    it("throws if no commands follow the WHILE loop initialisation", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nbegin\nwhile true do"),
        Error,
        'No commands found after "WHILE" loop initialisation',
      );
    });
  });

  describe("for / to / downto", () => {
    it("parses a FOR ... TO loop", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar i: integer;\nbegin\nfor i := 1 to 3 do i := i;\nend.",
      );
      const forStatement = program.statements.find(
        (s) => s.statementType === "forStatement",
      ) as ForStatement | undefined;
      assertExists(forStatement);
    });

    it("parses a FOR ... DOWNTO loop", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar i: integer;\nbegin\nfor i := 3 downto 1 do i := i;\nend.",
      );
      const forStatement = program.statements.find(
        (s) => s.statementType === "forStatement",
      ) as ForStatement | undefined;
      assertExists(forStatement);
    });

    it("parses a FOR loop with a begin/end block", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar i: integer;\nbegin\nfor i := 1 to 3 do begin\ni := i;\nend;\nend.",
      );
      const forStatement = program.statements.find(
        (s) => s.statementType === "forStatement",
      ) as ForStatement | undefined;
      assertExists(forStatement);
    });

    it("doesn't let a comment between DO and the body swallow the body", () => {
      // regression test: see the equivalent IF test above for the general
      // bug shape (this is the same bug, in the FOR loop's fallback).
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar i: integer;\nbegin\nfor i := 1 to 3 do { comment }\ni := i;\nend.",
      );
      assertEquals(program.statements.length, 1);
      const forStatement = program.statements[0] as ForStatement;
      assertEquals(forStatement.statementType, "forStatement");
      assertEquals(forStatement.statements.length, 1);
      assertEquals(
        forStatement.statements[0].statementType,
        "variableAssignment",
      );
    });

    it("throws if FOR has no variable at all (EOF)", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nbegin\nfor"),
        Error,
        '"FOR" must be followed by an integer variable',
      );
    });

    it("throws if FOR is followed by a non-identifier", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nbegin\nfor 1"),
        Error,
        '"FOR" must be followed by an integer variable',
      );
    });

    it("throws if FOR uses a turtle attribute as its variable", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nbegin\nfor turtx := 1 to 3 do turtx := turtx;\nend.",
          ),
        Error,
        'Turtle attribute cannot be used as a "FOR" variable',
      );
    });

    it("throws if FOR's variable has not been declared", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nbegin\nfor i := 1 to 3 do i := i;\nend.",
          ),
        Error,
        "has not been declared",
      );
    });

    it("throws if FOR's variable is not an integer", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar s: string;\nbegin\nfor s := 1 to 3 do s := s;\nend.",
          ),
        Error,
        "is not an integer variable",
      );
    });

    it("throws if FOR's variable is an array", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar arr: array[1..3] of integer;\nbegin\nfor arr := 1 to 3 do arr := arr;\nend.",
          ),
        Error,
        "FOR variable cannot be an array or array element",
      );
    });

    it("throws if TO/DOWNTO is missing", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar i: integer;\nbegin\nfor i := 1 do i := i;\nend.",
          ),
        Error,
        '"FOR ... := ..." must be followed by "TO" or "DOWNTO"',
      );
    });

    it("throws if no final value follows TO (EOF)", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar i: integer;\nbegin\nfor i := 1 to",
          ),
        Error,
        "must be followed by an integer",
      );
    });

    it("throws if DO is missing after the FOR loop range", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar i: integer;\nbegin\nfor i := 1 to 3",
          ),
        Error,
        '"FOR" loop range must be followed by "DO"',
      );
    });

    it("throws if no commands follow the FOR loop initialisation", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar i: integer;\nbegin\nfor i := 1 to 3 do",
          ),
        Error,
        'No commands found after "FOR" loop initialisation',
      );
    });
  });

  describe("variable assignment and identifiers", () => {
    it("parses array element assignment with an index", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar arr: array[1..3] of integer;\nbegin\narr[1] := 5;\nend.",
      );
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.indexes.length, 1);
    });

    it("parses a string character assignment", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar s: string;\nbegin\ns[1] := 'a';\nend.",
      );
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.indexes.length, 1);
    });

    it("throws when indexing a non-array, non-string variable", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar x: integer;\nbegin\nx[1] := 5;\nend.",
          ),
        Error,
        "is not a string or array variable",
      );
    });

    it("throws on a trailing comma in array indexes", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar arr: array[1..3,1..3] of integer;\nbegin\narr[1,] := 5;\nend.",
          ),
        Error,
        "Trailing comma at the end of array indexes",
      );
    });

    it("throws if the closing bracket is missing after array indexes (EOF)", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar arr: array[1..3] of integer;\nbegin\narr[1",
          ),
        Error,
        'Closing bracket "]" needed after array indexes',
      );
    });

    it("throws if the closing bracket is missing after a string index", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar s: string;\nbegin\ns[1 := 'a';\nend.",
          ),
        Error,
        'Closing bracket "]" missing after string variable index',
      );
    });

    it("allows one extra index into a string-array element (for the character)", () => {
      // when the array's element type is "string", one extra index beyond
      // the array's own dimensions is allowed, for indexing a character
      // within the selected string element
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar arr: array[1..3] of string;\nbegin\narr[1] := 'a';\nend.",
      );
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.indexes.length, 1);
    });

    it("throws when too many indexes are given for an array variable", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar arr: array[1..3] of integer;\nbegin\narr[1,2] := 5;\nend.",
          ),
        Error,
        "Too many indexes for array variable",
      );
    });

    it("throws if the assignment operator is missing", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar x: integer;\nbegin\nx 5;\nend.",
          ),
        Error,
        'Variable must be followed by assignment operator ":="',
      );
    });

    it("throws if no value follows the assignment operator (EOF)", () => {
      assertThrows(
        () =>
          parseProgram("Pascal", "program Test;\nvar x: integer;\nbegin\nx :="),
        Error,
        "must be assigned a value",
      );
    });

    it("throws when assigning to a constant", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nconst size = 5;\nbegin\nsize := 6;\nend.",
          ),
        Error,
        "is a constant, not a variable",
      );
    });

    it("throws when an identifier is not defined at all", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nbegin\nfoo := 1;\nend."),
        Error,
        'Identifier "foo" is not defined',
      );
    });

    it("is case-insensitive for identifiers (declared upper, used lower)", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar X: integer;\nbegin\nx := 1;\nend.",
      );
      assertEquals(program.variables[0].name, "x");
      const assignment = program.statements[0] as VariableAssignment;
      assertEquals(assignment.variable.name, "x");
    });
  });

  describe("procedure/function calls", () => {
    it("parses a zero-argument procedure call", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nbegin\nhome;\nend.",
      );
      const call = program.statements.find(
        (s) => s.statementType === "procedureCall",
      ) as ProcedureCall | undefined;
      assertExists(call);
      assertEquals(call.arguments.length, 0);
    });

    it("throws when brackets are used on a zero-parameter command", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nbegin\nhome();\nend."),
        Error,
        "takes no arguments",
      );
    });

    it("throws when a function is called as a procedure statement", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nbegin\nabs(5);\nend."),
        Error,
        "is a function, not a procedure",
      );
    });

    it("throws when a procedure is used as a function within an expression", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar x: integer;\nbegin\nx := home;\nend.",
          ),
        Error,
        "is a procedure, not a function",
      );
    });

    it("throws when a required opening bracket is missing", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nbegin\nforward;\nend."),
        Error,
        "Opening bracket missing",
      );
    });
  });

  describe("statement separation (eosCheck / semicolon)", () => {
    it("parses statements separated by a semicolon", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar x, y: integer;\nbegin\nx := 1;\ny := 2;\nend.",
      );
      assertEquals(program.statements.length, 2);
    });

    it("tolerates multiple/trailing semicolons between statements", () => {
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar x: integer;\nbegin\nx := 1;;;\nend.",
      );
      assertEquals(program.statements.length, 1);
    });

    it("tolerates a trailing comment right after a command, before an implicit end-of-block", () => {
      // regression test: eosCheck() used to check lexemes.get(-1)/lexemes.get()
      // without skipping a comment in between, so "closefile(handle) {c}"
      // followed by "end" (no semicolon needed before "end") wrongly threw
      // "Semicolon needed after command" - the comment lexeme itself isn't
      // in the noSemiBefore list. Found via
      // assets/examples/Pascal/Files/WriteAndReadFile.tpas.
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar x: integer;\nbegin\nx := 1 { comment }\nend.",
      );
      assertEquals(program.statements.length, 1);
      assertEquals(program.statements[0].statementType, "variableAssignment");
    });

    it("walks back past a comment an earlier eosCheck already skipped (nested single-statement bodies)", () => {
      // "for ... do if ... then <command>; {c}" makes eosCheck run three
      // times at the same lexeme position - once per wrapping statement.
      // The innermost call eats the ";" and stops on the comment; the middle
      // one skips forward past the comment; by the time the outermost (the
      // FOR) runs, the comment is lexemes.get(-1), so eosCheck has to walk
      // *backwards* past it too to find the ";" that means no further
      // semicolon is needed. Without that backward walk this throws
      // "Semicolon needed after command".
      const program = parseProgram(
        "Pascal",
        "program Test;\nvar x: integer;\nbegin\nfor x := 1 to 10 do\nif x > 5 then\nwriteln('hi'); { done }\nend.",
      );
      assertEquals(program.statements.length, 1);
      const forStatement = program.statements[0] as ForStatement;
      assertEquals(forStatement.statementType, "forStatement");
      assertEquals(forStatement.statements.length, 1);
      const ifStatement = forStatement.statements[0] as IfStatement;
      assertEquals(ifStatement.statementType, "ifStatement");
      assertEquals(ifStatement.ifStatements.length, 1);
      assertEquals(ifStatement.ifStatements[0].statementType, "procedureCall");
    });

    it("throws if a semicolon is missing between two statements", () => {
      assertThrows(
        () =>
          parseProgram(
            "Pascal",
            "program Test;\nvar x, y: integer;\nbegin\nx := 1\ny := 2;\nend.",
          ),
        Error,
        "Semicolon needed after command",
      );
    });

    it("throws if a statement begins with an unrecognised keyword", () => {
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nbegin\nuntil true;\nend."),
        Error,
        "Statement cannot begin with",
      );
    });

    it("throws if a statement begins with a lexeme that isn't a comment, identifier, or keyword", () => {
      // exercises the outer default branch in statement.ts (as opposed to
      // the inner keyword-subtype default exercised just above)
      assertThrows(
        () => parseProgram("Pascal", "program Test;\nbegin\n5;\nend."),
        Error,
        "Statement cannot begin with",
      );
    });
  });
});
