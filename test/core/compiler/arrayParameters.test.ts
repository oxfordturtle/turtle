import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import {
  assertCompilerError,
  runSourceToText,
} from "../machine/lib/helpers.ts";

/**
 * Passing an array to a subroutine, in the four languages that can say it:
 * Pascal's `a: array[1..3] of integer`, BASIC's `a%()`, C's `int a[3]` and
 * Java's `int[3] a`. (Python has no arrays - a `List[T]` hint makes a dynamic
 * list instead - and TypeScript cannot declare an array *variable* yet, so
 * neither can pass one.)
 *
 * Pascal draws the distinction the Delphi Turtle System draws, and in the same
 * two syntaxes:
 *
 * - a **value** parameter states its dimensions, and the caller's array is
 *   copied into a block of that shape in the callee's own frame - one CPTR
 *   over the whole block, so nested strings and arrays come with it, followed
 *   by a rebuild of the block's internal pointers, which the copy brought over
 *   still pointing into the caller's frame;
 * - a **VAR** parameter states only its depth (`array of integer`), and holds
 *   the caller's array address.
 *
 * The other three languages have no second form: an array parameter is the
 * caller's array in all of them, which the parser marks as a reference
 * parameter and the encoder then treats as one.
 *
 * Because the copy is one block-sized CPTR laid out from the declared
 * dimensions, the argument's block must have exactly that shape - hence the
 * call-site checks in the last group.
 */
describe("compiler: array parameters", () => {
  /** These assertions never care about the trailing newline. */
  const run = (
    language: "BASIC" | "C" | "Java" | "Pascal",
    code: string,
  ): string => runSourceToText(language, code).replace(/\n$/, "");

  describe("Pascal, whose value parameter is copied", () => {
    it("reads what the caller wrote, then leaves the caller's array alone when it writes", () => {
      assertEquals(
        run(
          "Pascal",
          `program Test;
var arr: array[1..3] of integer;
procedure go(a: array[1..3] of integer);
begin
writeln(str(a[1]));
a[1] := 99;
writeln(str(a[1]))
end;
begin
arr[1] := 7;
go(arr);
writeln(str(arr[1]))
end.`,
        ),
        "7\n99\n7",
      );
    });

    it("indexes the copy by its own declared bounds, not from zero", () => {
      // the callee's block is laid out from its own dimensions, so `a[1]` here
      // is the caller's `arr[1]`. A VAR parameter has no bounds to state and
      // counts from 0 instead - the group below pins that
      assertEquals(
        run(
          "Pascal",
          `program Test;
var arr: array[1..3] of integer;
procedure go(a: array[1..3] of integer);
begin
writeln(str(a[1]) + ' ' + str(a[3]))
end;
begin
arr[1] := 10;
arr[3] := 30;
go(arr)
end.`,
        ),
        "10 30",
      );
    });

    it("copies an array of strings deeply, the copy's elements being its own", () => {
      // the block copy brings the caller's string data with it but also the
      // caller's pointers to it, so the rebuild after the CPTR is what stops
      // "changed" reaching the caller's own buffer
      assertEquals(
        run(
          "Pascal",
          `program Test;
var names: array[1..3] of string;
procedure go(a: array[1..3] of string);
begin
writeln(a[1]);
a[1] := 'changed';
writeln(a[1])
end;
begin
names[1] := 'original';
go(names);
writeln(names[1])
end.`,
        ),
        "original\nchanged\noriginal",
      );
    });

    it("passes a copied array on to another subroutine, which copies it again", () => {
      assertEquals(
        run(
          "Pascal",
          `program Test;
var arr: array[1..3] of integer;
procedure inner(a: array[1..3] of integer);
begin
writeln(str(a[1]));
a[1] := 99
end;
procedure outer(a: array[1..3] of integer);
begin
inner(a);
writeln(str(a[1]))
end;
begin
arr[1] := 13;
outer(arr);
writeln(str(arr[1]))
end.`,
        ),
        "13\n13\n13",
      );
    });

    it("takes a row of a two-dimensional array, indexing having made it a shallower one", () => {
      // the argument need not be a whole array: indexing an array of arrays
      // yields an array one dimension shallower, whose block has exactly the
      // shape this parameter declares
      assertEquals(
        run(
          "Pascal",
          `program Test;
var grid: array[1..2,1..3] of integer;
procedure go(a: array[1..3] of integer);
begin
writeln(str(a[2]));
a[2] := 99
end;
begin
grid[1,2] := 42;
go(grid[1]);
writeln(str(grid[1,2]))
end.`,
        ),
        "42\n42",
      );
    });

    it("addresses the locals declared after one correctly", () => {
      // a value array parameter takes a whole block in the frame, where a
      // reference one takes the single word an address needs. Everything
      // declared after it is offset by that length, so a wrong one shows up as
      // a neighbouring variable reading back something never written to it
      assertEquals(
        run(
          "Pascal",
          `program Test;
var arr: array[1..3] of integer;
procedure go(a: array[1..3] of integer; n: integer);
var s: string;
    m: integer;
begin
s := 'local';
m := n * 2;
writeln(str(a[1]) + ' ' + s + ' ' + str(m))
end;
begin
arr[1] := 5;
go(arr, 21)
end.`,
        ),
        "5 local 42",
      );
    });
  });

  describe("Pascal's VAR parameter, which is the caller's array", () => {
    it("writes through to the caller", () => {
      assertEquals(
        run(
          "Pascal",
          `program Test;
var arr: array[1..3] of integer;
procedure go(var a: array of integer);
begin
a[0] := 99
end;
begin
go(arr);
writeln(str(arr[1]))
end.`,
        ),
        "99",
      );
    });

    it("indexes from zero, having no bounds of its own to count from", () => {
      // `a[0]` above and here is the caller's `arr[1]`: a VAR parameter cannot
      // state its dimensions, so there is no start index to subtract. The
      // machine's range check reads the caller's length byte, so the legal
      // indexes here are 0..2 for the caller's 1..3
      assertEquals(
        run(
          "Pascal",
          `program Test;
var arr: array[1..3] of integer;
procedure go(var a: array of integer);
begin
writeln(str(a[0]) + ' ' + str(a[2]))
end;
begin
arr[1] := 10;
arr[3] := 30;
go(arr)
end.`,
        ),
        "10 30",
      );
    });

    it("takes an array of any size, its dimensions being dummies", () => {
      assertEquals(
        run(
          "Pascal",
          `program Test;
var arr: array[1..9] of integer;
procedure go(var a: array of integer);
begin
a[8] := 99
end;
begin
go(arr);
writeln(str(arr[9]))
end.`,
        ),
        "99",
      );
    });
  });

  describe("the languages whose arrays are references", () => {
    it("writes to the caller's array in C", () => {
      assertEquals(
        run(
          "C",
          `int arr[3];
void go (int a[3]) {
  print(itoa(a[0]));
  a[0] = 99;
}
void main () {
  arr[0] = 7;
  go(arr);
  print(itoa(arr[0]));
}`,
        ),
        "7\n99",
      );
    });

    it("writes to the caller's array in Java", () => {
      assertEquals(
        run(
          "Java",
          `class Test {
  void go (int[3] a) {
    a[0] = 99;
  }
  void main () {
    int[3] arr;
    go(arr);
    print(toString(arr[0]));
  }
}`,
        ),
        "99",
      );
    });

    it("writes to the caller's array in BASIC, RETURN or no RETURN", () => {
      assertEquals(
        run(
          "BASIC",
          `DIM arr%(3)
PROCgo(arr%())
PRINT(STR$(arr%(0)))
END
DEF PROCgo(a%())
  a%(0) = 99
ENDPROC`,
        ),
        "99",
      );
    });

    it("passes a two-dimensional array in C, indexed as the caller indexes it", () => {
      assertEquals(
        run(
          "C",
          `int grid[2][3];
void go (int g[2][3]) {
  print(itoa(g[1][2]));
  g[0][0] = 5;
}
void main () {
  grid[1][2] = 8;
  go(grid);
  print(itoa(grid[0][0]));
}`,
        ),
        "8\n5",
      );
    });
  });

  describe("what the call site rejects", () => {
    /** Everything here differs only in the argument, or in the parameter's type. */
    const pascalCall = (
      parameter: string,
      declaration: string,
      argument: string,
    ): string =>
      `program Test;
var ${declaration};
procedure go(${parameter});
begin
end;
begin
go(${argument})
end.`;

    it("rejects an array of the wrong size for a value parameter", () => {
      assertCompilerError(
        "Pascal",
        pascalCall(
          "a: array[1..3] of integer",
          "arr: array[1..5] of integer",
          "arr",
        ),
        "an array of size 3 was expected but one of size 5 was found",
      );
    });

    it("accepts an array of any size for a VAR parameter", () => {
      // the mirror of the case above: nothing is copied, so nothing has to fit
      assertEquals(
        run(
          "Pascal",
          pascalCall(
            "var a: array of integer",
            "arr: array[1..5] of integer",
            "arr",
          ),
        ),
        "",
      );
    });

    it("rejects an array of the wrong depth", () => {
      assertCompilerError(
        "Pascal",
        pascalCall(
          "a: array[1..3,1..2] of integer",
          "arr: array[1..3] of integer",
          "arr",
        ),
        "an array of 2 dimensions was expected but one of 1 was found",
      );
    });

    it("rejects an array whose strings have a different maximum length", () => {
      // the copy is one block-sized CPTR, and a string's maximum length is
      // part of that block's shape
      assertCompilerError(
        "Pascal",
        pascalCall(
          "a: array[1..3] of string[10]",
          "arr: array[1..3] of string[20]",
          "arr",
        ),
        "an array of strings of maximum length 10 was expected but one of maximum length 20 was found",
      );
    });

    it("rejects a scalar variable where an array is expected", () => {
      assertCompilerError(
        "Pascal",
        pascalCall("a: array[1..3] of integer", "n: integer", "n"),
        "an array was expected",
      );
    });

    it("rejects a literal where an array is expected", () => {
      assertCompilerError(
        "Pascal",
        pascalCall("a: array[1..3] of integer", "n: integer", "1"),
        "an array was expected",
      );
    });

    it("rejects an element of an array where the array itself is expected", () => {
      assertCompilerError(
        "Pascal",
        pascalCall(
          "a: array[1..3] of integer",
          "arr: array[1..3] of integer",
          "arr[1]",
        ),
        "an array was expected",
      );
    });
  });
});
