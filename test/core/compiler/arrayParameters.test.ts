import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { runSourceToText } from "../machine/lib/helpers.ts";

/**
 * Passing an array to a subroutine, in the four languages that can say it:
 * BASIC's `a%()`, C's `int a[3]`, Java's `int[3] a` and Pascal's
 * `a: array of integer`. (Python has no arrays - a `List[T]` hint makes a
 * dynamic list instead - and TypeScript cannot declare an array *variable*
 * yet, so neither can pass one.)
 *
 * The parameter holds the caller's array address, so the callee works on the
 * caller's array rather than on a copy of it. That is what C, Java and BASIC
 * mean by an array parameter anyway; for Pascal it means a value parameter
 * and a `var` parameter behave alike, which the third group below pins.
 * Copying is not open to the encoder: no language here lets a parameter
 * declare the size of its array (Pascal and BASIC give theirs dummy
 * dimensions, and C's and Java's declared size is not checked against the
 * argument), so the callee's frame has nowhere to copy one into.
 *
 * Reading and writing through the parameter is ordinary indexed access, which
 * `encoder/expressions/variableValue.ts` and
 * `encoder/statements/variableAssignment.ts` already routed through the slot's
 * address for reference parameters; what these check is the store that puts
 * the address in that slot (`encoder/program/subroutines.ts`), and the frame
 * layout around it - an array parameter's slot is one word, like any other
 * address, and gets no local block of its own.
 */
describe("compiler: array parameters", () => {
  /** These assertions never care about the trailing newline. */
  const run = (
    language: "BASIC" | "C" | "Java" | "Pascal",
    code: string,
  ): string => runSourceToText(language, code).replace(/\n$/, "");

  describe("reading the caller's array", () => {
    it("reads an element the caller wrote, in Pascal", () => {
      assertEquals(
        run(
          "Pascal",
          `program Test;
var arr: array[1..3] of integer;
procedure go(a: array of integer);
begin
writeln(str(a[0]))
end;
begin
arr[1] := 7;
go(arr)
end.`,
        ),
        "7",
      );
    });

    it("reads an element the caller wrote, in C", () => {
      assertEquals(
        run(
          "C",
          `int arr[3];
void go (int a[3]) {
  print(itoa(a[0]));
}
void main () {
  arr[0] = 7;
  go(arr);
}`,
        ),
        "7",
      );
    });

    it("reads an element the caller wrote, in Java", () => {
      assertEquals(
        run(
          "Java",
          `class Test {
  void go (int[3] a) {
    print(toString(a[0]));
  }
  void main () {
    int[3] arr;
    arr[0] = 7;
    go(arr);
  }
}`,
        ),
        "7",
      );
    });

    it("reads an element the caller wrote, in BASIC", () => {
      assertEquals(
        run(
          "BASIC",
          `DIM arr%(3)
arr%(0) = 7
PROCgo(arr%())
END
DEF PROCgo(a%())
  PRINT(STR$(a%(0)))
ENDPROC`,
        ),
        "7",
      );
    });

    it("indexes a Pascal array parameter from zero, whatever bounds the caller declared", () => {
      // a Pascal parameter cannot state its bounds ("array of integer", never
      // "array[1..3] of integer"), so the callee has no start index to
      // subtract and counts from 0 where the caller counts from 1. The
      // machine's own range check reads the caller's length byte, so the
      // callee's legal indexes here are 0..2 for the caller's 1..3
      assertEquals(
        run(
          "Pascal",
          `program Test;
var arr: array[1..3] of integer;
procedure go(a: array of integer);
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
  });

  describe("writing through the parameter", () => {
    it("writes to the caller's array in Pascal, a value parameter being an address like any other", () => {
      assertEquals(
        run(
          "Pascal",
          `program Test;
var arr: array[1..3] of integer;
procedure go(a: array of integer);
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

    it("writes to the caller's array in C", () => {
      assertEquals(
        run(
          "C",
          `int arr[3];
void go (int a[3]) {
  a[0] = 99;
}
void main () {
  go(arr);
  print(itoa(arr[0]));
}`,
        ),
        "99",
      );
    });

    it("writes to the caller's array in BASIC", () => {
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
  });

  describe("Pascal's var parameter", () => {
    it("behaves the same as a value parameter", () => {
      // the two differ for every other type; for an array they cannot, both
      // being the caller's address
      const program = (varKeyword: string): string =>
        `program Test;
var arr: array[1..3] of integer;
procedure go(${varKeyword}a: array of integer);
begin
a[0] := 99
end;
begin
go(arr);
writeln(str(arr[1]))
end.`;
      assertEquals(run("Pascal", program("var ")), "99");
      assertEquals(run("Pascal", program("")), "99");
    });
  });

  describe("arrays that are not one-dimensional integers", () => {
    it("passes an array of strings, whose elements are the caller's strings", () => {
      assertEquals(
        run(
          "Pascal",
          `program Test;
var names: array[1..3] of string;
procedure go(a: array of string);
begin
writeln(a[0]);
a[0] := 'written'
end;
begin
names[1] := 'read';
go(names);
writeln(names[1])
end.`,
        ),
        "read\nwritten",
      );
    });

    it("passes a two-dimensional array, indexed as the caller indexes it", () => {
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

    it("passes an array parameter straight on to another subroutine", () => {
      assertEquals(
        run(
          "Pascal",
          `program Test;
var arr: array[1..3] of integer;
procedure inner(a: array of integer);
begin
writeln(str(a[0]))
end;
procedure outer(a: array of integer);
begin
inner(a)
end;
begin
arr[1] := 13;
outer(arr)
end.`,
        ),
        "13",
      );
    });
  });

  describe("the frame around an array parameter", () => {
    it("addresses the locals declared after one correctly", () => {
      // an array parameter takes a single word in the frame (it holds an
      // address), where a local array takes a word per element plus its
      // pointer and length byte. Everything declared after it is offset by
      // that length, so a wrong one shows up as a neighbouring variable
      // reading back something that was never written to it
      assertEquals(
        run(
          "Pascal",
          `program Test;
var arr: array[1..3] of integer;
procedure go(a: array of integer; n: integer);
var s: string;
    m: integer;
begin
s := 'local';
m := n * 2;
writeln(str(a[0]) + ' ' + s + ' ' + str(m))
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
});
