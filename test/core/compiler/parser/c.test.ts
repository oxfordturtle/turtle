import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertExists, assertThrows } from "@std/assert";
import type {
  Expression,
  ForStatement,
  IfStatement,
  ProcedureCall,
  RepeatStatement,
  ReturnStatement,
  VariableAssignment,
} from "@/core/compiler.ts";
import { bodyStatements, parseProgram } from "./lib/programs.ts";

/**
 * C-specific parser tests: syntax that's too divergent for the shared
 * cross-language table in common.test.ts (brace blocks, "void main ()" as
 * the required entry point, C-only do-while loops, type casting, and the
 * address-of operator) plus error paths for every major statement kind.
 */

describe("parse: C", () => {
  describe("program structure", () => {
    it("throws if the program does not contain a main method", () => {
      assertThrows(
        () => parseProgram("C", "void go () {\n}"),
        Error,
        'Program does not contain any "main" method.',
      );
    });

    it("parses a minimal main method", () => {
      const program = parseProgram("C", "void main () {\n}");
      assertEquals(program.language, "C");
      assertEquals(program.subroutines.length, 1);
      assertEquals(program.subroutines[0]?.name, "main");
    });

    it("throws on a non-const keyword at top level", () => {
      assertThrows(
        () => parseProgram("C", "if (true) {\n}\nvoid main () {\n}"),
        Error,
        "Program can only contain constant definitions, variable declarations, and subroutine",
      );
    });

    it("skips comments between top-level declarations", () => {
      // c/parser.ts's first (hoisting) pass switches on the lexeme type, so
      // without its own "comment" arm a comment anywhere above, between, or
      // below the declarations would hit the default arm and throw "Program
      // can only contain constant definitions, ...".
      const program = parseProgram(
        "C",
        "// intro\nconst int size = 5;\n// the counter\nint x = 1;\n// the entry point\nvoid main () {\n}\n// the end",
      );
      assertEquals(
        program.constants.map((c) => c.name),
        ["size"],
      );
      assertExists(program.variables.find((v) => v.name === "x"));
      assertEquals(
        program.subroutines.map((s) => s.name),
        ["main"],
      );
    });

    it("throws on a bare statement at top level", () => {
      // top-level lexemes are only ever switched on "keyword" or "type" -- a
      // bare identifier (e.g. a variable assignment with no type prefix, or
      // a procedure call) falls through to the generic default-case error
      assertThrows(
        () => parseProgram("C", "foo;\nvoid main () {\n}"),
        Error,
        "Program can only contain constant definitions, variable declarations, and subroutine",
      );
    });
  });

  describe("constants and variable declarations at top level", () => {
    it("parses a const definition", () => {
      const program = parseProgram(
        "C",
        "const int size = 5;\nvoid main () {\n}",
      );
      assertEquals(program.constants.length, 1);
      assertEquals(program.constants[0]?.name, "size");
      assertEquals(program.constants[0]?.value, 5);
    });

    it("throws when a constant is redeclared in the current scope", () => {
      assertThrows(
        () =>
          parseProgram(
            "C",
            "const int x = 1;\nconst int x = 2;\nvoid main () {\n}",
          ),
        Error,
        "is already defined in the current scope",
      );
    });

    it("throws when a constant is declared as an array", () => {
      assertThrows(
        () => parseProgram("C", "const int x[5] = 1;\nvoid main () {\n}"),
        Error,
        "Constant cannot be an array.",
      );
    });

    it("throws when a constant is not assigned a value", () => {
      assertThrows(
        () => parseProgram("C", "const int x;\nvoid main () {\n}"),
        Error,
        "must be assigned a value",
      );
    });

    it("throws when a constant is declared void", () => {
      assertThrows(
        () => parseProgram("C", "const void x = 1;\nvoid main () {\n}"),
        Error,
        "Constant type cannot be void",
      );
    });

    it("throws when a constant definition runs out of lexemes before a value", () => {
      assertThrows(
        () => parseProgram("C", "const int x"),
        Error,
        "must be assigned a value",
      );
    });

    it("throws when a constant definition runs out of lexemes before an identifier", () => {
      assertThrows(
        () => parseProgram("C", "const int"),
        Error,
        "must be followed by an identifier",
      );
    });

    it("parses a const definition inside a subroutine body", () => {
      const program = parseProgram("C", "void main () {\nconst int x = 5;\n}");
      const sub = program.subroutines[0];
      assertEquals(sub?.constants.length, 1);
      assertEquals(sub?.constants[0]?.value, 5);
      assertEquals(sub?.statements[0]?.kind, "passStatement");
    });

    it("parses a top-level variable declaration with no assignment", () => {
      const program = parseProgram("C", "int x;\nvoid main () {\n}");
      const variable = program.variables.find((v) => v.name === "x");
      assertExists(variable);
      assertEquals(program.statements[0]?.kind, "passStatement");
    });

    it("parses a top-level variable declaration with an assignment", () => {
      const program = parseProgram("C", "int x = 5;\nvoid main () {\n}");
      const assignment = program.statements.find(
        (s) => s.kind === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.variable.name, "x");
    });

    it("throws when a variable is redeclared in the current scope", () => {
      assertThrows(
        () => parseProgram("C", "int x = 1;\nint x = 2;\nvoid main () {\n}"),
        Error,
        "is already defined in the current scope",
      );
    });

    it("throws when a turtle property name is used as an identifier", () => {
      assertThrows(
        () => parseProgram("C", "int turtx = 1;\nvoid main () {\n}"),
        Error,
        "already the name of a predefined Turtle property",
      );
    });

    it("throws when a variable is declared void", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nvoid x;\n}"),
        Error,
        "Variable cannot be void",
      );
    });

    it("parses a pointer variable declaration", () => {
      // pointer syntax ("*") is only handled by the shared variable()
      // parser used inside subroutine bodies -- the top-level dispatcher in
      // c/parser.ts calls type() and identifier() directly, which don't
      // understand "*", so a top-level "int* p;" would (mis)parse "*" as
      // the identifier itself and fail
      const program = parseProgram("C", "void main () {\nint* p;\n}");
      const statements = bodyStatements("C", program);
      const sub = program.subroutines[0];
      const variable = sub?.variables.find((v) => v.name === "p");
      assertExists(variable);
      assert(variable.isPointer);
      assertEquals(statements[0]?.kind, "passStatement");
    });

    it("parses an array variable declaration", () => {
      const program = parseProgram("C", "int arr[5];\nvoid main () {\n}");
      const variable = program.variables.find((v) => v.name === "arr");
      assertExists(variable);
      assertEquals(variable.arrayDimensions, [[0, 4]]);
    });

    it("throws when an array size is not positive", () => {
      assertThrows(
        () => parseProgram("C", "int arr[0];\nvoid main () {\n}"),
        Error,
        "Array size must be positive.",
      );
    });

    it("throws when an array size evaluates to a string", () => {
      // the type check in front of evaluate() only rules out an expression
      // whose *declared* type isn't integer-compatible. A C cast is applied
      // to the expression's type without touching its value, so "(int)"hi""
      // arrives here typed "integer" but still evaluates to the string "hi"
      // -- which is what this check is for.
      assertThrows(
        () => parseProgram("C", 'int arr[(int)"hi"];\nvoid main () {\n}'),
        Error,
        "Array size must be an integer.",
      );
    });

    it("throws when an array size is an indexed string constant", () => {
      // the other route to the same check: getType() reports an indexed
      // string constant as a "character" (accepted where an integer is
      // expected), but evaluate() ignores the index and hands back the
      // constant's whole string value
      assertThrows(
        () =>
          parseProgram(
            "C",
            'const string msg = "abc";\nint arr[msg[0]];\nvoid main () {\n}',
          ),
        Error,
        "Array size must be an integer.",
      );
    });

    it("throws when an array is declared void", () => {
      // C's array brackets come after the variable name, not as part of
      // the type specification, so the earlier "Variable cannot be void"
      // check catches this before array dimensions are even parsed
      assertThrows(
        () => parseProgram("C", "void main () {\nvoid arr[5];\n}"),
        Error,
        "Variable cannot be void",
      );
    });

    it("throws when an array declaration is missing its opening bracket content", () => {
      assertThrows(
        () => parseProgram("C", "int arr["),
        Error,
        "must be followed by an array size",
      );
    });

    it("throws when an array declaration is missing its closing bracket (eof)", () => {
      assertThrows(
        () => parseProgram("C", "int arr[5"),
        Error,
        'must be followed by closing bracket "]"',
      );
    });

    it("throws when an array declaration is missing its closing bracket (wrong token)", () => {
      assertThrows(
        () => parseProgram("C", "int arr[5 x;\nvoid main () {\n}"),
        Error,
        'must be followed by closing bracket "]"',
      );
    });

    it("parses a fixed-length string declaration", () => {
      const program = parseProgram("C", "string[10] s;\nvoid main () {\n}");
      const variable = program.variables.find((v) => v.name === "s");
      assertExists(variable);
      assertEquals(variable.stringLength, 10);
    });

    it("throws when a string length specification runs out of lexemes", () => {
      assertThrows(
        () => parseProgram("C", "string["),
        Error,
        "Expecting string size specification.",
      );
    });

    it("throws when a string length is not an integer literal", () => {
      assertThrows(
        () => parseProgram("C", "string[s] x;\nvoid main () {\n}"),
        Error,
        "String size must be an integer.",
      );
    });

    it("throws when a string length is not greater than zero", () => {
      assertThrows(
        () => parseProgram("C", "string[0] x;\nvoid main () {\n}"),
        Error,
        "String size must be greater than zero.",
      );
    });

    it("throws when a string length specification is missing its closing bracket (eof)", () => {
      assertThrows(
        () => parseProgram("C", "string[10"),
        Error,
        'Closing bracket "]" missing after string size specification.',
      );
    });

    it("throws when a string length specification is missing its closing bracket (wrong token)", () => {
      assertThrows(
        () => parseProgram("C", "string[10 x;\nvoid main () {\n}"),
        Error,
        'Closing bracket "]" missing after string size specification.',
      );
    });

    it("throws when a type keyword is not followed by a valid identifier", () => {
      assertThrows(
        () => parseProgram("C", "int 5 = 1;\nvoid main () {\n}"),
        Error,
        "is not a valid identifier",
      );
    });

    it("throws when a type definition runs out of lexemes", () => {
      assertThrows(
        () => parseProgram("C", "const"),
        Error,
        "Expected type definition",
      );
    });

    it("throws when a type definition is not a valid type keyword", () => {
      assertThrows(
        () => parseProgram("C", "const 5 = 1;\nvoid main () {\n}"),
        Error,
        "is not a valid type definition",
      );
    });
  });

  describe("subroutine and function definitions", () => {
    it("parses a void procedure with a parameter", () => {
      const program = parseProgram(
        "C",
        "void go (int n) {\nint x = n;\n}\nvoid main () {\n}",
      );
      const sub = program.subroutines.find((s) => s.name === "go");
      assertExists(sub);
      const parameter = sub.variables.find((v) => v.isParameter);
      assertExists(parameter);
      assertEquals(parameter.name, "n");
      assertEquals(parameter.type, "integer");
    });

    it("parses a typed function with a return statement", () => {
      const program = parseProgram(
        "C",
        "int addOne (int n) {\nreturn n + 1;\n}\nvoid main () {\nint x = addOne(2);\n}",
      );
      const sub = program.subroutines.find((s) => s.name === "addOne");
      assertExists(sub);
      assert(sub.hasReturnStatement);
      const result = sub.variables.find((v) => v.name === "!result");
      assertExists(result);
      assertEquals(result.type, "integer");
      const returnStatement = sub.statements.find(
        (s) => s.kind === "returnStatement",
      ) as ReturnStatement | undefined;
      assertExists(returnStatement);

      const mainSub = program.subroutines.find((s) => s.name === "main");
      const assignment = mainSub?.statements.find(
        (s) => s.kind === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.kind, "function");
    });

    it("throws on a return type mismatch", () => {
      assertThrows(
        () =>
          parseProgram(
            "C",
            "int addOne (int n) {\nreturn true;\n}\nvoid main () {\n}",
          ),
        Error,
        "Type error",
      );
    });

    it("throws when a void method contains a return statement", () => {
      assertThrows(
        () =>
          parseProgram("C", "void go () {\nreturn 1;\n}\nvoid main () {\n}"),
        Error,
        "Procedures cannot return a value",
      );
    });

    it("throws when the program has no main subroutine among several", () => {
      assertThrows(
        () =>
          parseProgram("C", "void go () {\n}\nint getFive () {\nreturn 5;\n}"),
        Error,
        'Program does not contain any "main" method.',
      );
    });

    it("calls a custom void method as a procedure", () => {
      const program = parseProgram(
        "C",
        "void go (int n) {\nint x = n;\n}\nvoid main () {\ngo(5);\n}",
      );
      const mainSub = program.subroutines.find((s) => s.name === "main");
      const call = mainSub?.statements.find(
        (s) => s.kind === "procedureCall",
      ) as ProcedureCall | undefined;
      assertExists(call);
    });

    it("throws when a subroutine's parameters are not followed by an opening brace", () => {
      assertThrows(
        () => parseProgram("C", "void go (int n) ;\nvoid main () {\n}"),
        Error,
        'Method parameters must be followed by an opening bracket "{".',
      );
    });

    it("throws when a subroutine's parameters run out of lexemes before an opening brace", () => {
      assertThrows(
        () => parseProgram("C", "void go (int n)"),
        Error,
        'Method parameters must be followed by an opening bracket "{".',
      );
    });

    it("parses a subroutine with multiple parameters", () => {
      const program = parseProgram(
        "C",
        "int add (int a, int b) {\nreturn a + b;\n}\nvoid main () {\nint x = add(1, 2);\n}",
      );
      const sub = program.subroutines.find((s) => s.name === "add");
      assertExists(sub);
      assertEquals(sub.variables.filter((v) => v.isParameter).length, 2);
    });
  });

  describe("do-while loop", () => {
    it("parses a do-while loop, negating the condition internally", () => {
      const program = parseProgram(
        "C",
        "int x = 0;\nvoid main () {\ndo {\nx = x + 1;\n} while (x < 3);\n}",
      );
      const sub = program.subroutines[0];
      const repeatStatement = sub?.statements.find(
        (s) => s.kind === "repeatStatement",
      ) as RepeatStatement | undefined;
      assertExists(repeatStatement);
      assertEquals(repeatStatement.statements.length, 1);
      // the parsed "x < 3" condition is wrapped in a logical "not", because
      // a RepeatStatement's condition means "stop when true", whereas C's
      // "do { } while (...)" means "keep going while true"
      const condition = repeatStatement.condition as Expression;
      assertEquals(condition.kind, "compound");
      if (condition.kind === "compound") {
        assertEquals(condition.operator, "not");
        assertEquals(condition.left, null);
        assertEquals(condition.right.kind, "compound");
        if (condition.right.kind === "compound") {
          assertEquals(condition.right.operator, "less");
        }
      }
    });

    it('throws when "do" is not followed by an opening bracket', () => {
      assertThrows(
        () => parseProgram("C", "void main () {\ndo x = 1;\nwhile (true);\n}"),
        Error,
        '"do" must be followed by an opening bracket "{".',
      );
    });

    it('throws when "do { ... }" is not followed by "while"', () => {
      assertThrows(
        () => parseProgram("C", "void main () {\ndo {\nint x = 1;\n}\n}"),
        Error,
        '"do { ... }" must be followed by "while".',
      );
    });

    it('throws when "while" is not followed by an opening bracket', () => {
      assertThrows(
        () =>
          parseProgram(
            "C",
            "int x = 0;\nvoid main () {\ndo {\nx = 1;\n} while true;\n}",
          ),
        Error,
        '"while" must be followed by an opening bracket "(".',
      );
    });

    it('throws when "while (" runs out of lexemes before a condition', () => {
      assertThrows(
        () =>
          parseProgram(
            "C",
            "int x = 0;\nvoid main () {\ndo {\nx = 1;\n} while (",
          ),
        Error,
        '"while (" must be followed by a boolean expression.',
      );
    });

    it("throws when the do-while condition is missing its closing bracket", () => {
      assertThrows(
        () =>
          parseProgram(
            "C",
            "int x = 0;\nvoid main () {\ndo {\nx = 1;\n} while (true;\n}",
          ),
        Error,
        '"while (..." must be followed by a closing bracket ")".',
      );
    });

    it("throws when the do-while statement is missing its closing semicolon", () => {
      assertThrows(
        () =>
          parseProgram(
            "C",
            "int x = 0;\nvoid main () {\ndo {\nx = 1;\n} while (true)\n}",
          ),
        Error,
        "Statement must be followed by a semicolon.",
      );
    });
  });

  describe("type casting", () => {
    it("parses a boolean value cast to an integer", () => {
      const program = parseProgram(
        "C",
        "void main () {\nint x = (int)true;\n}",
      );
      const statements = bodyStatements("C", program);
      const assignment = statements.find(
        (s) => s.kind === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.kind, "cast");
      if (assignment.value.kind === "cast") {
        assertEquals(assignment.value.type, "integer");
      }
    });

    it("parses a matching cast without wrapping it (found type already equals cast type)", () => {
      const program = parseProgram("C", "void main () {\nint x = (int)5;\n}");
      const statements = bodyStatements("C", program);
      const assignment = statements.find(
        (s) => s.kind === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      // int cast of an already-integer expression is returned unwrapped
      assertEquals(assignment.value.kind, "integer");
    });

    it("throws when casting an expression as void", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nint x = (void)5;\n}"),
        Error,
        "Expression cannot be cast as void",
      );
    });

    it("throws when a character is cast as a boolean", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nbool b = (bool)'a';\n}"),
        Error,
        "Characters cannot be cast as booleans.",
      );
    });

    it("throws when a string is cast as a boolean", () => {
      assertThrows(
        () => parseProgram("C", 'void main () {\nbool b = (bool)"hi";\n}'),
        Error,
        "Strings cannot be cast as booleans.",
      );
    });

    it("throws when a boolean is cast as a string", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nstring s = (string)true;\n}"),
        Error,
        "Booleans cannot be cast as strings.",
      );
    });

    it("throws when a boolean is cast as a character", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nchar c = (char)true;\n}"),
        Error,
        "Booleans cannot be cast as characters.",
      );
    });

    it("throws when a string is cast as a character", () => {
      assertThrows(
        () => parseProgram("C", 'void main () {\nchar c = (char)"hi";\n}'),
        Error,
        "Strings cannot be cast as characters.",
      );
    });

    it("throws when the cast type is missing its closing bracket", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nint x = (int 5);\n}"),
        Error,
        'Type in type cast expression must be followed by a closing bracket ")".',
      );
    });
  });

  describe("address-of operator", () => {
    it("parses the address of a variable", () => {
      const program = parseProgram(
        "C",
        "int x = 1;\nvoid main () {\nint* p = &x;\n}",
      );
      const statements = bodyStatements("C", program);
      const assignment = statements.find(
        (s) => s.kind === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.value.kind, "address");
      if (assignment.value.kind === "address") {
        assertEquals(assignment.value.type, "integer");
      }
    });

    it("throws when the address operator is not followed by a variable", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nint x = &5;\n}"),
        Error,
        'Address operator "&" must be followed by a variable.',
      );
    });
  });

  describe("if / else", () => {
    it('throws when "if" is not followed by an opening bracket', () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nif true {\n}\n}"),
        Error,
        '"if" must be followed by an opening bracket "(".',
      );
    });

    it('throws when "if (" runs out of lexemes before a condition', () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nif ("),
        Error,
        '"if (" must be followed by a Boolean expression.',
      );
    });

    it("throws when the if condition is missing its closing bracket", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nif (true {\n}\n}"),
        Error,
        '"if (..." must be followed by a closing bracket ")".',
      );
    });

    it('throws when "if (...)" is not followed by an opening brace', () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nif (true)\nx = 1;\n}"),
        Error,
        '"if (...)" must be followed by an opening curly bracket "{".',
      );
    });

    it('throws when "else" is not followed by an opening brace', () => {
      assertThrows(
        () =>
          parseProgram("C", "void main () {\nif (true) {\n} else\nx = 1;\n}"),
        Error,
        '"else" must be followed by an opening bracket "{".',
      );
    });

    it('throws when "else" has no matching "if"', () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nelse {\n}\n}"),
        Error,
        'Statement cannot begin with "else". If you have an "if" above, you may be missing a closing bracket "}".',
      );
    });

    it("parses an if statement with no else block", () => {
      const program = parseProgram(
        "C",
        "void main () {\nif (true) {\nint x = 1;\n}\n}",
      );
      const statements = bodyStatements("C", program);
      const ifStatement = statements.find((s) => s.kind === "ifStatement") as
        | IfStatement
        | undefined;
      assertExists(ifStatement);
      assertEquals(ifStatement.elseStatements.length, 0);
    });
  });

  describe("while loop", () => {
    it('throws when "while" is not followed by an opening bracket', () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nwhile true {\n}\n}"),
        Error,
        '"while" must be followed by an opening bracket "(".',
      );
    });

    it('throws when "while (" runs out of lexemes before a condition', () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nwhile ("),
        Error,
        '"while (" must be followed by a Boolean expression.',
      );
    });

    it("throws when the while condition is missing its closing bracket", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nwhile (true {\n}\n}"),
        Error,
        '"while (..." must be followed by a closing bracket ")".',
      );
    });

    it('throws when "while (...)" is not followed by an opening brace', () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nwhile (true)\n}"),
        Error,
        '"while (...)" must be followed by an opening curly bracket "{".',
      );
    });
  });

  describe("for loop", () => {
    it('throws when "for" is not followed by an opening bracket', () => {
      assertThrows(
        () =>
          parseProgram(
            "C",
            "void main () {\nfor int i = 0; i < 3; i = i + 1) {\n}\n}",
          ),
        Error,
        '"for" must be followed by an opening bracket "(".',
      );
    });

    it('throws when "for (" runs out of lexemes before the initialisation', () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nfor ("),
        Error,
        '"for" conditions must begin with a variable assignment.',
      );
    });

    it('throws when the "for" initialisation is not a variable assignment (wrong lexeme type)', () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nfor (; true;) {\n}\n}"),
        Error,
        '"for" conditions must begin with a variable assignment.',
      );
    });

    it('throws when the "for" initialisation is a procedure call rather than an assignment', () => {
      assertThrows(
        () =>
          parseProgram("C", "void main () {\nfor (forward(1); true;) {\n}\n}"),
        Error,
        '"for" conditions must begin with a variable assignment.',
      );
    });

    it("throws when the for loop counter is not an integer", () => {
      assertThrows(
        () =>
          parseProgram(
            "C",
            "void main () {\nfor (bool flag = true; flag; flag = false) {\n}\n}",
          ),
        Error,
        "Loop variable must be an integer.",
      );
    });

    it('throws when "for (...;" runs out of lexemes before a condition', () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nfor (int i = 0;"),
        Error,
        '"for (...;" must be followed by a loop condition.',
      );
    });

    it("throws when the for loop change clause is missing (eof)", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nfor (int i = 0; i < 3;"),
        Error,
        '"for" conditions must begin with a variable assignment.',
      );
    });

    it("throws when the for loop change clause starts with the wrong lexeme type", () => {
      assertThrows(
        () =>
          parseProgram(
            "C",
            "void main () {\nfor (int i = 0; i < 3; 5) {\n}\n}",
          ),
        Error,
        '"for" conditions must begin with a variable assignment.',
      );
    });

    it("throws when the for loop change clause is not a variable assignment", () => {
      assertThrows(
        () =>
          parseProgram(
            "C",
            "void main () {\nfor (int i = 0; i < 3; forward(1)) {\n}\n}",
          ),
        Error,
        '"for" loop variable must be changed on each loop.',
      );
    });

    it("throws when the for loop change clause changes a different variable", () => {
      assertThrows(
        () =>
          parseProgram(
            "C",
            "int j = 0;\nvoid main () {\nfor (int i = 0; i < 3; j = j + 1) {\n}\n}",
          ),
        Error,
        "Initial loop variable and change loop variable must be the same.",
      );
    });

    it("throws when the for loop is missing its closing bracket", () => {
      assertThrows(
        () =>
          parseProgram(
            "C",
            "void main () {\nfor (int i = 0; i < 3; i = i + 1 {\n}\n}",
          ),
        Error,
        'Closing bracket ")" missing after "for" loop initialisation.',
      );
    });

    it('throws when "for (...)" is not followed by an opening brace', () => {
      assertThrows(
        () =>
          parseProgram(
            "C",
            "void main () {\nfor (int i = 0; i < 3; i = i + 1)\n}",
          ),
        Error,
        '"for (...)" must be followed by an opening bracket "{".',
      );
    });

    it("parses a for loop", () => {
      const program = parseProgram(
        "C",
        "void main () {\nfor (int i = 0; i < 3; i = i + 1) {\nint x = i;\n}\n}",
      );
      const statements = bodyStatements("C", program);
      const forStatement = statements.find((s) => s.kind === "forStatement") as
        | ForStatement
        | undefined;
      assertExists(forStatement);
      assertEquals(forStatement.initialisation.variable.name, "i");
      assertEquals(
        forStatement.change.variable,
        forStatement.initialisation.variable,
      );
    });
  });

  describe("break and continue statements", () => {
    // encoder-level pcode shape (jump targets) and cross-loop-type
    // back-patching are language-agnostic and covered exhaustively by
    // test/core/compiler/encoder/statements.test.ts against Python source -
    // these tests are only about C's own parser wiring: the keyword
    // exists, produces the right statement type, respects loop nesting,
    // and rejects use outside a loop.

    it("parses 'break' inside a while loop as a breakStatement", () => {
      const program = parseProgram(
        "C",
        "void main () {\nwhile (true) {\nbreak;\n}\n}",
      );
      const statements = bodyStatements("C", program);
      const whileStatement = statements[0] as unknown as {
        statements: { kind: string }[];
      };
      assertEquals(whileStatement.statements[0]?.kind, "breakStatement");
    });

    it("parses 'continue' inside a for loop as a continueStatement", () => {
      const program = parseProgram(
        "C",
        "void main () {\nfor (int i = 0; i < 3; i = i + 1) {\ncontinue;\n}\n}",
      );
      const forStatement = bodyStatements("C", program)[0] as ForStatement;
      assertEquals(forStatement.statements[0]?.kind, "continueStatement");
    });

    it("parses 'break' inside a do-while loop (RepeatStatement)", () => {
      const program = parseProgram(
        "C",
        "void main () {\ndo {\nbreak;\n} while (true);\n}",
      );
      const repeatStatement = bodyStatements(
        "C",
        program,
      )[0] as RepeatStatement;
      assertEquals(repeatStatement.statements[0]?.kind, "breakStatement");
    });

    it("throws if 'break' occurs outside any loop", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nbreak;\n}"),
        Error,
        "'break' is only allowed inside a loop.",
      );
    });

    it("throws if 'continue' occurs outside any loop", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\ncontinue;\n}"),
        Error,
        "'continue' is only allowed inside a loop.",
      );
    });

    it("throws if 'break' occurs inside an 'if' that is itself outside any loop", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nif (true) {\nbreak;\n}\n}"),
        Error,
        "'break' is only allowed inside a loop.",
      );
    });

    it("requires a trailing semicolon, like any other statement", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nwhile (true) {\nbreak\n}\n}"),
        Error,
        "Statement must be followed by a semicolon.",
      );
    });
  });

  describe("statement blocks", () => {
    it("throws when a block is missing its closing bracket", () => {
      assertThrows(
        () =>
          parseProgram("C", "int x;\nvoid main () {\nif (true) {\nx = 1;\n"),
        Error,
        'Closing bracket "}" missing after statement block.',
      );
    });

    // Note: statement.ts's `default` case inside the "keyword" switch arm
    // ("Statement cannot begin with {lex}." for an unhandled keyword
    // subtype) is dead code for C specifically: C's entire keyword list
    // (src/core/constants/keywords.ts) is exactly
    // if/else/for/while/do/const/return/break/continue, and every one of
    // those has its own explicit case above it. The outer `default` (any
    // lexeme type that isn't comment/identifier/type/keyword) is
    // reachable, and is exercised below.

    it("throws on a statement starting with an unexpected delimiter", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\n)\n}"),
        Error,
        "Statement cannot begin with",
      );
    });

    it("ignores a comment as a pass statement", () => {
      const program = parseProgram("C", "void main () {\n// hello\n}");
      const statements = bodyStatements("C", program);
      assertEquals(statements.length, 1);
      assertEquals(statements[0]?.kind, "passStatement");
    });
  });

  describe("variable assignment", () => {
    it("throws when indexing a non-array, non-string variable", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nint x = 1;\nx[0] = 5;\n}"),
        Error,
        "is not a string or array variable",
      );
    });

    it("throws when too many indexes are given for an array variable", () => {
      assertThrows(
        () =>
          parseProgram("C", "int arr[5];\nvoid main () {\narr[0][0] = 1;\n}"),
        Error,
        "Too many indexes for array variable",
      );
    });

    it("throws when too many indexes are given for a string array variable", () => {
      // for a string array, one extra index (beyond the array dimensions) is
      // allowed, to pick out a character within the string at that element
      assertThrows(
        () =>
          parseProgram(
            "C",
            "string[10] arr[3];\nvoid main () {\narr[0][1][2] = 'a';\n}",
          ),
        Error,
        "Too many indexes for array variable",
      );
    });

    it("throws when array indexes run out of lexemes before a closing bracket", () => {
      assertThrows(
        () => parseProgram("C", "int arr[5];\nvoid main () {\narr[0"),
        Error,
        'Closing bracket "]" needed after array indexes.',
      );
    });

    it("parses a string variable character index assignment", () => {
      const program = parseProgram(
        "C",
        "string[10] s;\nvoid main () {\ns[0] = 'a';\n}",
      );
      const statements = bodyStatements("C", program);
      const assignment = statements.find(
        (s) => s.kind === "variableAssignment",
      ) as VariableAssignment | undefined;
      assertExists(assignment);
      assertEquals(assignment.indexes.length, 1);
    });

    it("throws when a string index assignment is missing its closing bracket", () => {
      assertThrows(
        () => parseProgram("C", "string[10] s;\nvoid main () {\ns[0 = 'a';\n}"),
        Error,
        'Closing bracket "]" missing after string variable index.',
      );
    });

    it("throws when a variable is not followed by the assignment operator (wrong token)", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nint x = 1;\nx;\n}"),
        Error,
        'Variable must be followed by assignment operator "=".',
      );
    });

    it("throws when a variable assignment runs out of lexemes before the operator", () => {
      // truncating right after "x" at the top of main's own body doesn't
      // reach this check: the subroutine's second-pass loop bound
      // (subroutine.end, computed by the unclosed-brace scan in
      // subroutine.ts) ends up one token short when main's braces never
      // balance, so the dangling "x" statement is silently never parsed at
      // all. Nesting it inside an if-block sidesteps that -- parseBlock
      // keeps calling parseStatement regardless of subroutine.end -- and
      // reaches genuine end-of-lexemes inside parseVariableAssignment.
      assertThrows(
        () => parseProgram("C", "void main () {\nint x = 1;\nif (true) {\nx"),
        Error,
        'Variable must be followed by assignment operator "=".',
      );
    });

    it("throws when a variable assignment runs out of lexemes before a value", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nint x = 1;\nx ="),
        Error,
        'Variable "x" must be assigned a value.',
      );
    });

    it("throws when an assigned identifier is not defined", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nfoo = 1;\n}"),
        Error,
        "is not defined",
      );
    });
  });

  describe("procedure and function calls", () => {
    it("parses a zero-parameter command call with brackets", () => {
      const program = parseProgram("C", "void main () {\nhome();\n}");
      const statements = bodyStatements("C", program);
      const call = statements.find((s) => s.kind === "procedureCall") as
        | ProcedureCall
        | undefined;
      assertExists(call);
      assertEquals(call.arguments.length, 0);
    });

    it("throws when a zero-parameter command call is missing its opening bracket", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nhome;\n}"),
        Error,
        "Opening bracket missing after command",
      );
    });

    it("throws when a zero-parameter command call is missing its closing bracket", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nhome(;\n}"),
        Error,
        "Closing bracket missing after command",
      );
    });

    it("throws when a zero-parameter command is given an argument", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nhome(5);\n}"),
        Error,
        "takes no arguments",
      );
    });

    it("throws when a command with parameters is called with no opening bracket", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nforward;\n}"),
        Error,
        "Opening bracket missing after command",
      );
    });

    it("throws when too few arguments are given", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\ndrawxy(1);\n}"),
        Error,
        'Not enough arguments given for command "drawxy".',
      );
    });

    it("throws when arguments are missing a separating comma", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\ndrawxy(1 2);\n}"),
        Error,
        "Comma needed after parameter.",
      );
    });

    it("throws when too many arguments are given", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nforward(1, 2);\n}"),
        Error,
        "Too many arguments given for command",
      );
    });

    it("throws when a function is called as a procedure statement", () => {
      assertThrows(
        () =>
          parseProgram(
            "C",
            "int addOne (int n) {\nreturn n + 1;\n}\nvoid main () {\naddOne(1);\n}",
          ),
        Error,
        "is a function, not a procedure",
      );
    });

    it("throws when a native function command is called as a procedure statement", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nrand(10);\n}"),
        Error,
        "is a function, not a procedure",
      );
    });

    it("throws when a procedure is called as a function (native command)", () => {
      assertThrows(
        () => parseProgram("C", "void main () {\nint x = home();\n}"),
        Error,
        "is a procedure, not a function",
      );
    });
  });

  describe("return statement", () => {
    it("throws when a return value is the wrong type for the function", () => {
      assertThrows(
        () =>
          parseProgram(
            "C",
            'int getFive () {\nreturn "hi";\n}\nvoid main () {\n}',
          ),
        Error,
        "Type error",
      );
    });

    it("throws when a return statement is missing its semicolon", () => {
      assertThrows(
        () =>
          parseProgram("C", "int getFive () {\nreturn 5\n}\nvoid main () {\n}"),
        Error,
        "Statement must be followed by a semicolon.",
      );
    });
  });
});
