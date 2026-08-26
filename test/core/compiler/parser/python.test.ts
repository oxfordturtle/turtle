import { describe, it } from "@std/testing/bdd";
import {
  assert,
  assertEquals,
  assertExists,
  assertFalse,
  assertThrows,
} from "@std/assert";
import type {
  Constant,
  ForStatement,
  IfStatement,
  ProcedureCall,
  ReturnStatement,
  VariableAssignment,
  WhileStatement,
} from "@/core/compiler.ts";
import { parseProgram } from "./lib/programs.ts";

/**
 * Python-specific parser tests: syntax too divergent for the shared
 * cross-language table in common.test.ts (indentation-driven blocks, "def"
 * subroutines with implicit type inference, "global"/"nonlocal", the
 * variadic "input"/"print" commands, and the auto-variable-creation
 * fallback in common/factor.ts that's unique to Python) plus error paths
 * for every major statement kind.
 */

describe("parse: Python", () => {
  describe("program structure", () => {
    it("parses an empty program", () => {
      const program = parseProgram("Python", "");
      assertEquals(program.statements.length, 0);
      assertEquals(program.language, "Python");
    });

    it("ignores a comment as a pass statement", () => {
      const program = parseProgram("Python", "# hello\nx = 1");
      assertEquals(program.statements[0]?.statementType, "passStatement");
    });

    it("tolerates a trailing comment on the same line as a statement", () => {
      // regression test: eosCheck() used to require the lexeme right after
      // a statement to be ";" or a newline - a trailing "# comment" (which
      // lexify.ts always follows with a synthetic newline lexeme) didn't
      // match either, so it threw instead of being skipped.
      const program = parseProgram("Python", "x = 1  # a comment\ny = 2");
      assertEquals(
        program.statements.map((s) => s.statementType),
        ["variableAssignment", "variableAssignment"],
      );
    });

    it("parses multiple statements", () => {
      const program = parseProgram("Python", "x = 1\ny = 2\nz = 3");
      assertEquals(program.statements.length, 3);
    });

    it("parses PASS as a pass statement", () => {
      const program = parseProgram("Python", "pass");
      assertEquals(program.statements[0]?.statementType, "passStatement");
    });

    it("throws if a statement is indented with no preceding block opener", () => {
      // the lexer happily emits an "indent" lexeme for any increase in
      // indentation; it's the parser's statement() that rejects a leading
      // indent it wasn't expecting
      assertThrows(
        () => parseProgram("Python", "if True:\n    x = 1\n        y = 2"),
        Error,
        "Statement cannot be indented",
      );
    });

    it("throws on inconsistent (dedent-to-unknown-level) indentation", () => {
      // this is actually a lexer-level check (lexify.ts), surfaced here
      // through the full tokenize/lexify/parse pipeline; the parser itself
      // has no separate indentation-consistency check (see block.ts, which
      // just consumes statements until a "dedent" lexeme)
      assertThrows(
        () =>
          parseProgram(
            "Python",
            "if True:\n    if True:\n        x = 1\n   y = 2",
          ),
        Error,
        "Inconsistent indentation",
      );
    });

    it("throws when a keyword cannot begin a statement", () => {
      assertThrows(
        () => parseProgram("Python", "else:\n    x = 1"),
        Error,
        "cannot begin with",
      );
    });

    it("throws when a keyword with no dedicated statement case begins a statement", () => {
      // "elif" is a valid keyword, but only inside an "if" chain — used
      // standalone it falls through the keyword switch's own default case
      assertThrows(
        () => parseProgram("Python", "elif"),
        Error,
        "cannot begin with",
      );
    });

    it("throws when a non-keyword, non-identifier lexeme begins a statement", () => {
      // an integer literal can't start a statement either — this hits
      // statement()'s outer default case (lexeme.type not handled at all),
      // as opposed to the inner default above (keyword type, but no
      // matching subtype case)
      assertThrows(
        () => parseProgram("Python", "1"),
        Error,
        "cannot begin with",
      );
    });

    it("throws on 'def (' as an invalid subroutine declaration (regression)", () => {
      assertThrows(() => parseProgram("Python", "def ("), Error);
    });
  });

  describe("statement separation (statements/eosCheck.ts)", () => {
    it("parses statements separated by a semicolon on one line", () => {
      const program = parseProgram("Python", "x = 1; y = 2");
      assertEquals(program.statements.length, 2);
    });

    it("parses statements separated by a semicolon immediately followed by a new line", () => {
      const program = parseProgram("Python", "x = 1;\ny = 2");
      assertEquals(program.statements.length, 2);
    });

    it("throws if two statements aren't separated by a semicolon or a new line", () => {
      assertThrows(
        () => parseProgram("Python", "x = 1 y = 2"),
        Error,
        "Statement must be separated by a semicolon or placed on a new line",
      );
    });
  });

  describe("if / elif / else chains and nested blocks", () => {
    it("parses an elif chain", () => {
      const program = parseProgram(
        "Python",
        "x = 1\nif x == 1:\n    y = 1\nelif x == 2:\n    y = 2\nelse:\n    y = 3",
      );
      const ifStatement = program.statements.find(
        (s) => s.statementType === "ifStatement",
      ) as IfStatement;
      assertExists(ifStatement);
      assertEquals(ifStatement.elseStatements.length, 1);
      const elif = ifStatement.elseStatements[0] as IfStatement;
      assertEquals(elif.statementType, "ifStatement");
      assertEquals(elif.elseStatements.length, 1);
    });

    it("parses nested if blocks with dedent to multiple levels", () => {
      const program = parseProgram(
        "Python",
        "x = 1\nif x == 1:\n    if x == 1:\n        y = 1\n    y = 2\ny = 3",
      );
      assertEquals(program.statements.length, 3);
      const outer = program.statements[1] as IfStatement;
      assertEquals(outer.ifStatements.length, 2);
      const inner = outer.ifStatements[0] as IfStatement;
      assertEquals(inner.statementType, "ifStatement");
    });

    it("tolerates a trailing comment right after the 'if' colon", () => {
      // regression test: the "must be on a new line" check used to look at
      // the lexeme right after the colon without skipping a comment first -
      // "if x > 0: # comment" put a comment lexeme there instead of a
      // newline, so it wrongly threw. Found via
      // assets/examples/Python/Files/WriteAndReadFile.tpy.
      const program = parseProgram(
        "Python",
        "x = 1\nif x == 1: # comment\n    y = 1",
      );
      const ifStatement = program.statements.find(
        (s) => s.statementType === "ifStatement",
      ) as IfStatement;
      assertExists(ifStatement);
      assertEquals(ifStatement.ifStatements.length, 1);
    });

    it("tolerates a trailing comment right after the 'else' colon", () => {
      const program = parseProgram(
        "Python",
        "x = 1\nif x == 1:\n    y = 1\nelse: # comment\n    y = 2",
      );
      const ifStatement = program.statements.find(
        (s) => s.statementType === "ifStatement",
      ) as IfStatement;
      assertExists(ifStatement);
      assertEquals(ifStatement.elseStatements.length, 1);
    });

    it("throws if 'if' is not followed by a colon", () => {
      // N.B. ifStatement.ts's colon check only verifies a lexeme exists at
      // all, not that its content is actually ":" — so a missing colon with
      // more code after it (e.g. a newline) is instead swallowed as if it
      // were the colon, and surfaces later as a "must be on a new line"
      // error; only true end-of-input right after the condition reaches
      // this specific message
      assertThrows(
        () => parseProgram("Python", "if True"),
        Error,
        "must be followed by a colon",
      );
    });

    it("throws if statements after the colon are not on a new line", () => {
      assertThrows(
        () => parseProgram("Python", "if True: x = 1"),
        Error,
        "must be on a new line",
      );
    });

    it("throws if statements after the colon are not indented", () => {
      assertThrows(
        () => parseProgram("Python", "if True:\nx = 1"),
        Error,
        "must be indented",
      );
    });

    it("throws if 'else' is not followed by a colon", () => {
      assertThrows(
        () => parseProgram("Python", "if True:\n    x = 1\nelse\n    x = 2"),
        Error,
        '"else" must be followed by a colon',
      );
    });

    it("throws if statements after 'else:' are not on a new line", () => {
      assertThrows(
        () => parseProgram("Python", "if True:\n    x = 1\nelse: x = 2"),
        Error,
        'Statements following "else:" must be on a new line',
      );
    });

    it("throws if statements after 'else:' are not indented", () => {
      assertThrows(
        () => parseProgram("Python", "if True:\n    x = 1\nelse:\nx = 2"),
        Error,
        'Statements following "else:" must be indented',
      );
    });

    it("throws if 'else' appears at the start of a statement with no preceding if", () => {
      assertThrows(
        () => parseProgram("Python", "else:\n    x = 1"),
        Error,
        'Statement cannot begin with "else"',
      );
    });

    it("tolerates a blank line between an if-block and its elif/else", () => {
      // N.B. this does NOT exercise ifStatement.ts's own
      // "while (lexemes.get()?.type === 'newline')" blank-line-skipping
      // loop: lexify.ts always collapses a run of blank lines down to a
      // single "newline" lexeme, and that lone lexeme is already consumed
      // by "x = 1"'s own eosCheck before block.ts even looks for the
      // dedent — so there's never a stray newline lexeme left for this
      // loop to find. Confirmed by inspecting the lexeme stream directly;
      // that loop looks unreachable via the public parse() API.
      const program = parseProgram(
        "Python",
        "if True:\n    x = 1\n\nelse:\n    x = 2",
      );
      const ifStatement = program.statements[0] as IfStatement;
      assertEquals(ifStatement.elseStatements.length, 1);
    });

    it("tolerates a full-line comment between an if-block and its 'else'", () => {
      // this DOES exercise ifStatement.ts's skip loop (unlike the blank-line
      // case above): a comment written at column 0 after the if-block's
      // dedent leaves a "comment" lexeme sitting exactly where "else" is
      // expected, so the loop has to step over it
      const program = parseProgram(
        "Python",
        "if True:\n    x = 1\n# comment\nelse:\n    x = 2",
      );
      const ifStatement = program.statements[0] as IfStatement;
      assertEquals(ifStatement.ifStatements.length, 1);
      assertEquals(ifStatement.elseStatements.length, 1);
      assertEquals(
        ifStatement.elseStatements[0]?.statementType,
        "variableAssignment",
      );
    });

    it("tolerates a full-line comment between an if-block and its 'elif'", () => {
      const program = parseProgram(
        "Python",
        "x = 0\nif x == 1:\n    y = 1\n# comment\nelif x == 2:\n    y = 2",
      );
      const ifStatement = program.statements[1] as IfStatement;
      assertEquals(ifStatement.elseStatements.length, 1);
      const elif = ifStatement.elseStatements[0] as IfStatement;
      assertEquals(elif.statementType, "ifStatement");
      assertEquals(elif.ifStatements.length, 1);
    });

    it("tolerates a comment indented to the if-block's own level before the 'else'", () => {
      const program = parseProgram(
        "Python",
        "if True:\n    x = 1\n    # comment\nelse:\n    x = 2",
      );
      const ifStatement = program.statements[0] as IfStatement;
      assertEquals(ifStatement.elseStatements.length, 1);
    });

    // The following all end the source stream immediately after the token
    // ifStatement.ts had just consumed, so each of its "is there anything
    // left to parse" guards (as opposed to the "is it the right *kind* of
    // token" checks already covered above) gets exercised at least once.
    describe("truncated input", () => {
      it("throws if 'if' has no condition at all", () => {
        assertThrows(
          () => parseProgram("Python", "if"),
          Error,
          "must be followed by a Boolean expression",
        );
      });

      it("throws if nothing follows the (fake) colon", () => {
        assertThrows(
          () => parseProgram("Python", "if True:"),
          Error,
          'No statements found after "if <expression>:"',
        );
      });

      it("throws if nothing follows the newline after the colon", () => {
        assertThrows(
          () => parseProgram("Python", "if True:\n"),
          Error,
          'No statements found after "if <expression>:"',
        );
      });

      it("throws if nothing follows the indent", () => {
        assertThrows(
          () => parseProgram("Python", "if True:\n    "),
          Error,
          'No statements found after "if <expression>:"',
        );
      });

      it("throws if 'else' is the last token in the program", () => {
        assertThrows(
          () => parseProgram("Python", "if True:\n    x = 1\nelse"),
          Error,
          '"else" must be followed by a colon',
        );
      });

      it("throws if nothing follows 'else:'", () => {
        assertThrows(
          () => parseProgram("Python", "if True:\n    x = 1\nelse:"),
          Error,
          'No statements found after "else:"',
        );
      });

      it("throws if nothing follows the newline after 'else:'", () => {
        assertThrows(
          () => parseProgram("Python", "if True:\n    x = 1\nelse:\n"),
          Error,
          'No statements found after "else:"',
        );
      });

      it("throws if nothing follows the indent after 'else:'", () => {
        assertThrows(
          () => parseProgram("Python", "if True:\n    x = 1\nelse:\n    "),
          Error,
          'No statements found after "else:"',
        );
      });
    });
  });

  describe("while loops", () => {
    it("parses a while loop", () => {
      const program = parseProgram(
        "Python",
        "x = 0\nwhile x < 3:\n    x = x + 1",
      );
      const whileStatement = program.statements.find(
        (s) => s.statementType === "whileStatement",
      ) as WhileStatement;
      assertExists(whileStatement);
      assertEquals(whileStatement.statements.length, 1);
    });

    it("tolerates a trailing comment right after the 'while' colon", () => {
      // regression test: see the equivalent "if" test above for the general
      // bug shape.
      const program = parseProgram(
        "Python",
        "x = 0\nwhile x < 3: # comment\n    x = x + 1",
      );
      const whileStatement = program.statements.find(
        (s) => s.statementType === "whileStatement",
      ) as WhileStatement;
      assertExists(whileStatement);
      assertEquals(whileStatement.statements.length, 1);
    });

    it("throws if 'while' is not followed by a colon", () => {
      assertThrows(
        () => parseProgram("Python", "while True\n    pass"),
        Error,
        "must be followed by a colon",
      );
    });

    it("throws if statements after 'while <expr>:' are not on a new line", () => {
      assertThrows(
        () => parseProgram("Python", "while True: pass"),
        Error,
        "must be on a new line",
      );
    });

    it("throws if statements after 'while <expr>:' are not indented", () => {
      assertThrows(
        () => parseProgram("Python", "while True:\npass"),
        Error,
        "must be indented",
      );
    });

    describe("truncated input", () => {
      it("throws if 'while' has no condition at all", () => {
        assertThrows(
          () => parseProgram("Python", "while"),
          Error,
          "must be followed by a Boolean expression",
        );
      });

      it("throws if nothing at all follows the condition", () => {
        assertThrows(
          () => parseProgram("Python", "while True"),
          Error,
          "must be followed by a colon",
        );
      });

      it("throws if nothing follows the colon", () => {
        assertThrows(
          () => parseProgram("Python", "while True:"),
          Error,
          'No statements found after "while <expression>:"',
        );
      });

      it("throws if nothing follows the newline after the colon", () => {
        assertThrows(
          () => parseProgram("Python", "while True:\n"),
          Error,
          'No statements found after "while <expression>:"',
        );
      });

      it("throws if nothing follows the indent", () => {
        assertThrows(
          () => parseProgram("Python", "while True:\n    "),
          Error,
          'No statements found after "while <expression>:"',
        );
      });
    });
  });

  describe("for loops (range semantics)", () => {
    it("parses a 1-argument range (implicit 0 start, step 1)", () => {
      const program = parseProgram("Python", "for i in range(3):\n    pass");
      const forStatement = program.statements[0] as ForStatement;
      assertEquals(forStatement.statementType, "forStatement");
      assertEquals(forStatement.initialisation.value.expressionType, "integer");
    });

    it("parses a 2-argument range (explicit start and stop)", () => {
      const program = parseProgram("Python", "for i in range(1, 3):\n    pass");
      const forStatement = program.statements[0] as ForStatement;
      assertExists(forStatement);
    });

    it("parses a 3-argument range with a positive step", () => {
      const program = parseProgram(
        "Python",
        "for i in range(0, 10, 2):\n    pass",
      );
      const forStatement = program.statements[0] as ForStatement;
      assertExists(forStatement);
    });

    it("parses a 3-argument range with a negative step", () => {
      const program = parseProgram(
        "Python",
        "for i in range(10, 0, -1):\n    pass",
      );
      const forStatement = program.statements[0] as ForStatement;
      assertExists(forStatement);
    });

    it("reuses an existing integer variable as the loop counter", () => {
      const program = parseProgram(
        "Python",
        "i = 1\nfor i in range(3):\n    pass",
      );
      assertEquals(program.variables.filter((v) => v.name === "i").length, 1);
    });

    it("pins the type of an existing, not-yet-certain variable reused as the loop counter", () => {
      // a function parameter (unlike a top-level "for" fresh variable) is
      // untyped until first used, so reusing it as a loop counter is the
      // way to reach forStatement.ts's "reuse, but pin the type" branch, as
      // opposed to the "create a fresh, already-integer variable" branch.
      // N.B. "f" is deliberately never called: calling it would pin "n"'s
      // type from the call site's argument first (common/typeCheck.ts),
      // before the for loop ever gets a chance to
      const program = parseProgram(
        "Python",
        "def f(n):\n    for n in range(3):\n        pass\n    return n",
      );
      const n = program.subroutines[0]?.variables.find((v) => v.name === "n");
      assertEquals(n?.type, "integer");
      assert(n?.typeIsCertain);
    });

    it("throws if the loop variable already has a non-integer type", () => {
      assertThrows(
        () => parseProgram("Python", "x = True\nfor x in range(3):\n    pass"),
        Error,
        "Loop variable must be an integer",
      );
    });

    it("throws if 'for' is not followed by a variable", () => {
      assertThrows(
        () => parseProgram("Python", "for 1 in range(3):\n    pass"),
        Error,
        "is not a valid variable name",
      );
    });

    it("throws if the loop variable is not followed by 'in'", () => {
      assertThrows(
        () => parseProgram("Python", "for i range(3):\n    pass"),
        Error,
        'must be followed by "in"',
      );
    });

    it("throws if 'in' is not followed by 'range'", () => {
      assertThrows(
        () => parseProgram("Python", "for i in 3:\n    pass"),
        Error,
        "must be followed by a range specification",
      );
    });

    it("throws if 'range' is not followed by an opening bracket", () => {
      assertThrows(
        () => parseProgram("Python", "for i in range 3:\n    pass"),
        Error,
        '"range" must be followed by an opening bracket',
      );
    });

    it("throws if range() is given no arguments", () => {
      // as with the "if" colon check above, the "Missing first argument"
      // message only fires on genuine end-of-input right after "range(";
      // "range()" instead fails in parseExpression itself, since ")" can't
      // start an expression
      assertThrows(
        () => parseProgram("Python", "for i in range("),
        Error,
        'Missing first argument to the "range" function',
      );
    });

    it("throws if range() is given a trailing comma with no second argument", () => {
      assertThrows(
        () => parseProgram("Python", "for i in range(1,"),
        Error,
        'Too few arguments for "range" function',
      );
    });

    it("throws if range() is given more than three arguments", () => {
      assertThrows(
        () => parseProgram("Python", "for i in range(1, 2, 3, 4):\n    pass"),
        Error,
        'Too many arguments for "range" function',
      );
    });

    it("throws if range()'s closing bracket is missing", () => {
      assertThrows(
        () => parseProgram("Python", "for i in range(1, 2, 3"),
        Error,
        'Closing bracket needed after "range" function arguments',
      );
    });

    it("tolerates a trailing comment right after the range colon", () => {
      // regression test: see the "while" describe block above for the
      // general bug shape.
      const program = parseProgram(
        "Python",
        "for i in range(3): # comment\n    pass",
      );
      const forStatement = program.statements[0] as ForStatement;
      assertEquals(forStatement.statementType, "forStatement");
    });

    it("throws if 'for <variable> in range(...)' is not followed by a colon", () => {
      assertThrows(
        () => parseProgram("Python", "for i in range(3)\n    pass"),
        Error,
        "must be followed by a colon",
      );
    });

    it("throws if statements after the range colon are not on a new line", () => {
      assertThrows(
        () => parseProgram("Python", "for i in range(3): pass"),
        Error,
        "must be on a new line",
      );
    });

    it("throws if statements after the range colon are not indented", () => {
      assertThrows(
        () => parseProgram("Python", "for i in range(3):\npass"),
        Error,
        "must be indented",
      );
    });

    describe("truncated input", () => {
      it("throws if 'for' is the last token in the program", () => {
        assertThrows(
          () => parseProgram("Python", "for"),
          Error,
          "must be followed by an integer variable",
        );
      });

      it("throws if the loop variable is the last token", () => {
        assertThrows(
          () => parseProgram("Python", "for i"),
          Error,
          'must be followed by "in"',
        );
      });

      it("throws if 'in' is the last token", () => {
        assertThrows(
          () => parseProgram("Python", "for i in"),
          Error,
          "must be followed by a range specification",
        );
      });

      it("throws if 'range' is the last token", () => {
        assertThrows(
          () => parseProgram("Python", "for i in range"),
          Error,
          '"range" must be followed by an opening bracket',
        );
      });

      it("throws if nothing follows the first argument", () => {
        assertThrows(
          () => parseProgram("Python", "for i in range(1"),
          Error,
          "Argument must be followed by a comma",
        );
      });

      it("throws if a stray token follows the first argument", () => {
        assertThrows(
          () => parseProgram("Python", "for i in range(1 x):\n    pass"),
          Error,
          "Argument must be followed by a comma or a closing bracket",
        );
      });

      it("throws if nothing follows the second argument", () => {
        assertThrows(
          () => parseProgram("Python", "for i in range(1, 2"),
          Error,
          "Argument must be followed by a comma",
        );
      });

      it("throws if a stray token follows the second argument", () => {
        assertThrows(
          () => parseProgram("Python", "for i in range(1, 2 x):\n    pass"),
          Error,
          "Argument must be followed by a comma or a closing bracket",
        );
      });

      it("throws if nothing follows a trailing comma after the second argument", () => {
        assertThrows(
          () => parseProgram("Python", "for i in range(1, 2,"),
          Error,
          'Too few arguments for "range" function',
        );
      });

      it("throws if a stray token follows all three range() arguments", () => {
        assertThrows(
          () => parseProgram("Python", "for i in range(1, 2, 3 x):\n    pass"),
          Error,
          'Closing bracket needed after "range" function arguments',
        );
      });

      it("throws if nothing follows range(...)'s closing bracket", () => {
        assertThrows(
          () => parseProgram("Python", "for i in range(3)"),
          Error,
          "must be followed by a colon",
        );
      });

      it("throws if nothing follows the colon", () => {
        assertThrows(
          () => parseProgram("Python", "for i in range(3):"),
          Error,
          'No statements found after "for <variable> in ...:".',
        );
      });

      it("throws if nothing follows the newline after the colon", () => {
        assertThrows(
          () => parseProgram("Python", "for i in range(3):\n"),
          Error,
          'No statements found after "for <variable> in ...:".',
        );
      });

      it("throws if nothing follows the indent", () => {
        assertThrows(
          () => parseProgram("Python", "for i in range(3):\n    "),
          Error,
          'No statements found after "for <variable> in ...:',
        );
      });
    });
  });

  // "for <variable> in <list>:" iteration
  describe("for loops (list iteration)", () => {
    it("parses a list-iteration loop and prepends the element read to the body", () => {
      const program = parseProgram(
        "Python",
        "mylist = [1, 2, 3]\nfor element in mylist:\n    pass",
      );
      const forStatement = program.statements[1] as ForStatement;
      assertEquals(forStatement.statementType, "forStatement");
      // the synthesized "element = mylist[!indexN]" statement comes first,
      // before the user's own "pass"
      assertEquals(
        forStatement.statements[0]?.statementType,
        "variableAssignment",
      );
      assertEquals(forStatement.statements[1]?.statementType, "passStatement");
    });

    it("pins a hint-less loop variable's type from the list's element kind", () => {
      const program = parseProgram(
        "Python",
        "mylist = [1, 2, 3]\nfor element in mylist:\n    pass",
      );
      const variable = program.variables.find((v) => v.name === "element");
      assertExists(variable);
      assertEquals(variable?.type, "integer");
      assert(variable?.typeIsCertain);
    });

    it("pins a hint-less loop variable's type from a string list", () => {
      const program = parseProgram(
        "Python",
        'mylist = ["a", "b"]\nfor element in mylist:\n    pass',
      );
      const variable = program.variables.find((v) => v.name === "element");
      assertEquals(variable?.type, "string");
    });

    it("throws if the loop variable's existing type doesn't match the list's element kind", () => {
      assertThrows(
        () =>
          parseProgram(
            "Python",
            'element = "x"\nmylist = [1, 2, 3]\nfor element in mylist:\n    pass',
          ),
        Error,
        "Loop variable type does not match",
      );
    });

    it("throws iterating a non-list, non-range expression", () => {
      assertThrows(
        () => parseProgram("Python", "for i in 5:\n    pass"),
        Error,
        "must be followed by a range specification or a list",
      );
    });

    it("each list-iteration loop gets its own hidden index variable (no collision across sibling loops)", () => {
      const program = parseProgram(
        "Python",
        "a = [1, 2]\nb = [3, 4]\nfor x in a:\n    pass\nfor y in b:\n    pass",
      );
      const hiddenIndexNames = program.variables
        .filter((v) => v.name.startsWith("!index"))
        .map((v) => v.name);
      assertEquals(new Set(hiddenIndexNames).size, hiddenIndexNames.length);
      assertEquals(hiddenIndexNames.length, 2);
    });
  });

  // "for <variable> in <string>:" iteration, which reuses the same index-based
  // desugaring as list iteration above.
  describe("for loops (string iteration)", () => {
    it("parses a string-iteration loop and prepends the element read to the body", () => {
      const program = parseProgram(
        "Python",
        's = "abc"\nfor c in s:\n    pass',
      );
      const forStatement = program.statements[1] as ForStatement;
      assertEquals(forStatement.statementType, "forStatement");
      assertEquals(
        forStatement.statements[0]?.statementType,
        "variableAssignment",
      );
      assertEquals(forStatement.statements[1]?.statementType, "passStatement");
    });

    it("pins a hint-less loop variable's type to 'string'", () => {
      const program = parseProgram(
        "Python",
        's = "abc"\nfor c in s:\n    pass',
      );
      const variable = program.variables.find((v) => v.name === "c");
      assertExists(variable);
      assertEquals(variable?.type, "string");
      assert(variable?.typeIsCertain);
    });

    it("throws if the loop variable's existing type isn't 'string'", () => {
      assertThrows(
        () => parseProgram("Python", 'c = 1\ns = "abc"\nfor c in s:\n    pass'),
        Error,
        "Loop variable type does not match",
      );
    });

    it("throws iterating a string expression rather than a plain string variable", () => {
      // only a plain string *variable* is supported (matching the list
      // branch's own restriction) - "for c in s.upper():" isn't
      assertThrows(
        () =>
          parseProgram("Python", 's = "abc"\nfor c in s.upper():\n    pass'),
        Error,
        "must be followed by a range specification or a list",
      );
    });

    it("each string-iteration loop gets its own hidden index variable (no collision with a sibling loop)", () => {
      const program = parseProgram(
        "Python",
        's = "ab"\nt = "cd"\nfor c in s:\n    pass\nfor d in t:\n    pass',
      );
      const hiddenIndexNames = program.variables
        .filter((v) => v.name.startsWith("!index"))
        .map((v) => v.name);
      assertEquals(new Set(hiddenIndexNames).size, hiddenIndexNames.length);
      assertEquals(hiddenIndexNames.length, 2);
    });
  });

  describe("break and continue statements", () => {
    it("parses 'break' inside a while loop as a breakStatement", () => {
      const program = parseProgram("Python", "while True:\n    break");
      const whileStatement = program.statements[0] as WhileStatement;
      assertEquals(
        whileStatement.statements[0]?.statementType,
        "breakStatement",
      );
    });

    it("parses 'continue' inside a while loop as a continueStatement", () => {
      const program = parseProgram("Python", "while True:\n    continue");
      const whileStatement = program.statements[0] as WhileStatement;
      assertEquals(
        whileStatement.statements[0]?.statementType,
        "continueStatement",
      );
    });

    it("parses 'break' inside a for loop", () => {
      const program = parseProgram("Python", "for i in range(3):\n    break");
      const forStatement = program.statements[0] as ForStatement;
      assertEquals(
        forStatement.statements.at(-1)?.statementType,
        "breakStatement",
      );
    });

    it("parses 'continue' inside a for loop", () => {
      const program = parseProgram(
        "Python",
        "for i in range(3):\n    continue",
      );
      const forStatement = program.statements[0] as ForStatement;
      assertEquals(
        forStatement.statements.at(-1)?.statementType,
        "continueStatement",
      );
    });

    it("parses 'break' inside an 'if' nested inside a loop", () => {
      const program = parseProgram(
        "Python",
        "while True:\n    if True:\n        break",
      );
      const whileStatement = program.statements[0] as WhileStatement;
      const ifStatement = whileStatement.statements[0] as IfStatement;
      assertEquals(
        ifStatement.ifStatements[0]?.statementType,
        "breakStatement",
      );
    });

    it("throws if 'break' occurs outside any loop", () => {
      assertThrows(
        () => parseProgram("Python", "break"),
        Error,
        "'break' is only allowed inside a loop.",
      );
    });

    it("throws if 'continue' occurs outside any loop", () => {
      assertThrows(
        () => parseProgram("Python", "continue"),
        Error,
        "'continue' is only allowed inside a loop.",
      );
    });

    it("throws if 'break' occurs inside an 'if' that is itself outside any loop", () => {
      assertThrows(
        () => parseProgram("Python", "if True:\n    break"),
        Error,
        "'break' is only allowed inside a loop.",
      );
    });

    it("throws if 'break' occurs in a 'def' body whose enclosing loop doesn't count (own routine scope)", () => {
      // real Python scoping: a nested function's own "break" can never
      // target a loop in the *enclosing* routine, even if the "def" is
      // textually written inside one - each routine tracks its own
      // loopDepth from zero (see Routine.loopDepth's own doc comment)
      assertThrows(
        () =>
          parseProgram(
            "Python",
            "while True:\n    def f():\n        break\n    f()",
          ),
        Error,
        "'break' is only allowed inside a loop.",
      );
    });

    it("allows 'break' inside a loop that is itself inside a 'def' body", () => {
      const program = parseProgram(
        "Python",
        "def f():\n    while True:\n        break\nf()",
      );
      const sub = program.subroutines[0];
      const whileStatement = sub?.statements[0] as WhileStatement;
      assertEquals(
        whileStatement.statements[0]?.statementType,
        "breakStatement",
      );
    });

    it("'break'/'continue' still require statement separation, like 'pass'", () => {
      assertThrows(
        () => parseProgram("Python", "while True:\n    break pass"),
        Error,
        "must be separated by a semicolon or placed on a new line",
      );
    });
  });

  describe("def function definitions and return", () => {
    it("parses a function with parameters and a return statement", () => {
      const program = parseProgram(
        "Python",
        "y = double(2)\ndef double(n: int) -> int:\n    return n * 2",
      );
      const sub = program.subroutines[0];
      assertEquals(sub?.name, "double");
      assert(sub?.variables.some((v) => v.isParameter && v.name === "n"));
      const returnStatement = sub?.statements.find(
        (s) => s.statementType === "returnStatement",
      ) as ReturnStatement;
      assertExists(returnStatement);
    });

    it("infers a function's return type from its return statement when none is declared", () => {
      const program = parseProgram(
        "Python",
        "y = double(2)\ndef double(n):\n    return n * 2",
      );
      const sub = program.subroutines[0];
      assert(sub?.typeIsCertain);
    });

    it("supports nested function definitions", () => {
      const program = parseProgram(
        "Python",
        "outer()\ndef outer():\n    def inner():\n        pass\n    inner()",
      );
      const outer = program.subroutines[0];
      assertEquals(outer?.subroutines.length, 1);
      assertEquals(outer?.subroutines[0]?.name, "inner");
    });

    // regression tests for find.assignmentTarget
    // (src/core/compiler/parser/common/find.ts) - see its own doc comment for
    // the full story: a nested subroutine's own
    // local variable used to silently alias an unrelated same-named
    // variable several scopes up (found via Logic&CS/Sorting.tpy's
    // quicksort() -> nested qsort(left,right) assigning "m=left", which
    // corrupted the file's own top-level "for m in range(methods):" loop
    // variable)
    describe("nested subroutine scoping (find.assignmentTarget)", () => {
      it("a nested subroutine's own assignment creates a distinct local, not an alias of a same-named ancestor variable", () => {
        const program = parseProgram(
          "Python",
          "m = 0\ndef outer():\n    def inner():\n        m = 99\n        return m\n    return inner()\nx = outer()",
        );
        const outerVariable = program.variables.find((v) => v.name === "m");
        const inner = program.subroutines[0]?.subroutines[0];
        const innerVariable = inner?.variables.find((v) => v.name === "m");
        assertExists(outerVariable);
        assertExists(innerVariable);
        // two distinct Variable objects, not the same one shared by alias
        assertFalse(outerVariable === innerVariable);
      });

      it("a nested subroutine's own 'for' loop variable is likewise a distinct local", () => {
        const program = parseProgram(
          "Python",
          "i = 0\ndef outer():\n    def inner():\n        for i in range(3):\n            pass\n        return i\n    return inner()\nx = outer()",
        );
        const outerVariable = program.variables.find((v) => v.name === "i");
        const inner = program.subroutines[0]?.subroutines[0];
        const innerVariable = inner?.variables.find((v) => v.name === "i");
        assertExists(outerVariable);
        assertExists(innerVariable);
        assertFalse(outerVariable === innerVariable);
      });

      it("a nested subroutine can still read an ancestor-scope variable without declaring it global/nonlocal", () => {
        // only *assignment* targets are scoped strictly - a mere reference
        // still falls through to the enclosing scope, same as before (this
        // would throw - an undefined-variable/type error - if reads had
        // been broken by the stricter assignment-target lookup)
        const program = parseProgram(
          "Python",
          "A = [1, 2, 3]\ndef outer():\n    def inner():\n        return A[0] + A[1] + A[2]\n    return inner()\nx = outer()",
        );
        const inner = program.subroutines[0]?.subroutines[0];
        assertEquals(
          inner?.variables.find((v) => v.name === "A"),
          undefined,
        );
      });

      it("a nested subroutine can still write into an ancestor-scope list/array by index without declaring it global", () => {
        // "mylist[i] = value" reads (rather than rebinds) the list name, so
        // it isn't subject to the stricter local-only lookup
        const program = parseProgram(
          "Python",
          "A = [1, 2, 3]\ndef outer():\n    def inner():\n        A[0] = 99\n    inner()\nouter()",
        );
        const inner = program.subroutines[0]?.subroutines[0];
        assertEquals(
          inner?.variables.find((v) => v.name === "A"),
          undefined,
        );
      });

      it("explicit 'global' inside a nested subroutine still targets the Program variable, not a fresh local", () => {
        const program = parseProgram(
          "Python",
          "m = 0\ndef outer():\n    def inner():\n        global m\n        m = 99\n    inner()\nouter()",
        );
        const inner = program.subroutines[0]?.subroutines[0];
        assertEquals(
          inner?.variables.find((v) => v.name === "m"),
          undefined,
        );
        assertEquals(program.variables.find((v) => v.name === "m")?.name, "m");
      });

      it("explicit 'nonlocal' inside a nested subroutine still targets the enclosing function's variable", () => {
        const program = parseProgram(
          "Python",
          "def outer():\n    x = 1\n    def inner():\n        nonlocal x\n        x = 2\n    inner()\n    return x\ny = outer()",
        );
        const outer = program.subroutines[0];
        const inner = outer?.subroutines[0];
        assertEquals(
          inner?.variables.find((v) => v.name === "x"),
          undefined,
        );
        assertExists(outer?.variables.find((v) => v.name === "x"));
      });

      it("a plain top-level (non-nested) subroutine's assignment ALSO creates its own local, matching real Python exactly (not just nested subroutines)", () => {
        // real Python's scoping rule applies uniformly at every level - a
        // top-level function assigning "m" without "global m" creates its
        // own local too, shadowing the Program-level "m", not writing
        // through to it. See find.assignmentTarget's own doc comment for
        // why an earlier, narrower version of this fix special-cased
        // top-level subroutines instead (and why that was reverted).
        const program = parseProgram(
          "Python",
          "m = 0\ndef f():\n    m = 99\nf()",
        );
        const sub = program.subroutines[0];
        const subVariable = sub?.variables.find((v) => v.name === "m");
        const programVariable = program.variables.find((v) => v.name === "m");
        assertExists(subVariable);
        assertExists(programVariable);
        assertFalse(subVariable === programVariable);
      });

      it("a plain top-level subroutine's assignment still writes through with an explicit 'global' declaration", () => {
        const program = parseProgram(
          "Python",
          "m = 0\ndef f():\n    global m\n    m = 99\nf()",
        );
        const sub = program.subroutines[0];
        assertEquals(
          sub?.variables.find((v) => v.name === "m"),
          undefined,
        );
        assertEquals(program.variables.filter((v) => v.name === "m").length, 1);
      });
    });

    it("throws when a variable's type can never be inferred (unused, uncalled parameter)", () => {
      // checkForUncertainTypes walks the whole program (and subroutines)
      // after parsing. A parameter's type is normally pinned either by a use
      // inside the function body or by a call site's argument type (see
      // common/typeCheck.ts, which infers an uncertain parameter's type from
      // whatever's passed in) — so it takes an unused parameter on a
      // function that's never called to leave it permanently uncertain.
      assertThrows(
        () => parseProgram("Python", "def greet(n):\n    pass"),
        Error,
        "Could not infer the type of variable n",
      );
    });

    it("throws if the subroutine name is a turtle attribute", () => {
      assertThrows(
        () => parseProgram("Python", "def turtx():\n    pass"),
        Error,
        "already the name of a Turtle attribute",
      );
    });

    it("throws if a parameter is declared constant", () => {
      assertThrows(
        () => parseProgram("Python", "def f(x: Final):\n    pass"),
        Error,
        "Subroutine parameters cannot be constants",
      );
    });

    it("throws if a function declares a constant return type", () => {
      assertThrows(
        () => parseProgram("Python", "def f() -> Final:\n    pass"),
        Error,
        "Functions cannot return constant values",
      );
    });

    it("throws if a function declares a list return type", () => {
      assertThrows(
        () => parseProgram("Python", "def f() -> List[int]:\n    pass"),
        Error,
        "Functions cannot return lists",
      );
    });

    it("throws if the parameter list has no opening bracket", () => {
      assertThrows(
        () => parseProgram("Python", "def f:\n    pass"),
        Error,
        'Opening bracket "\\(" missing after function name'.replace("\\(", "("),
      );
    });

    // N.B. subroutine.ts's "Closing bracket missing after function
    // parameters." check is dead code: the while loop it follows only ever
    // exits when the current lexeme's content is already ")", so the check
    // is always false when reached. Every malformed-parameter-list variant
    // tried (EOF mid-list, a stray comma, a dangling type hint) instead
    // throws from inside identifier.ts's own checks first. Left uncovered
    // deliberately — see the final coverage report.

    it("throws if the subroutine declaration has no colon", () => {
      assertThrows(
        () => parseProgram("Python", "def f()\n    pass"),
        Error,
        "Subroutine declaration must be followed by a colon",
      );
    });

    it("throws if nothing follows the subroutine declaration", () => {
      assertThrows(
        () => parseProgram("Python", "def f():"),
        Error,
        "No statements found after subroutine definition",
      );
    });

    it("throws if the subroutine body is not on a new line", () => {
      assertThrows(
        () => parseProgram("Python", "def f(): pass"),
        Error,
        "Subroutine definition must be followed by a line break",
      );
    });

    it("tolerates a trailing comment right after the subroutine declaration's colon", () => {
      // regression test: see the "while loops" describe block above for the
      // general bug shape.
      const program = parseProgram(
        "Python",
        "y = f(1)\ndef f(a: int) -> int: # comment\n    return a",
      );
      const sub = program.subroutines[0];
      assertEquals(sub?.name, "f");
    });

    it("throws if the subroutine body is not indented", () => {
      assertThrows(
        () => parseProgram("Python", "def f():\npass\nf()"),
        Error,
        "Indent needed after subroutine definition",
      );
    });

    it("parses a subroutine with multiple comma-separated parameters", () => {
      const program = parseProgram(
        "Python",
        "y = f(1, 2)\ndef f(a: int, b: int) -> int:\n    return a + b",
      );
      const sub = program.subroutines[0];
      assertEquals(
        sub?.variables.filter((v) => v.isParameter).map((v) => v.name),
        ["a", "b"],
      );
    });

    describe("truncated input", () => {
      it("throws if the function name is the last token (no parameter list at all)", () => {
        assertThrows(
          () => parseProgram("Python", "def f"),
          Error,
          'Opening bracket "(" missing after function name',
        );
      });

      it("throws if nothing at all follows the closing parameter bracket", () => {
        assertThrows(
          () => parseProgram("Python", "def f()"),
          Error,
          "Subroutine declaration must be followed by a colon",
        );
      });

      it("throws if nothing follows the newline after the colon", () => {
        assertThrows(
          () => parseProgram("Python", "def f():\n"),
          Error,
          "No statements found after subroutine definition",
        );
      });
    });
  });

  describe("global / nonlocal", () => {
    it("parses a global declaration referring to an existing program variable", () => {
      const program = parseProgram(
        "Python",
        "x = 1\ndef f():\n    global x\n    x = 2\nf()",
      );
      assertEquals(program.variables.filter((v) => v.name === "x").length, 1);
    });

    it("auto-creates the program variable for a global declared only inside a function", () => {
      const program = parseProgram(
        "Python",
        "def f():\n    global y\n    y = 2\nf()\nz = y",
      );
      assertExists(program.variables.find((v) => v.name === "y"));
    });

    it("parses a nonlocal declaration referring to an enclosing function's variable", () => {
      const program = parseProgram(
        "Python",
        "def outer():\n    x = 1\n    def inner():\n        nonlocal x\n        x = 2\n    inner()\nouter()",
      );
      const outer = program.subroutines[0];
      const inner = outer?.subroutines[0];
      assertEquals(inner?.nonlocals, ["x"]);
    });

    it("parses multiple comma-separated global names", () => {
      const program = parseProgram(
        "Python",
        "x = 1\ny = 2\ndef f():\n    global x, y\n    x = 2\n    y = 3\nf()",
      );
      const sub = program.subroutines[0];
      assertEquals(sub?.globals, ["x", "y"]);
    });

    it("throws on a global statement missing a comma between names", () => {
      assertThrows(
        () =>
          parseProgram(
            "Python",
            "x = 1\ny = 2\ndef f():\n    global x y\n    pass\nf()",
          ),
        Error,
        "Comma missing between global variable declarations",
      );
    });

    it("throws on a nonlocal statement at the top level of the program", () => {
      assertThrows(
        () => parseProgram("Python", "nonlocal x"),
        Error,
        "statements can only occur inside a subroutine",
      );
    });

    it("throws on a global statement at the top level of the program", () => {
      assertThrows(
        () => parseProgram("Python", "global x"),
        Error,
        "statements can only occur inside a subroutine",
      );
    });

    it("throws if a global declaration names no identifier at all (python/identifier.ts EOF guard)", () => {
      assertThrows(
        () => parseProgram("Python", "def f():\n    global"),
        Error,
        '"global" must be followed by an identifier',
      );
    });
  });

  describe("return statement", () => {
    it("throws if a program (not a subroutine) tries to return", () => {
      assertThrows(
        () => parseProgram("Python", "return 1"),
        Error,
        "cannot return a value",
      );
    });

    it("type-checks a second return statement against a type already pinned by the call site", () => {
      // calling f(True) at the top level happens (in parse order) before f's
      // own body is parsed at all — subroutine bodies are only parsed after
      // every top-level statement — so the call site's argument type has
      // already pinned f's result type by the time either "return"
      // statement inside f is reached
      const program = parseProgram(
        "Python",
        "y = f(True)\ndef f(b):\n    if b:\n        return 1\n    else:\n        return 2",
      );
      const sub = program.subroutines[0];
      assert(sub?.typeIsCertain);
    });

    it("infers the result type from a return statement when nothing else has pinned it yet", () => {
      // unlike the case above, "infer" is never called anywhere, so its
      // result type is genuinely undetermined until returnStatement.ts's
      // own type-inference branch runs on its "return 5"
      const program = parseProgram("Python", "def infer():\n    return 5");
      const sub = program.subroutines[0];
      const result = sub?.variables.find((v) => v.name === "!result");
      assertEquals(result?.type, "integer");
      assert(sub?.typeIsCertain);
    });
  });

  describe("variable declaration and assignment", () => {
    it("declares a variable with an explicit type hint", () => {
      const program = parseProgram("Python", "x: int = 5");
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment;
      assertExists(assignment);
      assertEquals(assignment.variable.type, "integer");
      assert(assignment.variable.typeIsCertain);
    });

    it("declares a variable with a type hint and no initial value", () => {
      const program = parseProgram("Python", "x: int\nx = 5");
      const variable = program.variables.find((v) => v.name === "x");
      assertExists(variable);
      assertEquals(variable?.type, "integer");
    });

    it("declares a boolean-typed variable", () => {
      const program = parseProgram("Python", "x: bool = True");
      const variable = program.variables.find((v) => v.name === "x");
      assertEquals(variable?.type, "boolean");
    });

    it("declares a string variable with an explicit length", () => {
      const program = parseProgram("Python", 'x: str[10] = "hi"');
      const variable = program.variables.find((v) => v.name === "x");
      assertEquals(variable?.type, "string");
      assertEquals(variable?.stringLength, 10);
    });

    it("declares a constant with 'Final'", () => {
      const program = parseProgram("Python", "SIZE: Final = 5");
      assertEquals(program.constants.length, 1);
      const constant = program.constants[0] as Constant;
      assertEquals(constant.name, "SIZE");
      assertEquals(constant.value, 5);
    });

    it("declares a list variable with a 'List[T]' hint", () => {
      // "List[T]" sets isList/listElementKind, not arrayDimensions; indexed
      // read/write is not tested here
      const program = parseProgram("Python", "arr: List[int]");
      const variable = program.variables.find((v) => v.name === "arr");
      assertExists(variable);
      assert(variable?.isList);
      assertEquals(variable?.listElementKind, "integer");
      assertEquals(variable?.arrayDimensions, []);
      assert(variable?.typeIsCertain);
    });

    it("declares a list-of-strings variable with a 'List[T]' hint", () => {
      const program = parseProgram("Python", "arr: List[str]");
      const variable = program.variables.find((v) => v.name === "arr");
      assertExists(variable);
      assert(variable?.isList);
      assertEquals(variable?.listElementKind, "string");
    });

    it("declares an untyped variable that defaults to boolint with no hint", () => {
      const program = parseProgram("Python", "x = 1\ny = x");
      const variable = program.variables.find((v) => v.name === "y");
      assertExists(variable);
    });

    it("infers a hint-less list variable's element kind from an integer list literal", () => {
      const program = parseProgram("Python", "x = [1, 2, 3]");
      const variable = program.variables.find((v) => v.name === "x");
      assertExists(variable);
      assert(variable?.isList);
      assertEquals(variable?.listElementKind, "integer");
      assert(variable?.typeIsCertain);
    });

    it("infers a hint-less list variable's element kind from a string list literal", () => {
      const program = parseProgram("Python", 'x = ["a", "b"]');
      const variable = program.variables.find((v) => v.name === "x");
      assertExists(variable);
      assertEquals(variable?.listElementKind, "string");
    });

    it("leaves an empty list literal's element kind uninferred, and throws if nothing else pins it", () => {
      assertThrows(
        () => parseProgram("Python", "x = []"),
        Error,
        "Could not infer the type of variable x",
      );
    });

    it("throws a type error for a list literal with mixed element types", () => {
      assertThrows(
        () => parseProgram("Python", 'x = [1, "a"]'),
        Error,
        "Type error",
      );
    });

    it("throws on a trailing comma in a list literal", () => {
      assertThrows(
        () => parseProgram("Python", "x = [1, 2, ]"),
        Error,
        "Trailing comma at the end of list elements",
      );
    });

    it("throws if a list literal has no closing bracket", () => {
      assertThrows(
        () => parseProgram("Python", "x = [1, 2"),
        Error,
        'Closing bracket "]" needed after list elements',
      );
    });

    it("parses list multiplication ('[x]*n') as a compound expression", () => {
      const program = parseProgram("Python", "x = [0]*8");
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment;
      assertExists(assignment);
      assertEquals(assignment.value.expressionType, "compound");
      const variable = program.variables.find((v) => v.name === "x");
      assert(variable?.isList);
      assertEquals(variable?.listElementKind, "integer");
    });

    // string repetition ("s*n" / "n*s"). Correctness of
    // the resulting string is exercised at the machine level in
    // runtime.test.ts - these cover the parser/type-checker side: that
    // "mult" between a string and an integer is accepted (rather than
    // rejected as a type mismatch) in both operand orders.
    it("parses string repetition ('s*n') as a compound expression, not a type error", () => {
      const program = parseProgram("Python", 's = "ab"\nt = s*3');
      const assignment = program.statements[1] as VariableAssignment;
      assertEquals(assignment.value.expressionType, "compound");
      const variable = program.variables.find((v) => v.name === "t");
      assertEquals(variable?.type, "string");
    });

    it("parses reversed string repetition ('n*s') as a compound expression too", () => {
      const program = parseProgram("Python", 's = "ab"\nt = 3*s');
      const assignment = program.statements[1] as VariableAssignment;
      assertEquals(assignment.value.expressionType, "compound");
      const variable = program.variables.find((v) => v.name === "t");
      assertEquals(variable?.type, "string");
    });

    it("list multiplication (lmul) is unaffected by the new string special case - still requires an integer", () => {
      assertThrows(
        () => parseProgram("Python", 'x = [1, 2]\ny = x*"a"'),
        Error,
        "Type error",
      );
    });

    it("assigning one list variable to another aliases rather than copies (no type error)", () => {
      const program = parseProgram("Python", "x = [1, 2, 3]\ny = x");
      const y = program.variables.find((v) => v.name === "y");
      assert(y?.isList);
      assertEquals(y?.listElementKind, "integer");
    });

    it("throws assigning a list to an already-scalar-typed variable", () => {
      assertThrows(
        () => parseProgram("Python", "x = 1\nx = [1, 2, 3]"),
        Error,
        "Type error",
      );
    });

    it("throws assigning a scalar to an already-list-typed variable", () => {
      assertThrows(
        () => parseProgram("Python", "x: List[int]\nx = 1"),
        Error,
        "Type error",
      );
    });

    it("throws when indexing a non-array, non-string variable", () => {
      assertThrows(
        () => parseProgram("Python", "x = 1\nx[0] = 1"),
        Error,
        "is not a string or array variable",
      );
    });

    // list indexed read/write
    it("parses a list index read", () => {
      const program = parseProgram("Python", "x = [1, 2, 3]\ny = x[0]");
      const assignment = program.statements.find(
        (s, i) => s.statementType === "variableAssignment" && i === 1,
      ) as VariableAssignment;
      assertExists(assignment);
      assertEquals(assignment.value.expressionType, "variable");
    });

    it("parses a list index write", () => {
      const program = parseProgram("Python", "x = [1, 2, 3]\nx[0] = 9");
      const assignment = program.statements[1] as VariableAssignment;
      assertEquals(assignment.indexes.length, 1);
    });

    it("pins a hint-less empty list's element kind from its first indexed write", () => {
      const program = parseProgram("Python", "x: List[int] = []\nx[0] = 9");
      const variable = program.variables.find((v) => v.name === "x");
      assertEquals(variable?.listElementKind, "integer");
    });

    it("infers a hint-less, never-literal-assigned list's element kind from its first indexed write", () => {
      const program = parseProgram("Python", "x = []\nx[0] = 9");
      const variable = program.variables.find((v) => v.name === "x");
      assert(variable?.isList);
      assertEquals(variable?.listElementKind, "integer");
      assert(variable?.typeIsCertain);
    });

    it("throws a type error writing the wrong element kind into a known-kind list", () => {
      assertThrows(
        () => parseProgram("Python", 'x = [1, 2, 3]\nx[0] = "a"'),
        Error,
        "Type error",
      );
    });

    // An empty "x = []" pins x as a list straight away, but leaves the
    // element kind (and so typeIsCertain) unresolved. These three pin what
    // that half-known state does and doesn't allow. The middle one was a
    // real soundness hole: the scalar
    // assignment was accepted and quietly overwrote the type, leaving x
    // both integer-typed and isList-flagged, after which every list
    // operation on it compiled and treated the integer 5 as a heap base
    // address - so "print(x)" read arbitrary machine memory at runtime.
    it("infers the element kind of a hint-less empty list from a later append", () => {
      const program = parseProgram("Python", "x = []\nx.append(1)");
      const variable = program.variables.find((v) => v.name === "x");
      assert(variable?.isList);
      assertEquals(variable?.listElementKind, "integer");
    });

    it("rejects a scalar assignment to a variable already pinned as a list by 'x = []'", () => {
      assertThrows(
        () => parseProgram("Python", "x = []\nx = 5"),
        Error,
        "Type error: a list was expected.",
      );
    });

    it("still allows a later list assignment to resolve an empty list's element kind", () => {
      const program = parseProgram("Python", "x = []\nx = [1, 2]");
      const variable = program.variables.find((v) => v.name === "x");
      assert(variable?.isList);
      assertEquals(variable?.listElementKind, "integer");
      assert(variable?.typeIsCertain);
    });

    it("throws if a list index has no closing bracket", () => {
      assertThrows(
        () => parseProgram("Python", "x = [1, 2, 3]\nx[0"),
        Error,
        'Closing bracket "]" missing after list variable index',
      );
    });

    // lists of lists ("a[i][j] = v" and "a[i] = <sublist>") - see
    // Variable.isListOfLists's
    // own doc comment for why the nesting is deliberately capped at two
    // levels. N.B. an outer list-of-lists always reports listElementKind
    // "integer" (its cells hold opaque sublist pointers); it's
    // innerListElementKind that records the *sublist's* scalar kind.
    describe("lists of lists", () => {
      it("parses a fully-indexed nested write with two index expressions", () => {
        const program = parseProgram(
          "Python",
          "a = [[1, 2], [3, 4]]\na[0][1] = 9",
        );
        const assignment = program.statements[1] as VariableAssignment;
        assertEquals(assignment.indexes.length, 2);
        assertEquals(assignment.value.expressionType, "integer");
        const variable = program.variables.find((v) => v.name === "a");
        assert(variable?.isListOfLists);
        assertEquals(variable?.listElementKind, "integer");
        assertEquals(variable?.innerListElementKind, "integer");
      });

      it("type-checks a fully-indexed nested write against the already-known inner element kind", () => {
        assertThrows(
          () => parseProgram("Python", 'a = [[1, 2], [3, 4]]\na[0][1] = "x"'),
          Error,
          "Type error",
        );
      });

      it("pins a not-yet-known inner element kind from the first fully-indexed write (integer)", () => {
        // "[[]]" is a list-of-lists whose sublist kind is undetermined, so
        // this write is the first thing that reveals it
        const program = parseProgram("Python", "a = [[]]\na[0][0] = 5");
        const variable = program.variables.find((v) => v.name === "a");
        assert(variable?.isListOfLists);
        assertEquals(variable?.innerListElementKind, "integer");
        assert(variable?.typeIsCertain);
      });

      it("pins a not-yet-known inner element kind from the first fully-indexed write (string)", () => {
        const program = parseProgram("Python", 'a = [[]]\na[0][0] = "x"');
        const variable = program.variables.find((v) => v.name === "a");
        assertEquals(variable?.innerListElementKind, "string");
        assert(variable?.typeIsCertain);
      });

      it("throws if the second index has no closing bracket (end of input)", () => {
        assertThrows(
          () => parseProgram("Python", "a = [[1, 2], [3, 4]]\na[0][1"),
          Error,
          'Closing bracket "]" missing after list variable index',
        );
      });

      it("throws if the second index is followed by something other than a closing bracket", () => {
        assertThrows(
          () => parseProgram("Python", "a = [[1, 2], [3, 4]]\na[0][1 = 9"),
          Error,
          'Closing bracket "]" missing after list variable index',
        );
      });

      it("throws on a third bracket group (only two levels of nesting exist)", () => {
        // after two indexes the parser stops consuming brackets, so the
        // third "[" lands on the assignment-operator check instead
        assertThrows(
          () => parseProgram("Python", "a = [[1, 2], [3, 4]]\na[0][1][2] = 9"),
          Error,
          "is not a string or list variable",
        );
      });

      it("parses a singly-indexed write of a whole sublist (one index, list-typed value)", () => {
        const program = parseProgram(
          "Python",
          "a = [[1, 2], [3, 4]]\na[0] = [5, 6]",
        );
        const assignment = program.statements[1] as VariableAssignment;
        assertEquals(assignment.indexes.length, 1);
        assertEquals(assignment.value.expressionType, "listLiteral");
      });

      it("throws assigning a scalar where a whole sublist is expected", () => {
        assertThrows(
          () => parseProgram("Python", "a = [[1, 2], [3, 4]]\na[0] = 5"),
          Error,
          "Type error: a list was expected.",
        );
      });

      it("throws assigning a sublist of the wrong element kind", () => {
        assertThrows(
          () =>
            parseProgram("Python", 'a = [[1, 2], [3, 4]]\na[0] = ["x", "y"]'),
          Error,
          "Type error: a list of 'integer' was expected but a list of 'string' was found.",
        );
      });

      it("accepts an empty sublist literal, whose own element kind reveals nothing to check", () => {
        const program = parseProgram(
          "Python",
          "a = [[1, 2], [3, 4]]\na[0] = []",
        );
        const assignment = program.statements[1] as VariableAssignment;
        assertEquals(assignment.indexes.length, 1);
        const variable = program.variables.find((v) => v.name === "a");
        // the empty literal leaves the already-known inner kind untouched
        assertEquals(variable?.innerListElementKind, "integer");
      });

      it("pins a not-yet-known inner element kind from a whole-sublist write", () => {
        const program = parseProgram("Python", "a = [[]]\na[0] = [1, 2]");
        const variable = program.variables.find((v) => v.name === "a");
        assertEquals(variable?.innerListElementKind, "integer");
        assert(variable?.typeIsCertain);
      });

      it("leaves the inner element kind (and the variable's type) uncertain if the whole-sublist write is itself empty", () => {
        // both "[[], []]" and the "[]" being written are element-kind-free,
        // so nothing ever determines the sublist kind and the end-of-parse
        // certainty check rejects the program
        assertThrows(
          () => parseProgram("Python", "a = [[], []]\na[0] = []"),
          Error,
          "Could not infer the type of variable a",
        );
      });

      it("tracks a string-typed inner element kind through both write forms", () => {
        const nestedWrite = parseProgram(
          "Python",
          'a = [["x"], ["y"]]\na[0][0] = "z"',
        );
        assertEquals(
          nestedWrite.variables.find((v) => v.name === "a")
            ?.innerListElementKind,
          "string",
        );
        const sublistWrite = parseProgram(
          "Python",
          'a = [["x"], ["y"]]\na[1] = ["z"]',
        );
        assertEquals(
          sublistWrite.variables.find((v) => v.name === "a")
            ?.innerListElementKind,
          "string",
        );
      });
    });

    it("throws when a variable is followed by a type hint after it's already been declared", () => {
      assertThrows(
        () => parseProgram("Python", "x: int = 1\nx: int = 2"),
        Error,
        "Type of variable",
      );
    });

    it("throws when assigning to a turtle attribute with a type hint", () => {
      // "turtx" etc. are already-defined turtle variables, so "turtx: int"
      // is parsed as an assignment (not a fresh declaration) and hits
      // variableAssignment.ts's own turtle check, not identifier.ts's
      assertThrows(
        () => parseProgram("Python", "turtx: int = 1"),
        Error,
        "is the name of a predefined Turtle attribute, and cannot be given a type hit",
      );
    });

    // These four pin the string-character-index branch. They used to pin the
    // *opposite* behaviour: the branch
    // type-checked the index against the variable itself (type "string")
    // rather than against "integer", contrary to its own comment, so the
    // sensible `s[0] = "a"` was rejected and the nonsensical `s["x"] = "a"`
    // was accepted. Both sibling list branches already passed "integer";
    // this was a one-word typo, now fixed.
    it("parses a character-index assignment into a string variable", () => {
      const program = parseProgram("Python", 's: str = "hello"\ns[0] = "a"');
      const assignment = program.statements.find(
        (s) => s.statementType === "variableAssignment" && s.indexes.length > 0,
      ) as VariableAssignment;
      assertExists(assignment);
      assertEquals(assignment.indexes.length, 1);
      assertEquals(assignment.indexes[0]?.expressionType, "integer");
    });

    it("throws a type error when the character index is a string, not an integer", () => {
      assertThrows(
        () => parseProgram("Python", 's: str = "hello"\ns["x"] = "a"'),
        Error,
        "Type error: 'integer' expected but 'string' found",
      );
    });

    it("throws if a string-variable index assignment has no closing bracket", () => {
      assertThrows(
        () => parseProgram("Python", 's: str = "hello"\ns[0'),
        Error,
        'Closing bracket "]" missing after string variable index',
      );
    });

    it("throws on a second, non-chained bracket group after a string-variable index", () => {
      // unlike the array branch, the string-index branch only ever consumes
      // a single bracket group, so an immediately-following second "["
      // lands on the assignment-operator check instead
      assertThrows(
        () => parseProgram("Python", 's: str = "hello"\ns[0][1] = "a"'),
        Error,
        "is not a string or list variable",
      );
    });

    // string slicing ("s[a:b]"). Correctness of the
    // resulting substring is exercised at the machine level (encoder output
    // actually consumed by the runtime) in runtime.test.ts - these just
    // cover what the parser records.
    it("parses a string slice, storing both bounds on .slice rather than .indexes", () => {
      const program = parseProgram("Python", 's = "hello world"\nt = s[1:5]');
      const assignment = program.statements[1] as VariableAssignment;
      assertEquals(assignment.value.expressionType, "variable");
      if (assignment.value.expressionType === "variable") {
        assertExists(assignment.value.slice);
        assertEquals(assignment.value.indexes.length, 0);
      }
    });

    it("keeps a list element's character index off .indexes, which holds list levels only", () => {
      // the encoder walks .indexes one list level at a time, so a character
      // index appended there would be read back as a further list dimension
      // - see VariableValue.stringIndex's own comment
      const program = parseProgram("Python", "p = ['abc']\nc = p[0][1]");
      const assignment = program.statements[1] as VariableAssignment;
      assertEquals(assignment.value.expressionType, "variable");
      if (assignment.value.expressionType === "variable") {
        assertEquals(assignment.value.indexes.length, 1);
        assertExists(assignment.value.stringIndex);
        assertEquals(assignment.value.slice, null);
      }
    });

    it("keeps a list element's slice off .indexes too", () => {
      const program = parseProgram("Python", "p = ['abc']\nc = p[0][1:2]");
      const assignment = program.statements[1] as VariableAssignment;
      assertEquals(assignment.value.expressionType, "variable");
      if (assignment.value.expressionType === "variable") {
        assertEquals(assignment.value.indexes.length, 1);
        assertEquals(assignment.value.stringIndex, null);
        assertExists(assignment.value.slice);
      }
    });

    it("throws a type error if a slice bound isn't an integer", () => {
      assertThrows(
        () => parseProgram("Python", 's = "hello"\nt = s[1:"x"]'),
        Error,
        "Type error",
      );
    });

    it("throws when nothing at all follows the variable (no assignment operator)", () => {
      assertThrows(
        () => parseProgram("Python", "x = 1\nx"),
        Error,
        'assignment operator "="',
      );
    });

    it("throws when some other token (not an assignment operator) follows the variable", () => {
      assertThrows(
        () => parseProgram("Python", "x = 1\nx 5"),
        Error,
        'assignment operator "="',
      );
    });

    it("throws when a non-assignment operator follows the variable", () => {
      // distinct from the case above: this one IS an "operator"-type lexeme
      // (unlike the literal "5" above), just not the "asgn" subtype
      assertThrows(
        () => parseProgram("Python", "x = 1\nx < 1"),
        Error,
        'assignment operator "="',
      );
    });

    it("throws when a redeclared identifier duplicates one in the current scope", () => {
      assertThrows(
        () =>
          parseProgram("Python", "def f():\n    pass\ndef f():\n    pass\nf()"),
        Error,
        "already the name of a variable or subroutine",
      );
    });

    it("throws when a variable is assigned no value", () => {
      assertThrows(() => parseProgram("Python", "x: int ="), Error, "Variable");
    });

    it("throws if a constant declaration has no value at all", () => {
      assertThrows(
        () => parseProgram("Python", "X: Final"),
        Error,
        "Constant must be assigned a value",
      );
    });

    it("throws if a constant declaration is followed by something other than '='", () => {
      assertThrows(
        () => parseProgram("Python", "X: Final 5"),
        Error,
        "Constant must be assigned a value",
      );
    });
  });

  describe("type hints (python/type.ts)", () => {
    it("throws if a type hint's colon is not followed by a type at all", () => {
      assertThrows(
        () => parseProgram("Python", "x:"),
        Error,
        "Expecting type specification",
      );
    });

    it("throws if a string type's size specification is missing", () => {
      assertThrows(
        () => parseProgram("Python", "x: str["),
        Error,
        "Expected string size specification",
      );
    });

    it("throws if a string type's size is not an integer literal", () => {
      assertThrows(
        () => parseProgram("Python", 'x: str["a"]'),
        Error,
        "String size must be an integer",
      );
    });

    it("throws if a string type's size is zero", () => {
      assertThrows(
        () => parseProgram("Python", "x: str[0]"),
        Error,
        "String size must be greater than zero",
      );
    });

    it("throws if a string type's size specification has no closing bracket at all", () => {
      assertThrows(
        () => parseProgram("Python", "x: str[5"),
        Error,
        'Closing bracket "]" missing after string size specification',
      );
    });

    it("throws if a stray token follows a string type's size specification", () => {
      assertThrows(
        () => parseProgram("Python", "x: str[5 y"),
        Error,
        'Closing bracket "]" missing after string size specification',
      );
    });

    it("throws on lowercase 'final'", () => {
      assertThrows(
        () => parseProgram("Python", "x: final = 1"),
        Error,
        '"Final" must be written with a capital "F"',
      );
    });

    it("throws on lowercase 'list'", () => {
      assertThrows(
        () => parseProgram("Python", "x: list = 1"),
        Error,
        '"List" must be written with a capital "L"',
      );
    });

    it("throws if 'List' is the last token (no element type at all)", () => {
      assertThrows(
        () => parseProgram("Python", "x: List"),
        Error,
        '"List" must be followed by a type in square brackets',
      );
    });

    it("throws if 'List' is not followed by an opening square bracket", () => {
      assertThrows(
        () => parseProgram("Python", "x: List int"),
        Error,
        '"List" must be followed by a type in square brackets',
      );
    });

    it("throws if a List's element type is itself declared constant", () => {
      assertThrows(
        () => parseProgram("Python", "x: List[Final, 3]"),
        Error,
        "List type cannot be constant",
      );
    });

    it("throws if nothing follows a List's element type at all", () => {
      assertThrows(
        () => parseProgram("Python", "x: List[int"),
        Error,
        '"List" must be followed by closing square brackets',
      );
    });

    it("throws if a List's element type is not followed by a closing bracket", () => {
      assertThrows(
        () => parseProgram("Python", "x: List[int 3]"),
        Error,
        '"List" must be followed by closing square brackets',
      );
    });

    // The old "List[T, N]" fixed-length form is retired: any comma after the
    // element type now gets this specific migration error rather than being
    // parsed as a length specification.
    it("throws a specific migration error for the old 'List[T, N]' fixed-length form", () => {
      assertThrows(
        () => parseProgram("Python", "x: List[int, 5]"),
        Error,
        "Lists no longer have a fixed size",
      );
    });

    it("throws the same migration error regardless of what follows the comma", () => {
      assertThrows(
        () => parseProgram("Python", "x: List[int, ]"),
        Error,
        "Lists no longer have a fixed size",
      );
    });

    it("throws on an unrecognised type name", () => {
      assertThrows(
        () => parseProgram("Python", "x: foo = 1"),
        Error,
        "is not a valid type specification",
      );
    });
  });

  describe("procedure calls", () => {
    it("parses a procedure call with arguments", () => {
      const program = parseProgram("Python", "forward(10)");
      const call = program.statements.find(
        (s) => s.statementType === "procedureCall",
      ) as ProcedureCall;
      assertExists(call);
      assertEquals(call.arguments.length, 1);
    });

    it("allows a function to be called as a bare procedure statement", () => {
      // unlike BASIC/Pascal/C/Java, common/procedureCall.ts's "is a
      // function, not a procedure" check explicitly excludes Python (and
      // TypeScript) — so calling a function and discarding its return value
      // as a standalone statement is permitted
      const program = parseProgram("Python", 'input("name")');
      const call = program.statements.find(
        (s) => s.statementType === "procedureCall",
      ) as ProcedureCall;
      assertExists(call);
    });

    // statement-position list method calls
    it("parses a list method call with no assignment as a bare statement", () => {
      const program = parseProgram(
        "Python",
        "mylist = [1, 2, 3]\nmylist.append(64)",
      );
      const call = program.statements.find(
        (s) => s.statementType === "procedureCall",
      ) as ProcedureCall;
      assertExists(call);
      assertEquals(call.arguments.length, 2); // receiver + value
    });

    it("throws calling an undefined method as a bare statement", () => {
      assertThrows(
        () => parseProgram("Python", "mylist = [1, 2, 3]\nmylist.bogus(1)"),
        Error,
        'Method "bogus" is not defined',
      );
    });

    it("throws if nothing follows '.' in a bare method-call statement", () => {
      assertThrows(
        () => parseProgram("Python", "mylist = [1, 2, 3]\nmylist.\n"),
        Error,
        "Method name missing after '.'",
      );
    });

    it("disambiguates list .index from string .index by receiver (decision 5)", () => {
      const listProgram = parseProgram(
        "Python",
        "mylist = [1, 2, 3]\ny = mylist.index(2)",
      );
      const listAssignment = listProgram.statements[1] as VariableAssignment;
      const listCall = listAssignment.value;
      assert(
        listCall.expressionType === "function" &&
          listCall.command.__ === "Command" &&
          listCall.command.forList,
      );

      const stringProgram = parseProgram(
        "Python",
        's = "hello"\ny = s.index("e")',
      );
      const stringAssignment = stringProgram
        .statements[1] as VariableAssignment;
      const stringCall = stringAssignment.value;
      assertFalse(
        stringCall.expressionType === "function" &&
          stringCall.command.__ === "Command" &&
          !!stringCall.command.forList,
      );
    });

    it("throws a type error appending the wrong element kind", () => {
      assertThrows(
        () => parseProgram("Python", 'mylist = [1, 2, 3]\nmylist.append("a")'),
        Error,
        "Type error",
      );
    });

    it("throws a type error extending with a list of a different element kind", () => {
      assertThrows(
        () =>
          parseProgram(
            "Python",
            'mylist = [1, 2, 3]\nmylist.extend(["a", "b"])',
          ),
        Error,
        "Type error",
      );
    });

    it("throws a type error extending with a non-list argument", () => {
      assertThrows(
        () => parseProgram("Python", "mylist = [1, 2, 3]\nmylist.extend(4)"),
        Error,
        "Type error",
      );
    });

    it("pins a hint-less empty list's element kind from its first .append() call", () => {
      const program = parseProgram("Python", "x = []\nx.append(5)");
      const variable = program.variables.find((v) => v.name === "x");
      assertEquals(variable?.listElementKind, "integer");
      assert(variable?.typeIsCertain);
    });

    it("no regression: existing string dot-methods still parse (e.g. .strip)", () => {
      const program = parseProgram("Python", 's = "  hi  "\ny = s.strip()');
      const assignment = program.statements[1] as VariableAssignment;
      assertEquals(assignment.value.expressionType, "function");
    });
  });

  describe("input/print variadic command special-casing", () => {
    it("parses input() with no arguments (defaults to an empty prompt)", () => {
      const program = parseProgram("Python", "x = input()");
      const assignment = program.statements[0] as VariableAssignment;
      assertEquals(assignment.value.expressionType, "function");
    });

    it("parses input() with a single string prompt argument", () => {
      const program = parseProgram("Python", 'x = input("name: ")');
      const assignment = program.statements[0] as VariableAssignment;
      assertEquals(assignment.value.expressionType, "function");
      if (assignment.value.expressionType === "function") {
        assertEquals(assignment.value.arguments.length, 1);
      }
    });

    it("parses print() with no arguments", () => {
      const program = parseProgram("Python", "print()");
      const call = program.statements[0] as ProcedureCall;
      assertEquals(call.statementType, "procedureCall");
      assertEquals(call.arguments.length, 1); // defaults to an empty string
    });

    it("parses print() with multiple string arguments", () => {
      const program = parseProgram("Python", 'print("a", "b", "c")');
      const call = program.statements[0] as ProcedureCall;
      assertEquals(call.arguments.length, 3);
    });

    it("parses print() with the named 'end' argument", () => {
      const program = parseProgram("Python", 'print("a", end="")');
      const call = program.statements[0] as ProcedureCall;
      assertEquals(call.arguments.length, 2);
      const namedArg = call.arguments[1];
      assertEquals(namedArg?.expressionType, "namedArgument");
      if (namedArg?.expressionType === "namedArgument") {
        assertEquals(namedArg.lexeme.content, "end");
      }
    });

    it("throws on an unknown named argument to print()", () => {
      assertThrows(
        () => parseProgram("Python", 'print("a", foo="")'),
        Error,
        "Unknown named argument foo",
      );
    });
  });

  describe("auto-variable-creation fallback (common/factor.ts, Python only)", () => {
    it("creates a new variable for an unrecognised identifier used as a factor", () => {
      // unlike every other language (which would throw "{lex} is not
      // defined"), Python auto-creates the variable and re-parses
      const program = parseProgram("Python", "y = x + 1");
      const variable = program.variables.find((v) => v.name === "x");
      assertExists(variable);
      const assignment = program.statements.find(
        (s) =>
          s.statementType === "variableAssignment" && s.variable.name === "y",
      ) as VariableAssignment;
      assertExists(assignment);
    });

    it("infers the auto-created variable's type from how it's subsequently used", () => {
      const program = parseProgram("Python", "y: int = 0\ny = x + 1");
      const variable = program.variables.find((v) => v.name === "x");
      assertExists(variable);
      assertEquals(variable?.type, "integer");
    });
  });
});
