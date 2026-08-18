import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertExists, assertThrows } from "@std/assert";
import type {
  ForStatement,
  IfStatement,
  ProcedureCall,
  RepeatStatement,
  ReturnStatement,
  VariableAssignment,
} from "@/core/compiler.ts";
import { bodyStatements, parseProgram, wrapProgram } from "./_programs.ts";

/**
 * Java-specific parser tests: syntax that's too divergent for the shared
 * cross-language table in common.test.ts (the "class Name { ... }" outer
 * wrapper, do-while loops, method definitions with parameters/return types,
 * C/Java-only type-cast expressions) plus error paths for every major
 * statement kind. Java's parser is a close port of C's, so many of these
 * mirror what a c.test.ts would look like, but exercised through Java's own
 * "class"-wrapped syntax.
 *
 * A recurring theme in the error-path tests below: java/program.ts checks
 * that the program's very last lexeme is "}" before anything else is
 * parsed, so the lexeme stream can never actually run dry part-way through
 * a statement -- there is always at least one closing brace still to come
 * (in the wrapped programs below, usually the method's own) for the parser
 * to find where it wanted its next lexeme, so it reports a wrong-lexeme
 * error rather than an end-of-input one. Every `!lexemes.get()` guard in
 * the Java parser is therefore unreachable, and each one is called out at
 * the test that pins down what really happens instead.
 */

describe("parse: Java", () => {
  describe("class wrapper structure", () => {
    it("throws if the program does not begin with 'class'", () => {
      assertThrows(
        () => parseProgram("Java", "int x = 1;"),
        Error,
        'Program must begin with keyword "class"',
      );
    });

    it("throws if the program is empty (no 'class' keyword at all)", () => {
      assertThrows(
        () => parseProgram("Java", ""),
        Error,
        'Program must begin with keyword "class"',
      );
    });

    it("throws if 'class' is not followed by a program name", () => {
      assertThrows(
        () => parseProgram("Java", "class"),
        Error,
        "must be followed by a program name",
      );
    });

    it("throws if the program name is not a valid identifier", () => {
      assertThrows(
        () => parseProgram("Java", "class 123 {}"),
        Error,
        "is not a valid program name",
      );
    });

    it("throws if the program name is a predefined Turtle attribute", () => {
      assertThrows(
        () => parseProgram("Java", "class turtx { void main () {} }"),
        Error,
        "predefined Turtle attribute",
      );
    });

    it("throws if the program name does not begin with a capital letter", () => {
      assertThrows(
        () => parseProgram("Java", "class test { void main () {} }"),
        Error,
        "must begin with a capital letter",
      );
    });

    it("throws if the program name is not followed by an opening bracket", () => {
      assertThrows(
        () => parseProgram("Java", "class Test"),
        Error,
        'must be followed by an opening bracket "{"',
      );
    });

    it("throws if something other than an opening bracket follows the program name", () => {
      assertThrows(
        () => parseProgram("Java", "class Test 1"),
        Error,
        'must be followed by an opening bracket "{"',
      );
    });

    it("throws if the program does not end with a closing bracket", () => {
      // with only 3 lexemes ("class", "Test", "{"), the closing bracket
      // check compares that same "{" against "}" -- lexemes.lexemes[length-1]
      // is never actually undefined once the earlier "!keyword"/"!identifier"/
      // "!openingBracket" checks have all passed, so only the
      // content-mismatch half of this check is reachable, not the
      // "missing entirely" half
      assertThrows(
        () => parseProgram("Java", "class Test {"),
        Error,
        'Program must end with a closing bracket "}"',
      );
    });

    it("throws if the program does not contain a 'main' method", () => {
      assertThrows(
        () => parseProgram("Java", "class Test {\nint x = 1;\n}"),
        Error,
        'does not contain any "main" method',
      );
    });

    it("parses a minimal valid program", () => {
      const program = parseProgram("Java", "class Test {\nvoid main () {}\n}");
      assertEquals(program.language, "Java");
      assertEquals(program.name, "Test");
      assertEquals(program.subroutines.length, 1);
      assertEquals(program.subroutines[0].name, "main");
    });

    it("skips comments between the class body's declarations", () => {
      // java/parser.ts's first (hoisting) pass has its own "comment" case,
      // separate from statement.ts's: unlike a comment inside a method body
      // (which becomes a pass statement, see below), a comment at class
      // level is simply stepped over and produces no statement at all
      const program = parseProgram(
        "Java",
        "class Test {\n// a comment\nint x = 1;\n// another comment\nvoid main () {}\n// trailing comment\n}",
      );
      assertEquals(program.statements.length, 1);
      assertEquals(program.statements[0].statementType, "variableAssignment");
      assertEquals(
        program.variables.map((v) => v.name),
        ["x"],
      );
      assertEquals(
        program.subroutines.map((s) => s.name),
        ["main"],
      );
    });

    it("throws on anything but a constant/variable/subroutine at the top level (keyword)", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nwhile (true) {}\nvoid main () {}\n}",
          ),
        Error,
        "Program can only contain constant definitions, variable declarations, and subroutine definitions.",
      );
    });

    it("throws on anything but a constant/variable/subroutine at the top level (other)", () => {
      assertThrows(
        () => parseProgram("Java", "class Test {\nx = 1;\nvoid main () {}\n}"),
        Error,
        "Program can only contain constant definitions, variable declarations, and subroutine definitions.",
      );
    });
  });

  describe("do-while loop", () => {
    it("parses a do-while loop", () => {
      const program = parseProgram(
        "Java",
        "class Test {\nvoid main () {\nint x = 0;\ndo {\nx = x + 1;\n} while (x < 3);\n}\n}",
      );
      const repeatStatement = bodyStatements("Java", program).find(
        (s) => s.statementType === "repeatStatement",
      ) as RepeatStatement | undefined;
      assertExists(repeatStatement);
      assertEquals(repeatStatement.statements.length, 1);
      // the condition is negated (do-while loops until the condition is
      // false, unlike a repeat-until which is expressed directly)
      assertEquals(repeatStatement.condition.expressionType, "compound");
    });

    it("throws if 'do' is not followed by an opening bracket", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nvoid main () {\ndo x = 1;\nwhile (true);\n}\n}",
          ),
        Error,
        '"do" must be followed by an opening bracket "{"',
      );
    });

    it("throws if the do-block is not followed by 'while'", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nint x;\nvoid main () {\ndo {\nx = 1;\n} x = 2;\n}\n}",
          ),
        Error,
        '"do { ... }" must be followed by "while"',
      );
    });

    it("throws if 'while' is not followed by an opening bracket", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nint x;\nvoid main () {\ndo {\nx = 1;\n} while true);\n}\n}",
          ),
        Error,
        '"while" must be followed by an opening bracket "("',
      );
    });

    it("throws if the while condition is not followed by a closing bracket", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nint x;\nvoid main () {\ndo {\nx = 1;\n} while (true;\n}\n}",
          ),
        Error,
        '"while (..." must be followed by a closing bracket ")"',
      );
    });

    it("throws when the do-while condition is missing entirely", () => {
      // doStatement.ts's '"while (" must be followed by a boolean
      // expression' guard (`!lexemes.get()`) can't fire: a closing brace is
      // always still sitting there, and gets parsed as the start of the
      // condition instead
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nint x;\nvoid main () {\ndo {\nx = 1;\n} while (\n}\n}",
          ),
        Error,
        'Expression cannot begin with "}"',
      );
    });

    it("throws if the do-while statement is not followed by a semicolon", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nint x;\nvoid main () {\ndo {\nx = 1;\n} while (true)\n}\n}",
          ),
        Error,
        "Statement must be followed by a semicolon",
      );
    });
  });

  describe("subroutine (method) definitions", () => {
    it("parses a void procedure with a parameter", () => {
      const program = parseProgram(
        "Java",
        "class Test {\nvoid go (int n) {\nint x = n;\n}\nvoid main () {}\n}",
      );
      const sub = program.subroutines.find((s) => s.name === "go");
      assertExists(sub);
      assertEquals(
        sub.variables.some((v) => v.isParameter && v.name === "n"),
        true,
      );
    });

    it("calls a custom void method as a procedure", () => {
      const program = parseProgram(
        "Java",
        "class Test {\nvoid go (int n) {\nint x = n;\n}\nvoid main () {\ngo(5);\n}\n}",
      );
      const mainSub = program.subroutines.find((s) => s.name === "main");
      const call = mainSub?.statements.find(
        (s) => s.statementType === "procedureCall",
      ) as ProcedureCall | undefined;
      assertExists(call);
      assertEquals(call.command.__ === "Subroutine" && call.command.name, "go");
    });

    it("parses a typed function with a return statement", () => {
      const program = parseProgram(
        "Java",
        "class Test {\nint doubleIt (int n) {\nreturn n * 2;\n}\nvoid main () {\nint x = doubleIt(2);\n}\n}",
      );
      const sub = program.subroutines.find((s) => s.name === "doubleIt");
      assertExists(sub);
      const returnStatement = sub.statements.find(
        (s) => s.statementType === "returnStatement",
      ) as ReturnStatement | undefined;
      assertExists(returnStatement);
    });

    it("parses a method with multiple parameters", () => {
      const program = parseProgram(
        "Java",
        "class Test {\nint add (int a, int b) {\nreturn a + b;\n}\nvoid main () {\nint x = add(1, 2);\n}\n}",
      );
      const sub = program.subroutines.find((s) => s.name === "add");
      assertExists(sub);
      assertEquals(sub.variables.filter((v) => v.isParameter).length, 2);
    });

    it("throws if a method tries to return an array", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nint[3] go () {\nreturn 1;\n}\nvoid main () {}\n}",
          ),
        Error,
        "Methods cannot return arrays",
      );
    });

    // N.B. subroutine.ts's parameters() helper has no opening/closing
    // bracket checks of its own (see the comment on that function): any
    // other content between parameters is instead caught by
    // variable()/type() inside the loop body, as below.
    it("throws if a parameter list is malformed (missing comma)", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nvoid go (int n {}\nvoid main () {}\n}",
          ),
        Error,
        "is not a valid type definition",
      );
    });

    it("throws if the method parameters are not followed by an opening curly bracket", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nvoid go (int n)\nvoid main () {}\n}",
          ),
        Error,
        'Method parameters must be followed by an opening bracket "{"',
      );
    });

    it("throws if a method header is truncated after its parameters", () => {
      // subroutine.ts's `!lexemes.get()` half of the same check can't fire,
      // for the reason given at the top of this file -- the missing "{" is
      // "found" as the program's final "}"
      assertThrows(
        () => parseProgram("Java", "class Test {\nvoid go () }"),
        Error,
        'Method parameters must be followed by an opening bracket "{"',
      );
    });

    it("throws when a void method contains a return statement", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nvoid go () {\nreturn 1;\n}\nvoid main () {}\n}",
          ),
        Error,
        "Procedures cannot return a value",
      );
    });

    it("throws if the return value is the wrong type", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            'class Test {\nboolean go () {\nreturn "hello";\n}\nvoid main () {\nboolean x = go();\n}\n}',
          ),
        Error,
        "Type error",
      );
    });
  });

  describe("type casting", () => {
    it("parses a type cast from char to int", () => {
      const program = parseProgram(
        "Java",
        "class Test {\nvoid main () {\nchar c = 'a';\nint x = (int)c;\n}\n}",
      );
      const assignment = bodyStatements("Java", program).find(
        (s) =>
          s.statementType === "variableAssignment" && s.variable.name === "x",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.expressionType, "cast");
    });

    it("does not wrap the expression in a cast if the types already match", () => {
      const program = parseProgram(
        "Java",
        "class Test {\nvoid main () {\nint x = (int)5;\n}\n}",
      );
      const assignment = bodyStatements("Java", program).find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.expressionType, "integer");
    });

    it("throws when casting an expression as void", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nvoid main () {\nint x = (void)5;\n}\n}",
          ),
        Error,
        "Expression cannot be cast as void",
      );
    });

    it("throws when the cast type is not followed by a closing bracket", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nvoid main () {\nint x = (int 5;\n}\n}",
          ),
        Error,
        'Type in type cast expression must be followed by a closing bracket ")"',
      );
    });

    it("throws when casting a character as a boolean", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nvoid main () {\nchar c = 'a';\nboolean x = (boolean)c;\n}\n}",
          ),
        Error,
        "Characters cannot be cast as booleans",
      );
    });

    it("throws when casting a string as a boolean", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            'class Test {\nvoid main () {\nboolean x = (boolean)"hi";\n}\n}',
          ),
        Error,
        "Strings cannot be cast as booleans",
      );
    });

    it("throws when casting a boolean as a string", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nvoid main () {\nString x = (String)true;\n}\n}",
          ),
        Error,
        "Booleans cannot be cast as strings",
      );
    });

    it("throws when casting a boolean as a character", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nvoid main () {\nchar x = (char)true;\n}\n}",
          ),
        Error,
        "Booleans cannot be cast as characters",
      );
    });

    it("throws when casting a string as a character", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            'class Test {\nvoid main () {\nchar x = (char)"hi";\n}\n}',
          ),
        Error,
        "Strings cannot be cast as characters",
      );
    });
  });

  describe("if / else", () => {
    it("throws if 'if' is not followed by an opening bracket", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram("Java", "if true) { x = 1; }", "int x;"),
          ),
        Error,
        '"if" must be followed by an opening bracket "("',
      );
    });

    it("throws if the if-condition is not followed by a closing bracket", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram("Java", "if (true { x = 1; }", "int x;"),
          ),
        Error,
        '"if (..." must be followed by a closing bracket ")"',
      );
    });

    it("throws if the if-condition is not followed by an opening curly bracket", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram("Java", "if (true) x = 1;", "int x;"),
          ),
        Error,
        '"if (...)" must be followed by an opening curly bracket "{"',
      );
    });

    it("tolerates a missing closing bracket on an inner block (borrows the class's own)", () => {
      // block.ts has no "missing closing bracket" check of its own (see the
      // comment on that function): java/program.ts already guarantees the
      // program's very last lexeme is "}", so this "unclosed" if-block just
      // borrows the class's own closing brace as its closer instead
      const program = parseProgram(
        "Java",
        wrapProgram("Java", "if (true) { x = 1;", "int x;"),
      );
      const ifStatement = bodyStatements("Java", program).find(
        (s) => s.statementType === "ifStatement",
      ) as IfStatement | undefined;
      assertExists(ifStatement);
    });

    it("throws when the if-condition is missing entirely", () => {
      // ifStatement.ts's '"if (" must be followed by a Boolean expression'
      // guard (`!lexemes.get()`) can't fire, for the reason given at the
      // top of this file
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "if (")),
        Error,
        'Expression cannot begin with "}"',
      );
    });

    it("reports a missing closing bracket on two levels of unclosed inner block", () => {
      // the tolerance shown above only stretches one level deep: with two
      // unclosed blocks the inner one swallows the class's own closing
      // brace, so the outer parseBlock's loop really does run out of
      // lexemes. It used to have no end-of-input check (on the assumption
      // that the class's "}" was always still to come) and handed
      // `undefined` to parseStatement, crashing with a raw TypeError; it
      // now reports the missing bracket like C's and TypeScript's
      // equivalent parsers do.
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nint x;\nvoid main () {\nwhile (true) {\nif (true) {\nx = 1;\n}",
          ),
        Error,
        'Closing bracket "}" missing after statement block.',
      );
    });

    it("throws if 'else' is not followed by an opening bracket", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram("Java", "if (true) { x = 1; } else x = 2;", "int x;"),
          ),
        Error,
        '"else" must be followed by an opening bracket "{"',
      );
    });

    it("throws on a stray 'else' with no matching 'if'", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram("Java", "else { x = 1; }", "int x;"),
          ),
        Error,
        'Statement cannot begin with "else"',
      );
    });
  });

  describe("while loop", () => {
    it("throws if 'while' is not followed by an opening bracket", () => {
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "while true) {}")),
        Error,
        '"while" must be followed by an opening bracket "("',
      );
    });

    it("throws if the while-condition is not followed by a closing bracket", () => {
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "while (true {}")),
        Error,
        '"while (..." must be followed by a closing bracket ")"',
      );
    });

    it("throws when the while-condition is missing entirely", () => {
      // whileStatement.ts's '"while (" must be followed by a Boolean
      // expression' guard (`!lexemes.get()`) can't fire, for the reason
      // given at the top of this file
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "while (")),
        Error,
        'Expression cannot begin with "}"',
      );
    });

    it("throws if the while-condition is not followed by an opening curly bracket", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram("Java", "while (true) x = 1;", "int x;"),
          ),
        Error,
        '"while (...)" must be followed by an opening curly bracket "{"',
      );
    });
  });

  describe("for loop", () => {
    it("throws if 'for' is not followed by an opening bracket", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram("Java", "for int i = 0; i < 3; i = i + 1) {}"),
          ),
        Error,
        '"for" must be followed by an opening bracket "("',
      );
    });

    it("throws if a procedure call is used as the for-loop initialisation", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram("Java", "for (forward(1); true; forward(1)) {}"),
          ),
        Error,
        '"for" conditions must begin with a variable assignment',
      );
    });

    it("throws if the for-loop variable is not an integer", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram("Java", "for (boolean b = true; true; b = false) {}"),
          ),
        Error,
        "Loop variable must be an integer",
      );
    });

    it("throws if the for-loop change is not a variable assignment", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram("Java", "for (int i = 0; i < 3; forward(1)) {}"),
          ),
        Error,
        '"for" loop variable must be changed on each loop',
      );
    });

    it("throws if the for-loop change lexeme is not an identifier/type", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram("Java", "for (int i = 0; i < 3;) {}"),
          ),
        Error,
        '"for" conditions must begin with a variable assignment',
      );
    });

    it("throws if the for-loop changes a different variable than it initialises", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram(
              "Java",
              "for (int i = 0; i < 3; j = j + 1) {}",
              "int j = 0;",
            ),
          ),
        Error,
        "Initial loop variable and change loop variable must be the same",
      );
    });

    it("throws if the for-loop conditions are not followed by a closing bracket", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram("Java", "for (int i = 0; i < 3; i = i + 1 {}"),
          ),
        Error,
        'Closing bracket ")" missing after "for" loop initialisation',
      );
    });

    it("throws if the for-loop is not followed by an opening curly bracket", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram(
              "Java",
              "for (int i = 0; i < 3; i = i + 1) x = i;",
              "int x;",
            ),
          ),
        Error,
        '"for (...)" must be followed by an opening bracket "{"',
      );
    });

    it("parses a for loop and reuses its counter variable", () => {
      const program = parseProgram(
        "Java",
        wrapProgram("Java", "for (int i = 0; i < 3; i = i + 1) {}"),
      );
      const forStatement = bodyStatements("Java", program).find(
        (s) => s.statementType === "forStatement",
      ) as ForStatement | undefined;
      assertExists(forStatement);
      assertEquals(forStatement.initialisation.variable.name, "i");
    });

    it("throws if the for-loop initialisation does not start with an identifier or type", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram("Java", "for (5; true; i = i + 1) {}", "int i;"),
          ),
        Error,
        '"for" conditions must begin with a variable assignment',
      );
    });

    // the three tests below pin down what a truncated "for" really does:
    // none of forStatement.ts's three `!lexemes.get()` guards can fire, for
    // the reason given at the top of this file -- the program's mandatory
    // final "}" always turns up where the missing initialisation/condition/
    // change was expected, so each one reports a wrong-lexeme error instead
    it("throws when the for-loop initialisation is missing entirely", () => {
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "for (")),
        Error,
        '"for" conditions must begin with a variable assignment',
      );
    });

    it("throws when the for-loop condition is missing entirely", () => {
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "for (int i = 0;")),
        Error,
        'Expression cannot begin with "}"',
      );
    });

    it("throws when the for-loop change is missing entirely", () => {
      assertThrows(
        () =>
          parseProgram("Java", wrapProgram("Java", "for (int i = 0; i < 5;")),
        Error,
        '"for" conditions must begin with a variable assignment',
      );
    });
  });

  describe("break and continue statements", () => {
    // encoder-level pcode shape and cross-loop-type back-patching are
    // language-agnostic and covered exhaustively by
    // test/core/compiler/encoder/statements.test.ts against Python source -
    // these tests are only about Java's own parser wiring.

    it("parses 'break' inside a while loop as a breakStatement", () => {
      const program = parseProgram(
        "Java",
        wrapProgram("Java", "while (true) {\nbreak;\n}"),
      );
      const whileStatement = bodyStatements("Java", program)[0] as unknown as {
        statements: { statementType: string }[];
      };
      assertEquals(
        whileStatement.statements[0].statementType,
        "breakStatement",
      );
    });

    it("parses 'continue' inside a for loop as a continueStatement", () => {
      const program = parseProgram(
        "Java",
        wrapProgram(
          "Java",
          "for (int i = 0; i < 3; i = i + 1) {\ncontinue;\n}",
        ),
      );
      const forStatement = bodyStatements("Java", program)[0] as ForStatement;
      assertEquals(
        forStatement.statements[0].statementType,
        "continueStatement",
      );
    });

    it("parses 'break' inside a do-while loop (RepeatStatement)", () => {
      const program = parseProgram(
        "Java",
        wrapProgram("Java", "do {\nbreak;\n} while (true);"),
      );
      const repeatStatement = bodyStatements(
        "Java",
        program,
      )[0] as RepeatStatement;
      assertEquals(
        repeatStatement.statements[0].statementType,
        "breakStatement",
      );
    });

    it("throws if 'break' occurs outside any loop", () => {
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "break;")),
        Error,
        "'break' is only allowed inside a loop.",
      );
    });

    it("throws if 'continue' occurs outside any loop", () => {
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "continue;")),
        Error,
        "'continue' is only allowed inside a loop.",
      );
    });
  });

  describe("variable assignment and identifiers", () => {
    it("parses array element assignment with indexes", () => {
      const program = parseProgram(
        "Java",
        wrapProgram("Java", "arr[1] = 5;", "int[3] arr;"),
      );
      const assignment = bodyStatements("Java", program).find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.indexes.length, 1);
    });

    it("throws when indexing a non-array, non-string variable", () => {
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "x[0] = 1;", "int x;")),
        Error,
        "is not a string or array variable",
      );
    });

    it("parses assignment to a single character of a string variable", () => {
      const program = parseProgram(
        "Java",
        wrapProgram("Java", "s[0] = 'a';", "String s;"),
      );
      const assignment = bodyStatements("Java", program).find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.indexes.length, 1);
    });

    it("throws if a string character index is not followed by a closing bracket", () => {
      assertThrows(
        () =>
          parseProgram("Java", wrapProgram("Java", "s[0 = 'a';", "String s;")),
        Error,
        'Closing bracket "]" missing after string variable index',
      );
    });

    it("throws when too many indexes are given for an array variable", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram("Java", "arr[0][1] = 5;", "int[3] arr;"),
          ),
        Error,
        "Too many indexes for array variable",
      );
    });

    it("allows one index more than its dimensions for an array of strings", () => {
      // a string array gets an extra allowed index, for a character within
      // one of its strings: "strs[1][2]" is the third character of the
      // second string, so a one-dimensional string array takes two indexes
      const program = parseProgram(
        "Java",
        wrapProgram("Java", "strs[1][2] = 'a';", "String[3] strs;"),
      );
      const assignment = bodyStatements("Java", program).find(
        (s) => s.statementType === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.indexes.length, 2);
      assertEquals(assignment.variable.arrayDimensions.length, 1);
    });

    it("throws when a string array gets more than one index past its dimensions", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram("Java", "strs[1][2][3] = 'a';", "String[3] strs;"),
          ),
        Error,
        "Too many indexes for array variable",
      );
    });

    it("throws when a variable is redeclared in the same scope", () => {
      assertThrows(
        () =>
          parseProgram("Java", wrapProgram("Java", "int x = 1;\nint x = 2;")),
        Error,
        "is already defined in the current scope",
      );
    });

    it("throws when a turtle attribute name is used as an identifier", () => {
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "int turtx = 1;")),
        Error,
        "already the name of a predefined Turtle property",
      );
    });

    it("throws when assigning to an undefined identifier", () => {
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "y = 1;")),
        Error,
        "is not defined",
      );
    });

    it("throws if the assignment operator is missing", () => {
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "x 1;", "int x;")),
        Error,
        'Variable must be followed by assignment operator "="',
      );
    });

    it("throws when nothing at all follows the variable", () => {
      // variableAssignment.ts's `!assignmentLexeme` half of the same check
      // can't fire, for the reason given at the top of this file: the "="
      // that's missing here is "found" as a closing brace instead, which
      // fails the operator test rather than the existence test
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "x", "int x;")),
        Error,
        'Variable must be followed by assignment operator "="',
      );
    });

    it("throws when an array index bracket is never closed", () => {
      // likewise for variableAssignment.ts's 'Closing bracket "]" needed
      // after array indexes' guard: the index-collecting loop only exits
      // early on a truly empty lexeme stream, which can't happen -- the
      // closing brace is parsed as (the start of) another index expression
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "arr[", "int[3] arr;")),
        Error,
        'Expression cannot begin with "}"',
      );
    });

    // variableAssignment.ts's own "Variable ... must be assigned a value"
    // check (for a missing value entirely, i.e. `!lexemes.get()`) is not
    // reachable either, for the same structural reason as the block.ts case
    // above: whatever immediately follows "=" at the end of an otherwise
    // truncated program is always at least the mandatory final "}", so
    // parseExpression() reports "Expression cannot begin with \"}\"."
    // instead of this statement ever seeing a true end of input.

    it("throws on a type error in a variable assignment", () => {
      assertThrows(
        () =>
          parseProgram("Java", wrapProgram("Java", 'x = "hello";', "int x;")),
        Error,
        "Type error",
      );
    });
  });

  describe("procedure/function calls", () => {
    it("throws when a function is called as a procedure statement", () => {
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "abs(5);")),
        Error,
        "is a function, not a procedure",
      );
    });

    it("throws when a procedure is called as a function", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            wrapProgram("Java", "int x = forward(1);", "int x;"),
          ),
        Error,
        "is a procedure, not a function",
      );
    });

    it("parses a procedure call with the right number of arguments", () => {
      const program = parseProgram("Java", wrapProgram("Java", "forward(10);"));
      const call = bodyStatements("Java", program).find(
        (s) => s.statementType === "procedureCall",
      ) as ProcedureCall | undefined;
      assertExists(call);
      assertEquals(call.arguments.length, 1);
    });

    it("throws when too few arguments are given", () => {
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "forward();")),
        Error,
        "Too few arguments given",
      );
    });

    it("throws when too many arguments are given", () => {
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "forward(1, 2);")),
        Error,
        "Too many arguments given",
      );
    });
  });

  describe("eosCheck (missing semicolons)", () => {
    it("throws if a simple statement is not followed by a semicolon", () => {
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "int x = 1", "")),
        Error,
        "Statement must be followed by a semicolon",
      );
    });

    it("throws if a return statement is not followed by a semicolon", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nint go () {\nreturn 1\n}\nvoid main () {}\n}",
          ),
        Error,
        "Statement must be followed by a semicolon",
      );
    });
  });

  describe("statements", () => {
    it("throws when a statement begins with something invalid", () => {
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "5;")),
        Error,
        "Statement cannot begin with",
      );
    });

    it("treats a comment as a pass statement", () => {
      const program = parseProgram(
        "Java",
        wrapProgram("Java", "// hello\nint x = 1;"),
      );
      const statements = bodyStatements("Java", program);
      assertEquals(statements[0].statementType, "passStatement");
    });

    it("parses a 'final' constant declared inside a method body", () => {
      // exercises statement.ts's own "final" case (as opposed to
      // java/parser.ts's top-level "final" handling, already covered above)
      const program = parseProgram(
        "Java",
        wrapProgram("Java", "final int X = 5;"),
      );
      const sub = program.subroutines[0];
      assertEquals(sub.constants.length, 1);
      assertEquals(sub.constants[0].value, 5);
    });

    it("throws on a keyword that's valid in Java but not as the start of a statement", () => {
      // "class" is a recognised Java keyword (used for the outer program
      // wrapper), but statement.ts's inner switch on keyword subtypes has no
      // case for it, so it falls through to the generic "cannot begin with"
      // default -- every *other* Java keyword (final/return/if/else/for/do/
      // while) does have its own case, so "class" is the only way to reach
      // that inner default
      assertThrows(
        () => parseProgram("Java", wrapProgram("Java", "class;")),
        Error,
        'Statement cannot begin with "class"',
      );
    });
  });

  describe("constants and variable declarations", () => {
    it("parses a 'final' constant declaration", () => {
      const program = parseProgram(
        "Java",
        "class Test {\nfinal int SIZE = 5;\nvoid main () {}\n}",
      );
      assertEquals(program.constants.length, 1);
      assertEquals(program.constants[0].value, 5);
    });

    it("throws if a declared name is not a valid identifier", () => {
      assertThrows(
        () => parseProgram("Java", "class Test {\nint 5;\nvoid main () {}\n}"),
        Error,
        "is not a valid identifier",
      );
    });

    it("throws when a declaration is truncated to just its type", () => {
      // identifier.ts's '{lex} must be followed by an identifier' guard
      // (`!identifier`) can't fire, for the reason given at the top of this
      // file: the missing name is "found" as the program's final "}", which
      // is a real lexeme of the wrong type. Nor can type.ts's own 'Expected
      // type definition' guard fire, for the same reason -- a type that
      // isn't there is likewise reported as an invalid type, not a missing
      // one (see the malformed parameter list test above)
      assertThrows(
        () => parseProgram("Java", "class Test {\nint }"),
        Error,
        '"}" is not a valid identifier',
      );
    });

    it("throws when a constant is declared void", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nfinal void X = 1;\nvoid main () {}\n}",
          ),
        Error,
        "Constant type cannot be void",
      );
    });

    it("throws if a constant is declared as an array", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nfinal int[3] X = 1;\nvoid main () {}\n}",
          ),
        Error,
        "Constant cannot be an array",
      );
    });

    it("throws if a constant is not assigned a value", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nfinal int X;\nvoid main () {}\n}",
          ),
        Error,
        "must be assigned a value",
      );
    });

    it("throws if a constant declaration is truncated after its name", () => {
      // constant.ts's `!lexemes.get()` half of the "must be assigned a
      // value" check can't fire, for the reason given at the top of this
      // file -- the missing "=" is "found" as the program's final "}"
      assertThrows(
        () => parseProgram("Java", "class Test {\nfinal int X }"),
        Error,
        "Constant X must be assigned a value",
      );
    });

    it("parses an array variable declaration", () => {
      const program = parseProgram(
        "Java",
        "class Test {\nint[10] arr;\nvoid main () {}\n}",
      );
      const arr = program.variables.find((v) => v.name === "arr");
      assertExists(arr);
      assertEquals(arr.arrayDimensions.length, 1);
    });

    it("throws when an array size is zero or negative", () => {
      assertThrows(
        () =>
          parseProgram("Java", "class Test {\nint[0] arr;\nvoid main () {}\n}"),
        Error,
        "Array size must be positive",
      );
    });

    it("throws when an array size expression evaluates to a string", () => {
      // reachable via a character reference into a string constant: indexing
      // a string constant ("C[0]") gives an expression of type "character"
      // (which typeCheck happily accepts where an integer is expected), but
      // evaluate() ignores the index and just returns the constant's whole
      // underlying string value, which is then rejected here as non-integer
      assertThrows(
        () =>
          parseProgram(
            "Java",
            'class Test {\nfinal String C = "hello";\nint[C[0]] arr;\nvoid main () {}\n}',
          ),
        Error,
        "Array size must be an integer",
      );
    });

    it("throws when a variable is declared void", () => {
      assertThrows(
        () => parseProgram("Java", "class Test {\nvoid x;\nvoid main () {}\n}"),
        Error,
        "Variable cannot be void",
      );
    });

    it("parses a custom string length declaration", () => {
      const program = parseProgram(
        "Java",
        "class Test {\nString(10) s;\nvoid main () {}\n}",
      );
      const s = program.variables.find((v) => v.name === "s");
      assertExists(s);
      assertEquals(s.stringLength, 10);
    });

    // type.ts's "Expected string size specification" guard (for a missing
    // size entirely, i.e. `!integer`) is not reachable via the public API,
    // for the same structural reason as the block.ts/variableAssignment.ts
    // cases above: whatever immediately follows "(" is always at least the
    // mandatory final "}", so the size lexeme is never actually absent --
    // "String()" hits the very next check instead ("size must be an
    // integer", since ")" isn't an integer literal), as below.
    it("throws if the string size is not an integer literal (immediate closing bracket)", () => {
      assertThrows(
        () =>
          parseProgram("Java", "class Test {\nString() s;\nvoid main () {}\n}"),
        Error,
        "String size must be an integer",
      );
    });

    it("throws if the string size is not an integer literal", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            'class Test {\nString("a") s;\nvoid main () {}\n}',
          ),
        Error,
        "String size must be an integer",
      );
    });

    it("throws if the string size is zero", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nString(0) s;\nvoid main () {}\n}",
          ),
        Error,
        "String size must be greater than zero",
      );
    });

    // as with every other pair of checks in type.ts, only the
    // wrong-lexeme half of the closing-bracket check below is reachable:
    // the `!lexemes.get()` half would need the size literal to be the very
    // last lexeme of the program, which program.ts already rules out
    it("throws if the string size specification is not followed by a closing bracket", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nString(10 s;\nvoid main () {}\n}",
          ),
        Error,
        'Closing bracket ")" missing after string size specification',
      );
    });

    // type.ts's "Opening bracket \"[\" must be followed by an array size"
    // guard (`!lexemes.get()`) is likewise unreachable: "int[]" finds "]"
    // right there (a real, if wrong, lexeme), so parseExpression() reports
    // "Expression cannot begin with \"]\"." instead.
    it("throws if an array dimension expression is empty", () => {
      assertThrows(
        () =>
          parseProgram("Java", "class Test {\nint[] arr;\nvoid main () {}\n}"),
        Error,
        'Expression cannot begin with "]"',
      );
    });

    // ditto for the array-size closing bracket: an array size expression
    // can never consume the program's final "}", so there is always some
    // lexeme left for this check to reject
    it("throws if an array dimension is not followed by a closing bracket", () => {
      assertThrows(
        () =>
          parseProgram("Java", "class Test {\nint[5 arr;\nvoid main () {}\n}"),
        Error,
        'Array size specification must be followed by closing bracket "]"',
      );
    });

    it("throws when an array is declared void", () => {
      assertThrows(
        () =>
          parseProgram(
            "Java",
            "class Test {\nvoid[5] arr;\nvoid main () {}\n}",
          ),
        Error,
        "Array of void is not allowed",
      );
    });
  });
});
