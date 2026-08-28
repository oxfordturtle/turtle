import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertExists, assertThrows } from "@std/assert";
import type {
  Constant,
  IfStatement,
  ProcedureCall,
  RepeatStatement,
  ReturnStatement,
  Subroutine,
  VariableAssignment,
} from "@/core/compiler.ts";
import { parseProgram } from "./lib/programs.ts";

/**
 * TypeScript-specific parser tests: syntax too divergent for the shared
 * cross-language table in common.test.ts ("var"/"const" declarations,
 * do-while loops, "function" definitions with return-type annotations)
 * plus error paths for every major statement kind.
 *
 * Several behaviors below were confirmed by directly exercising the parser
 * rather than assumed from reading the source; see the comments at each
 * surprising result.
 */

describe("parse: TypeScript", () => {
  describe("var declarations", () => {
    it("declares a variable, then assigns to it as a separate statement", () => {
      const program = parseProgram("TypeScript", "var x: number;\nx = 1;");
      // the "var" statement itself produces a passStatement; the real
      // variableAssignment is the next statement
      assertEquals(program.statements[0]?.kind, "passStatement");
      const assignment = program.statements[1] as VariableAssignment;
      assertEquals(assignment.kind, "variableAssignment");
      assertEquals(assignment.variable.name, "x");
      assert(
        program.variables.some((v) => v.name === "x" && v.type === "integer"),
      );
    });

    it("also allows an inline initializer on the same 'var' statement", () => {
      // despite the two-statement pattern above being the documented idiom,
      // simpleStatement.ts's "var" case re-parses the type declaration on
      // the second pass and then checks for a trailing "="; if it's there,
      // it folds straight into a variableAssignment -- so this
      // single-statement form works too, confirmed directly
      const program = parseProgram("TypeScript", "var x: number = 5;");
      assertEquals(program.statements.length, 1);
      assertEquals(program.statements[0]?.kind, "variableAssignment");
    });

    it("declares an array variable with a dimension", () => {
      const program = parseProgram(
        "TypeScript",
        "var arr: number[3];\narr[0] = 1;",
      );
      const arr = program.variables.find((v) => v.name === "arr");
      assertExists(arr);
      assertEquals(arr.arrayDimensions, [[0, 2]]);
    });

    it("declares a multi-dimensional array variable", () => {
      const program = parseProgram(
        "TypeScript",
        "var arr: number[2][3];\narr[0][1] = 5;",
      );
      const arr = program.variables.find((v) => v.name === "arr");
      assertExists(arr);
      assertEquals(arr.arrayDimensions.length, 2);
    });

    it("declares a string variable with an explicit length", () => {
      const program = parseProgram(
        "TypeScript",
        'var s: string(10);\ns = "hi";',
      );
      const s = program.variables.find((v) => v.name === "s");
      assertExists(s);
      assertEquals(s.stringLength, 10);
    });

    it("throws when redeclaring a variable in the same scope", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var x: number;\nvar x: number;"),
        Error,
        "is already defined in the current scope",
      );
    });

    it("throws when the variable name is not a valid identifier", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var 5: number;"),
        Error,
        "is not a valid identifier",
      );
    });

    it("throws when a turtle property name is used as a variable name", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var turtx: number;"),
        Error,
        "already the name of a predefined Turtle property",
      );
    });

    it("throws when a variable is declared void", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var x: void;"),
        Error,
        "Variable cannot be void",
      );
    });

    it("throws when an array is declared void", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var arr: void[3];"),
        Error,
        "Array of void is not allowed",
      );
    });
  });

  describe("const declarations", () => {
    it("parses a const declaration with an inline value", () => {
      const program = parseProgram("TypeScript", "const y: number = 5;");
      assertEquals(program.constants.length, 1);
      const y = program.constants[0] as Constant;
      assertEquals(y.name, "y");
      assertEquals(y.value, 5);
    });

    it("throws when redeclaring a constant in the same scope", () => {
      assertThrows(
        () =>
          parseProgram(
            "TypeScript",
            "const x: number = 1;\nconst x: number = 2;",
          ),
        Error,
        "is already defined in the current scope",
      );
    });

    it("throws when a constant is declared as an array", () => {
      assertThrows(
        () => parseProgram("TypeScript", "const arr: number[3] = 1;"),
        Error,
        "Constant cannot be an array",
      );
    });

    it("throws when '=' is missing after the constant's type (ran out of lexemes)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "const x: number"),
        Error,
        "must be assigned a value",
      );
    });

    it("throws when '=' is missing after the constant's type (wrong token)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "const x: number 5;"),
        Error,
        "must be assigned a value",
      );
    });

    it("throws when assigning to a constant", () => {
      assertThrows(
        () => parseProgram("TypeScript", "const x: number = 1;\nx = 2;"),
        Error,
        "is a constant and cannot be assigned a new value",
      );
    });

    it("throws when a constant is declared void", () => {
      assertThrows(
        () => parseProgram("TypeScript", "const x: void = 1;"),
        Error,
        "Constant type cannot be void",
      );
    });
  });

  describe("type annotations", () => {
    it("throws when the type specification is missing entirely (ran out of lexemes)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var x"),
        Error,
        'Expected type specification (": <type>").',
      );
    });

    it("throws when the type specification is missing entirely (wrong token)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var x;"),
        Error,
        'Expected type specification (": <type>").',
      );
    });

    it("throws when ':' is missing before the type", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var x number;"),
        Error,
        'Expected type specification (": <type>").',
      );
    });

    it("throws when the type keyword is missing after ':' (ran out of lexemes)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var x:"),
        Error,
        'Expected type definition ("boolean", "number", "string", or "void").',
      );
    });

    it("throws on an invalid type keyword", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var x: foo;"),
        Error,
        "is not a valid type definition",
      );
    });

    it("throws when a string size is not an integer", () => {
      assertThrows(
        () => parseProgram("TypeScript", 'var s: string("a");'),
        Error,
        "String size must be an integer",
      );
    });

    it("throws when a string size is zero", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var s: string(0);"),
        Error,
        "String size must be greater than zero",
      );
    });

    it("throws when the string size specification is missing (ran out of lexemes)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var s: string("),
        Error,
        "Expected string size specification",
      );
    });

    it("throws when the string size specification's closing bracket is missing (ran out of lexemes)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var s: string(5"),
        Error,
        'Closing bracket ")" missing after string size specification',
      );
    });

    it("throws when the string size specification's closing bracket is missing (wrong token)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var s: string(5;"),
        Error,
        'Closing bracket ")" missing after string size specification',
      );
    });

    it("throws when an array dimension size is missing (ran out of lexemes)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var arr: number["),
        Error,
        'Opening bracket "[" must be followed by an array size',
      );
    });

    it("throws when an array dimension size is missing (wrong token)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var arr: number[];"),
        Error,
        'Expression cannot begin with "]"',
      );
    });

    it("throws when an array dimension size is not an integer", () => {
      assertThrows(
        () => parseProgram("TypeScript", 'var arr: number["a"];'),
        Error,
        "Type error",
      );
    });

    it("throws when an array dimension size is zero", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var arr: number[0];"),
        Error,
        "Array size must be positive",
      );
    });

    it("throws when an array dimension's closing bracket is missing (ran out of lexemes)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var arr: number[3"),
        Error,
        'Array size specification must be followed by closing bracket "]"',
      );
    });

    it("throws when an array dimension's closing bracket is missing (wrong token)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var arr: number[3;"),
        Error,
        'Array size specification must be followed by closing bracket "]"',
      );
    });

    // N.B. type.ts's "Array size must be an integer." check (guarding
    // against evaluate() returning a string for an array-size expression)
    // also appears unreachable for TypeScript specifically: reaching it
    // requires an expression that passes `typeCheck(..., "integer")` but
    // still evaluates to a string, which in practice means a "character"-
    // typed expression -- and TypeScript has no character literal syntax
    // and no "character" entry in its type keyword table (tokenize.ts's
    // TypeScript branch only recognises "void|boolean|number|string"), so
    // no TypeScript expression can ever carry the type "character".
    // Every other expression type that survives the integer typeCheck
    // (integer literals, boolint constants, boolean-as-integer) evaluates
    // to a number. Not force-tested, since it would require fabricating a
    // Program by hand rather than going through parseProgram(); the guard
    // carries a justified deno-coverage-ignore in type.ts instead.
  });

  describe("function definitions", () => {
    it("parses a function with a parameter, return type, and return statement", () => {
      const program = parseProgram(
        "TypeScript",
        "function double(n: number): number { return n * 2; }\nvar y: number;\ny = double(2);",
      );
      assertEquals(program.subroutines.length, 1);
      const sub = program.subroutines[0] as Subroutine;
      assertEquals(sub.name, "double");
      assert(sub.variables.some((v) => v.name === "n" && v.isParameter));
      // functions get an implicit "!result" variable carrying the return type
      assert(
        sub.variables.some((v) => v.name === "!result" && v.type === "integer"),
      );
      const returnStatement = sub.statements.find(
        (s) => s.kind === "returnStatement",
      ) as ReturnStatement | undefined;
      assertExists(returnStatement);
    });

    it("parses a function with multiple comma-separated parameters", () => {
      const program = parseProgram(
        "TypeScript",
        "function add(a: number, b: number): number { return a + b; }",
      );
      const sub = program.subroutines[0] as Subroutine;
      assertEquals(
        sub.variables.filter((v) => v.isParameter).map((v) => v.name),
        ["a", "b"],
      );
    });

    it("marks an array parameter as a reference parameter", () => {
      // an array is a reference in TypeScript, as in C and Java, so an array
      // parameter is the caller's array rather than a copy of it - which the
      // encoder expresses as a reference parameter. (Nothing can call this
      // one yet: TypeScript has no way to declare an array *variable* to pass.)
      const program = parseProgram(
        "TypeScript",
        "function go(a: number[3]): void { }",
      );
      const sub = program.subroutines[0] as Subroutine;
      const parameter = sub.variables.find((v) => v.name === "a");
      assertExists(parameter);
      assertEquals(parameter.arrayDimensions, [[0, 2]]);
      assertEquals(parameter.isReferenceParameter, true);
    });

    it("hoists the function definition and leaves a passStatement in its place", () => {
      const program = parseProgram(
        "TypeScript",
        "function f(): number { return 1; }\nf();",
      );
      assertEquals(program.statements[0]?.kind, "passStatement");
    });

    it("parses nested function definitions", () => {
      const program = parseProgram(
        "TypeScript",
        "function f(): number {\nfunction g(): number { return 1; }\nreturn g();\n}",
      );
      const f = program.subroutines[0]!;
      assertEquals(f.subroutines.length, 1);
      assertEquals(f.subroutines[0]?.name, "g");
    });

    it("allows calling a function as a bare statement", () => {
      // unlike BASIC/C/Java/Pascal, common/procedureCall.ts's
      // function-called-as-procedure check explicitly excludes
      // TypeScript, so this is legal here even though it's an error path
      // for the other four languages
      const program = parseProgram(
        "TypeScript",
        "function double(n: number): number { return n * 2; }\ndouble(2);",
      );
      const call = program.statements.find(
        (s) => s.kind === "procedureCall",
      ) as ProcedureCall | undefined;
      assertExists(call);
    });

    it("throws when the function name is missing", () => {
      assertThrows(
        () => parseProgram("TypeScript", "function"),
        Error,
        "must be followed by an identifier",
      );
    });

    it("throws when the function name is not a valid identifier", () => {
      assertThrows(
        () => parseProgram("TypeScript", "function 5(): number { return 1; }"),
        Error,
        "is not a valid identifier",
      );
    });

    it("throws when the opening parameter bracket is missing (ran out of lexemes)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "function f"),
        Error,
        'Opening bracket "(" missing after function name',
      );
    });

    it("throws when the opening parameter bracket is missing (wrong token)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "function f x: number { return 1; }"),
        Error,
        'Opening bracket "(" missing after function name',
      );
    });

    it("throws when a parameter name is not a valid identifier", () => {
      assertThrows(
        () =>
          parseProgram(
            "TypeScript",
            "function f(5: number): number { return 1; }",
          ),
        Error,
        "is not a valid identifier",
      );
    });

    it("throws when the return type has array dimensions", () => {
      assertThrows(
        () =>
          parseProgram("TypeScript", "function f(): number[3] { return 1; }"),
        Error,
        "Functions cannot return arrays",
      );
    });

    it("throws when the opening body bracket is missing (ran out of lexemes)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "function f(): number"),
        Error,
        'Method parameters must be followed by an opening bracket "{"',
      );
    });

    it("throws when the opening body bracket is missing (wrong token)", () => {
      assertThrows(
        () =>
          parseProgram("TypeScript", "function f() : number \n return 1; }"),
        Error,
        'Method parameters must be followed by an opening bracket "{"',
      );
    });

    it("throws when returning outside a function", () => {
      assertThrows(
        () => parseProgram("TypeScript", "return 1;"),
        Error,
        '"RETURN" statements are only valid within the body of a function',
      );
    });

    it("throws on a return type mismatch", () => {
      assertThrows(
        () =>
          parseProgram(
            "TypeScript",
            "function f(): number { return true; }\nvar y: number;\ny = f();",
          ),
        Error,
        "Type error",
      );
    });

    it("throws when a return statement is missing its semicolon/newline", () => {
      assertThrows(
        () =>
          parseProgram("TypeScript", "function f(): number { return 1 }\nf();"),
        Error,
        "Statement must be followed by a semicolon or placed on a new line",
      );
    });

    it("throws when a void function contains a return statement", () => {
      assertThrows(
        () => parseProgram("TypeScript", "function f(): void { return 1; }"),
        Error,
        "Procedures cannot return a value",
      );
    });
  });

  describe("do-while loop", () => {
    it("parses a do-while loop as a repeat statement with the condition negated", () => {
      const program = parseProgram(
        "TypeScript",
        "var x: number;\nx = 0;\ndo { x = x + 1; } while (x < 3);",
      );
      const repeatStatement = program.statements.find(
        (s) => s.kind === "repeatStatement",
      ) as RepeatStatement | undefined;
      assertExists(repeatStatement);
      assertEquals(repeatStatement.statements.length, 1);
      // a TypeScript do-while loop repeats *while* its condition is true,
      // but the pcode "repeat" primitive loops *until* its condition is
      // true, so doStatement.ts compiles the condition as "not (x < 3)"
      assertEquals(repeatStatement.condition.kind, "compound");
    });

    it("throws when the opening bracket is missing", () => {
      assertThrows(
        () => parseProgram("TypeScript", "do x = 1; while (true);"),
        Error,
        '"do" must be followed by an opening bracket "{"',
      );
    });

    it("throws when 'while' is missing after the block", () => {
      assertThrows(
        () => parseProgram("TypeScript", "do { } true);"),
        Error,
        '"do { ... }" must be followed by "while"',
      );
    });

    it("throws when the opening bracket after 'while' is missing", () => {
      assertThrows(
        () => parseProgram("TypeScript", "do { } while true);"),
        Error,
        '"while" must be followed by an opening bracket "("',
      );
    });

    it("throws when the condition is missing", () => {
      assertThrows(
        () => parseProgram("TypeScript", "do { } while ("),
        Error,
        '"while (" must be followed by a boolean expression',
      );
    });

    it("throws when the closing bracket is missing", () => {
      assertThrows(
        () => parseProgram("TypeScript", "do { } while (true;"),
        Error,
        '"while (..." must be followed by a closing bracket ")"',
      );
    });

    it("throws when the trailing semicolon/newline is missing", () => {
      assertThrows(
        () => parseProgram("TypeScript", "do { } while (true) forward(1);"),
        Error,
        "Statement must be followed by a semicolon or placed on a new line",
      );
    });
  });

  describe("if / else", () => {
    it("parses an if with no else", () => {
      const program = parseProgram("TypeScript", "if (true) { }");
      const ifStatement = program.statements.find(
        (s) => s.kind === "ifStatement",
      ) as IfStatement | undefined;
      assertExists(ifStatement);
      assertEquals(ifStatement.elseStatements.length, 0);
    });

    it("throws if 'if' is not followed by an opening bracket", () => {
      assertThrows(
        () => parseProgram("TypeScript", "if true) { }"),
        Error,
        '"if" must be followed by an opening bracket "("',
      );
    });

    it("throws when the if condition is missing", () => {
      assertThrows(
        () => parseProgram("TypeScript", "if ("),
        Error,
        '"if (" must be followed by a Boolean expression',
      );
    });

    it("throws when the closing bracket is missing", () => {
      assertThrows(
        () => parseProgram("TypeScript", "if (true { }"),
        Error,
        '"if (..." must be followed by a closing bracket ")"',
      );
    });

    it("throws when the opening curly bracket is missing", () => {
      assertThrows(
        () => parseProgram("TypeScript", "if (true)"),
        Error,
        '"if (...)" must be followed by an opening curly bracket "{"',
      );
    });

    it("throws when 'else' is not followed by an opening bracket", () => {
      assertThrows(
        () => parseProgram("TypeScript", "if (true) { } else true"),
        Error,
        '"else" must be followed by an opening bracket "{"',
      );
    });

    it("throws on 'else' with no matching 'if'", () => {
      assertThrows(
        () => parseProgram("TypeScript", "else { }"),
        Error,
        'Statement cannot begin with "else"',
      );
    });
  });

  describe("while loop", () => {
    it("throws if 'while' is not followed by an opening bracket", () => {
      assertThrows(
        () => parseProgram("TypeScript", "while true) { }"),
        Error,
        '"while" must be followed by an opening bracket "("',
      );
    });

    it("throws when the condition is missing", () => {
      assertThrows(
        () => parseProgram("TypeScript", "while ("),
        Error,
        '"while (" must be followed by a Boolean expression',
      );
    });

    it("throws when the closing bracket is missing", () => {
      assertThrows(
        () => parseProgram("TypeScript", "while (true { }"),
        Error,
        '"while (..." must be followed by a closing bracket ")"',
      );
    });

    it("throws when the opening curly bracket is missing", () => {
      assertThrows(
        () => parseProgram("TypeScript", "while (true)"),
        Error,
        '"while (...)" must be followed by an opening curly bracket "{"',
      );
    });
  });

  describe("for loop", () => {
    it("throws if 'for' is not followed by an opening bracket", () => {
      assertThrows(
        () => parseProgram("TypeScript", "for i = 0; i < 3; i = i + 1) { }"),
        Error,
        '"for" must be followed by an opening bracket "("',
      );
    });

    it("throws when the initialisation is missing entirely (ran out of lexemes)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "for ("),
        Error,
        '"for" conditions must begin with a variable assignment',
      );
    });

    it("throws when the initialisation starts with the wrong kind of lexeme", () => {
      assertThrows(
        () => parseProgram("TypeScript", "for (;true;) { }"),
        Error,
        '"for" conditions must begin with a variable assignment',
      );
    });

    it("throws when the initialisation is a procedure call, not an assignment", () => {
      assertThrows(
        () => parseProgram("TypeScript", "for (forward(1); true; ) { }"),
        Error,
        '"for" conditions must begin with a variable assignment',
      );
    });

    it("throws when the initialisation is a keyword other than 'var'/'const'", () => {
      // forStatement.ts's own gate only checks the lexeme's *type* (keyword
      // or identifier) before delegating to parseSimpleStatement; a
      // keyword type that isn't "var" or "const" (like "return" here)
      // sails past that gate and instead trips simpleStatement.ts's own
      // "default" case in its keyword switch, which is otherwise
      // unreachable from any other caller
      assertThrows(
        () =>
          parseProgram("TypeScript", "for (return = 0; true; return = 1) { }"),
        Error,
        'Simple statement cannot begin with "return"',
      );
    });

    it("throws when the loop condition is missing (ran out of lexemes)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var i: number;\nfor (i = 0;"),
        Error,
        '"for (...; ...;" must be followed by a loop condition',
      );
    });

    it("throws when the loop variable is not an integer", () => {
      assertThrows(
        () =>
          parseProgram(
            "TypeScript",
            'var s: string;\nfor (s = "a"; true; s = s) { }',
          ),
        Error,
        "Loop variable must be an integer",
      );
    });

    it("throws when the first semicolon is missing", () => {
      assertThrows(
        () =>
          parseProgram(
            "TypeScript",
            "var i: number;\nfor (i = 0 true; i = i + 1) { }",
          ),
        Error,
        '"for (..." must be followed by a semicolon',
      );
    });

    it("throws when the second semicolon is missing", () => {
      assertThrows(
        () =>
          parseProgram(
            "TypeScript",
            "var i: number;\nfor (i = 0; true i = i + 1) { }",
          ),
        Error,
        '"for (...; ..." must be followed by a semicolon',
      );
    });

    it("throws when the change statement is missing entirely (ran out of lexemes)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var i: number;\nfor (i = 0; true;"),
        Error,
        '"for (...;" must be followed by a loop variable reassignment',
      );
    });

    it("throws when the change statement starts with the wrong kind of lexeme", () => {
      assertThrows(
        () =>
          parseProgram(
            "TypeScript",
            "var i: number;\nfor (i = 0; true; 5) { }",
          ),
        Error,
        '"for (...;" must be followed by a loop variable reassignment',
      );
    });

    it("throws when the change statement isn't a variable assignment", () => {
      assertThrows(
        () =>
          parseProgram(
            "TypeScript",
            "var i: number;\nfor (i = 0; true; forward(1)) { }",
          ),
        Error,
        '"for (...;" must be followed by a loop variable reassignment',
      );
    });

    it("throws when the change statement targets a different variable", () => {
      assertThrows(
        () =>
          parseProgram(
            "TypeScript",
            "var i: number;\nvar j: number;\nfor (i = 0; true; j = j + 1) { }",
          ),
        Error,
        "Initial loop variable and change loop variable must be the same",
      );
    });

    it("throws when the closing bracket is missing", () => {
      assertThrows(
        () =>
          parseProgram(
            "TypeScript",
            "var i: number;\nfor (i = 0; true; i = i + 1 { }",
          ),
        Error,
        '"for (...; ...; ..." must be followed by a closing bracket ")"',
      );
    });

    it("throws when the opening curly bracket is missing", () => {
      assertThrows(
        () =>
          parseProgram(
            "TypeScript",
            "var i: number;\nfor (i = 0; true; i = i + 1)",
          ),
        Error,
        '"for (...; ...; ...)" must be followed by an opening bracket "{"',
      );
    });
  });

  describe("break and continue statements", () => {
    // encoder-level pcode shape and cross-loop-type back-patching are
    // language-agnostic and covered exhaustively by
    // test/core/compiler/encoder/statements.test.ts against Python source -
    // these tests are only about TypeScript's own parser wiring.

    it("parses 'break' inside a while loop as a breakStatement", () => {
      const program = parseProgram("TypeScript", "while (true) { break; }");
      const whileStatement = program.statements[0] as unknown as {
        statements: { kind: string }[];
      };
      assertEquals(whileStatement.statements[0]?.kind, "breakStatement");
    });

    it("parses 'continue' inside a for loop as a continueStatement", () => {
      const program = parseProgram(
        "TypeScript",
        "var i: number;\nfor (i = 0; i < 3; i = i + 1) { continue; }",
      );
      const forStatement = program.statements[1] as unknown as {
        statements: { kind: string }[];
      };
      assertEquals(forStatement.statements[0]?.kind, "continueStatement");
    });

    it("parses 'break' inside a do-while loop (RepeatStatement)", () => {
      const program = parseProgram("TypeScript", "do { break; } while (true);");
      const repeatStatement = program.statements[0] as RepeatStatement;
      assertEquals(repeatStatement.statements[0]?.kind, "breakStatement");
    });

    it("throws if 'break' occurs outside any loop", () => {
      assertThrows(
        () => parseProgram("TypeScript", "break;"),
        Error,
        "'break' is only allowed inside a loop.",
      );
    });

    it("throws if 'continue' occurs outside any loop", () => {
      assertThrows(
        () => parseProgram("TypeScript", "continue;"),
        Error,
        "'continue' is only allowed inside a loop.",
      );
    });
  });

  describe("statement blocks", () => {
    it("parses an empty block", () => {
      const program = parseProgram("TypeScript", "if (true) { }");
      const ifStatement = program.statements[0] as IfStatement;
      assertEquals(ifStatement.ifStatements.length, 0);
    });

    it("throws when the closing bracket is missing", () => {
      assertThrows(
        () => parseProgram("TypeScript", "if (true) { forward(1);"),
        Error,
        'Closing bracket "}" missing after statement block',
      );
    });

    it("tolerates a leading newline and comment at the start of a block", () => {
      // the leading newline right after "{" and the comment line each
      // produce their own passStatement (statement.ts's "newline" case
      // explicitly notes this can happen at the start of a block), before
      // the real procedureCall statement
      const program = parseProgram(
        "TypeScript",
        "if (true) {\n// comment\nforward(1);\n}",
      );
      const ifStatement = program.statements[0] as IfStatement;
      assertEquals(
        ifStatement.ifStatements.map((s) => s.kind),
        ["passStatement", "passStatement", "procedureCall"],
      );
    });
  });

  describe("variable assignment (indexes and operators)", () => {
    it("assigns to a single array index", () => {
      const program = parseProgram(
        "TypeScript",
        "var arr: number[3];\narr[0] = 1;",
      );
      const assignment = program.statements[1] as VariableAssignment;
      assertEquals(assignment.indexes.length, 1);
    });

    it("assigns to a character within a string variable", () => {
      const program = parseProgram("TypeScript", 'var s: string;\ns[0] = "a";');
      const assignment = program.statements[1] as VariableAssignment;
      assertEquals(assignment.indexes.length, 1);
    });

    it("allows the maximum allowed indexes on an array-of-strings variable", () => {
      // a string array's allowed index count is its dimensions plus one
      // (for the character-within-the-string index)
      const program = parseProgram(
        "TypeScript",
        'var arr: string[3];\narr[0][0] = "a";',
      );
      const assignment = program.statements[1] as VariableAssignment;
      assertEquals(assignment.indexes.length, 2);
    });

    it("throws when too many indexes are given for an array-of-strings variable", () => {
      assertThrows(
        () =>
          parseProgram(
            "TypeScript",
            'var arr: string[3];\narr[0][0][0] = "a";',
          ),
        Error,
        "Too many indexes for array variable",
      );
    });

    it("throws when indexing a variable that's neither a string nor an array", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var x: number;\nx[0] = 1;"),
        Error,
        "is not a string or array variable",
      );
    });

    it("throws when a second bracket group follows a non-array string index", () => {
      // a plain (non-array) string variable's index-parsing branch only
      // consumes a single "[...]" group; a second one is left for the
      // "expecting '='" section below to trip over, via its own dedicated
      // (and differently worded, but equivalent) check for a stray "["
      assertThrows(
        () => parseProgram("TypeScript", 'var s: string;\ns[0][1] = "a";'),
        Error,
        "is not a string or array variable",
      );
    });

    it("throws when too many indexes are given for a plain array variable", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var arr: number[3];\narr[0][0] = 1;"),
        Error,
        "Too many indexes for array variable",
      );
    });

    it("throws when the closing bracket is missing after array indexes (ran out of lexemes)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var arr: number[3];\narr[0"),
        Error,
        'Closing bracket "]" needed after array indexes',
      );
    });

    it("throws when the closing bracket is missing after a string index (ran out of lexemes)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var s: string;\ns[0"),
        Error,
        'Closing bracket "]" missing after string variable index',
      );
    });

    it("throws when the assignment operator is missing entirely (ran out of lexemes)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var x: number;\nx"),
        Error,
        'Variable must be followed by assignment operator "="',
      );
    });

    it("throws a specific message when ':' follows the variable (type already given)", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var x: number;\nx: number = 5;"),
        Error,
        "has already been given",
      );
    });

    it("throws when a wrong (non-assignment) operator is used", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var x: number;\nx == 1;"),
        Error,
        'Variable must be followed by assignment operator "="',
      );
    });

    it("throws when the assigned value is missing", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var x: number;\nx ="),
        Error,
        'Variable "x" must be assigned a value',
      );
    });
  });

  describe("identifiers and lookups", () => {
    it("throws when an identifier is not defined", () => {
      assertThrows(
        () => parseProgram("TypeScript", "foo();"),
        Error,
        '"foo" is not defined',
      );
    });

    it("throws when a variable is called like a procedure", () => {
      // "x(" doesn't parse as a call at all here: simpleStatement.ts finds
      // "x" as a variable first (before ever considering it a command),
      // so it hands straight off to parseVariableAssignment, which then
      // sees "(" where it expects "="
      assertThrows(
        () => parseProgram("TypeScript", "var x: number;\nx();"),
        Error,
        'Variable must be followed by assignment operator "="',
      );
    });
  });

  describe("statement separation", () => {
    it("tolerates repeated semicolons and blank lines between statements", () => {
      const program = parseProgram(
        "TypeScript",
        "var x: number;\n\nx = 1;;\n\nx = 2;",
      );
      assertEquals(
        program.statements.filter((s) => s.kind === "variableAssignment")
          .length,
        2,
      );
    });

    it("throws when statements are not separated by a semicolon or newline", () => {
      assertThrows(
        () => parseProgram("TypeScript", "var x: number;\nx = 1 x = 2;"),
        Error,
        "Statement must be followed by a semicolon or placed on a new line",
      );
    });
  });

  describe("statements that cannot start a statement", () => {
    it("throws when a statement begins with a literal", () => {
      assertThrows(
        () => parseProgram("TypeScript", "5;"),
        Error,
        'Statement cannot begin with "5"',
      );
    });

    // N.B. statement.ts's inner `switch (lexeme.subtype)` (for keyword
    // lexemes) has a "default" branch for unrecognised keywords, but it's
    // unreachable in practice: the TypeScript keyword table
    // (src/core/constants/keywords.ts) has exactly nine entries -- if,
    // else, for, while, do, function, var, const, return -- and every one
    // is handled by name in that switch (including "else", which has its
    // own explicit throw). There's no tenth TypeScript keyword the lexer
    // could ever hand this switch that would fall through to "default".
  });

  describe("empty program", () => {
    it("parses an empty program with no statements", () => {
      const program = parseProgram("TypeScript", "");
      assertEquals(program.statements.length, 0);
      assertEquals(program.language, "TypeScript");
    });
  });
});
