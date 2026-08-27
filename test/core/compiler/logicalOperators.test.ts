import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { lexify, parse, tokenize } from "@/core/compiler.ts";
import type { Expression, IfStatement } from "@/core/compiler.ts";
import { type Language, PCode, pcodeArgs } from "@/core/constants.ts";
import {
  assertCompilerError,
  runSourceToText,
} from "../machine/lib/helpers.ts";
import { compileAndEncode } from "./encoder/lib/helpers.ts";
import { bodyStatements } from "./parser/lib/programs.ts";
import { LANGUAGES } from "./lib/languages.ts";

/**
 * The logical operators "and"/"or" ("&&"/"||"), across all six languages. Two
 * independent properties:
 *
 * - **precedence**: in Python, C, Java and TypeScript they bind
 *   looser than the comparison operators, so "a == b and c == d" means what
 *   it says. Pascal and BASIC keep the tighter, Pascal-style binding their
 *   own dialects really have, and that is pinned here rather than merely
 *   left alone.
 * - **short-circuiting**: in those same four languages the right
 *   operand is not evaluated when the left already decides the answer.
 *
 * The *bitwise* "&"/"|"/"^" are covered here too, since their precedence is
 * only meaningful next to the logical operators they are so easily confused
 * with. They have three rungs of their own, looser than all of the arithmetic;
 * Python puts that trio tighter than the comparisons and the C family puts it
 * looser, and both placements are asserted below.
 *
 * Behavioural, through the whole pipeline (compile, encode, run), rather
 * than pcode assertions - the point of both changes is what a program
 * *does*, and asserting the emitted jumps would pin one encoding of
 * short-circuiting rather than the semantics. The one exception is the
 * handful of parse-shape assertions below, which exist because an
 * answer-only test can pass on a coincidence: "a == (b and c) == d" gives
 * the right answer for some inputs.
 */

/** This file's assertions never care about surrounding whitespace. */
const runProgram = (language: Language, code: string): string =>
  runSourceToText(language, code).trim();

/**
 * Per-language boilerplate for "declare a=1, b=1, c=2, d=2, then print
 * 'yes' or 'no' according to some condition". The condition itself is
 * written in each language's own syntax by each test's own fixture table -
 * six genuinely different spellings of "and" and "==" can't be papered
 * over, only the surrounding shell can.
 */
const conditionProgram: Record<
  Language,
  (condition: string, extra?: string) => string
> = {
  BASIC: (condition, extra = "") =>
    `a% = 1\nb% = 1\nc% = 2\nd% = 2\n${extra}` +
    `IF ${condition} THEN PRINT("yes") ELSE PRINT("no")\nEND`,
  C: (condition, extra = "") =>
    `void main () {\nint a = 1;\nint b = 1;\nint c = 2;\nint d = 2;\n${extra}` +
    `if (${condition}) { print('yes'); } else { print('no'); }\n}`,
  Java: (condition, extra = "") =>
    `class Test {\nvoid main () {\nint a = 1;\nint b = 1;\nint c = 2;\nint d = 2;\n${extra}` +
    `if (${condition}) { print('yes'); } else { print('no'); }\n}\n}`,
  Pascal: (condition, extra = "") =>
    `program Test;\nvar a, b, c, d: integer;\nbegin\na := 1;\nb := 1;\nc := 2;\nd := 2;\n${extra}` +
    `if ${condition} then writeln('yes') else writeln('no');\nend.`,
  Python: (condition, extra = "") =>
    `a = 1\nb = 1\nc = 2\nd = 2\n${extra}` +
    `if ${condition}:\n    print('yes')\nelse:\n    print('no')`,
  TypeScript: (condition, extra = "") =>
    `var a: number = 1;\nvar b: number = 1;\nvar c: number = 2;\nvar d: number = 2;\n${extra}` +
    `if (${condition}) { print('yes'); } else { print('no'); }`,
};

/** Runs `condition` in the shell above, and returns "yes" or "no". */
const answer = (language: Language, condition: string): string =>
  runProgram(language, conditionProgram[language](condition));

/** The parsed condition expression of the (sole) "if" statement above. */
const conditionExpression = (
  language: Language,
  condition: string,
): Expression => {
  const code = conditionProgram[language](condition);
  const program = parse(lexify(tokenize(code, language), language), language);
  const ifStatement = bodyStatements(language, program).find(
    (s) => s.kind === "ifStatement",
  ) as IfStatement;
  return ifStatement.condition;
};

/** The operator at the root of a parsed condition (null if it isn't compound). */
const rootOperator = (language: Language, condition: string): string | null => {
  const exp = conditionExpression(language, condition);
  return exp.kind === "compound" ? exp.operator : null;
};

/**
 * The four languages whose real-world "and"/"or" bind looser than the
 * comparison operators, and short-circuit. Pascal is deliberately excluded
 * from both changes (its real precedence *is* the tighter one, and standard
 * Pascal doesn't guarantee short-circuiting either); so is BASIC, whose
 * AND/OR/EOR are the documented bitwise-and-boolean operators of BBC BASIC
 * rather than logical connectives of their own.
 */
const LOGICAL_LANGUAGES = ["Python", "C", "Java", "TypeScript"] as const;

/**
 * The four languages with short-circuiting "and"/"or". Naming the union rather
 * than widening to `Language` is what makes the per-language fixture tables
 * below total, so a lookup in one needs no undefined check.
 */
type LogicalLanguage = (typeof LOGICAL_LANGUAGES)[number];

/** How each of those four spells the condition in the headline case. */
const AND_OF_COMPARISONS: Record<LogicalLanguage, string> = {
  Python: "a == b and c == d",
  C: "a == b && c == d",
  Java: "a == b && c == d",
  TypeScript: "a == b && c == d",
};

const OR_OF_COMPARISONS: Record<LogicalLanguage, string> = {
  Python: "a == b or c == d",
  C: "a == b || c == d",
  Java: "a == b || c == d",
  TypeScript: "a == b || c == d",
};

describe("compiler: logical operator precedence", () => {
  describe("and/or bind looser than comparisons", () => {
    for (const language of LOGICAL_LANGUAGES) {
      it(`gives "a == b and c == d" its real meaning in ${language}`, () => {
        // a=1 b=1 c=2 d=2, so both comparisons are true and the answer is
        // "yes". Under the old, Pascal-style precedence this parsed as
        // "a == (b and c) == d" and answered "no" (Python) or failed to
        // compile at all (C/Java/TypeScript).
        assertEquals(answer(language, AND_OF_COMPARISONS[language]), "yes");
      });

      it(`puts "and" at the root of "a == b and c == d" in ${language}`, () => {
        // the shape, not just the answer: "a == (b and c) == d" can give
        // the right answer for some inputs, so pin the tree too
        assertEquals(
          rootOperator(language, AND_OF_COMPARISONS[language]),
          "andl",
        );
      });

      it(`gives "a == b or c == d" its real meaning in ${language}`, () => {
        assertEquals(answer(language, OR_OF_COMPARISONS[language]), "yes");
        assertEquals(
          rootOperator(language, OR_OF_COMPARISONS[language]),
          "orl",
        );
      });

      it(`answers "no" when only one side of an "and" holds in ${language}`, () => {
        const condition =
          language === "Python" ? "a == b and c == a" : "a == b && c == a";
        assertEquals(answer(language, condition), "no");
      });

      it(`answers "yes" when only one side of an "or" holds in ${language}`, () => {
        const condition =
          language === "Python" ? "a == c or c == d" : "a == c || c == d";
        assertEquals(answer(language, condition), "yes");
      });
    }
  });

  describe("and binds tighter than or", () => {
    const fixtures: Record<LogicalLanguage, string> = {
      Python: "True or False and False",
      C: "true || false && false",
      Java: "true || false && false",
      TypeScript: "true || false && false",
    };

    for (const language of LOGICAL_LANGUAGES) {
      it(`parses "true or false and false" as "true or (false and false)" in ${language}`, () => {
        // if both operators sat at one level and were applied left to
        // right, this would be "(true or false) and false" = false
        assertEquals(answer(language, fixtures[language]), "yes");
        assertEquals(rootOperator(language, fixtures[language]), "orl");
      });
    }
  });

  describe("arithmetic still binds tighter than both", () => {
    const fixtures: Record<LogicalLanguage, string> = {
      Python: "1 + 1 == 2 and 2 * 2 == 4",
      C: "1 + 1 == 2 && 2 * 2 == 4",
      Java: "1 + 1 == 2 && 2 * 2 == 4",
      TypeScript: "1 + 1 == 2 && 2 * 2 == 4",
    };

    for (const language of LOGICAL_LANGUAGES) {
      it(`parses "1 + 1 == 2 and 2 * 2 == 4" correctly in ${language}`, () => {
        assertEquals(answer(language, fixtures[language]), "yes");
        assertEquals(rootOperator(language, fixtures[language]), "andl");
      });
    }
  });

  describe("the bitwise operators have rungs of their own", () => {
    // "|", "^" and "&" used to share the additive and multiplicative rungs,
    // which was nobody's real rule. They now have three rungs of their own,
    // in that order, looser than all of the arithmetic - as they are in both
    // real Python and the real C family. Where those two disagree is only in
    // where the trio sits relative to the comparisons, and each now follows
    // its own languages: see the two describes below this one.
    const printInteger: Partial<Record<Language, (expr: string) => string>> = {
      Python: (expr) => `print(str(${expr}))`,
      C: (expr) => `void main () {\nprint(itoa(${expr}));\n}`,
      Java: (expr) =>
        `class Test {\nvoid main () {\nprint(toString(${expr}));\n}\n}`,
      TypeScript: (expr) => `print(toString(${expr}));`,
    };

    /** Evaluates an integer expression in `language`, as a decimal string. */
    const value = (language: LogicalLanguage, expr: string): string =>
      runProgram(language, printInteger[language]!(expr));

    for (const language of LOGICAL_LANGUAGES) {
      it(`binds "*" tighter than "&" in ${language}`, () => {
        // the old parse, with "&" and "*" sharing a rung and going left to
        // right, was "(3 & 2) * 3" = 6
        assertEquals(value(language, "3 & 2 * 3"), "2");
      });

      it(`binds "+" tighter than "&" in ${language}`, () => {
        // was "4 + (3 & 1)" = 5
        assertEquals(value(language, "4 + 3 & 1"), "1");
      });

      it(`binds "^" tighter than "|" in ${language}`, () => {
        // was "(1 | 2) ^ 3" = 0, the two sharing the additive rung
        assertEquals(value(language, "1 | 2 ^ 3"), "1");
      });

      it(`binds "&" tighter than "|" in ${language}`, () => {
        // the one ordering the old table already had right, so this holds
        // the trio's internal order down at both ends: "6 & (3 | 8)" = 2
        assertEquals(value(language, "6 & 3 | 8"), "10");
      });
    }
  });

  describe("Python binds the bitwise operators tighter than the comparisons", () => {
    // real Python's order, so "x & 1 == 1" means "(x & 1) == 1"
    it('parses "5 & 1 == 1" as "(5 & 1) == 1"', () => {
      assertEquals(answer("Python", "5 & 1 == 1"), "yes");
      assertEquals(rootOperator("Python", "5 & 1 == 1"), "eqal");
    });

    it("the other direction, so it can't pass on a coincidence", () => {
      // "(5 & 2) == 1" is "0 == 1", false; the C reading, "5 & (2 == 1)",
      // would be "5 & 0" = 0, which Python also counts as false - hence the
      // root-operator assertion above rather than an answer alone
      assertEquals(answer("Python", "5 & 2 == 1"), "no");
    });
  });

  describe("C, Java and TypeScript bind them looser than the comparisons", () => {
    // real C's order, so "x & 1 == 1" means "x & (1 == 1)" - the classic
    // gotcha, faithfully reproduced. Turtle catches it where C and JavaScript
    // don't: "integer & boolean" is a type error, as it is in real Java and
    // real TypeScript, so the mis-parse can't silently evaluate to zero.
    const mixed: Record<"C" | "Java" | "TypeScript", string> = {
      C: "void main () {\nint x = 5;\nprint(itoa(x & 1 == 1));\n}",
      Java: "class Test {\nvoid main () {\nint x = 5;\nprint(toString(x & 1 == 1));\n}\n}",
      TypeScript: "var x: number = 5;\nprint(toString(x & 1 == 1));",
    };

    for (const language of ["C", "Java", "TypeScript"] as const) {
      it(`rejects "x & 1 == 1" as a type error in ${language}`, () => {
        assertCompilerError(language, mixed[language], "Type error");
      });
    }

    it("accepts it once bracketed, and then means the obvious thing", () => {
      for (const language of ["C", "Java", "TypeScript"] as const) {
        assertEquals(answer(language, "(5 & 1) == 1"), "yes");
        assertEquals(answer(language, "(5 & 2) == 1"), "no");
      }
    });
  });

  describe('Python\'s "not" binds looser than comparisons', () => {
    it('parses "not a == c" as "not (a == c)"', () => {
      // a=1, c=2, so "not (a == c)" is true. The old parse, "(not a) == c",
      // is "0 == 2", i.e. false.
      assertEquals(answer("Python", "not a == c"), "yes");
      assertEquals(rootOperator("Python", "not a == c"), "not");
    });

    it('parses "not a == b" as "not (a == b)"', () => {
      // the other direction, so the test can't pass on a coincidence
      assertEquals(answer("Python", "not a == b"), "no");
    });

    it('binds "not" tighter than "and"', () => {
      // both comparisons are false (a=1, b=1, c=2), so the two candidate
      // parses disagree: "(not (a == c)) and (b == c)" is
      // "true and false" = false, while "not ((a == c) and (b == c))"
      // would be true. Real Python means the first.
      assertEquals(answer("Python", "not a == c and b == c"), "no");
      assertEquals(rootOperator("Python", "not a == c and b == c"), "andl");
    });

    it('allows a doubled "not"', () => {
      assertEquals(answer("Python", "not not a == b"), "yes");
    });
  });

  describe('C/Java/TypeScript\'s "!" stays tighter than comparisons', () => {
    // unlike Python's "not", these languages' "!" really is tighter than
    // "==", so this is the current behaviour *and* the correct one
    for (const language of ["C", "Java", "TypeScript"] as Language[]) {
      it(`parses "!a == !b" as "(!a) == (!b)" in ${language}`, () => {
        // both operands are booleans, which is what makes this expressible
        // at all: this type system won't compare a boolean with an integer,
        // so real C's "!a == c" is rejected here whichever way it binds.
        // a and b are both 1, so the two negations agree and the answer is
        // "yes"; the looser parse, "!(a == (!b))", wouldn't compile.
        assertEquals(answer(language, "!a == !b"), "yes");
        assertEquals(rootOperator(language, "!a == !b"), "eqal");
      });
    }
  });

  describe("Python membership tests keep comparison precedence", () => {
    it('parses "1 in [1, 2] and 3 in [3, 4]" as an "and" of two tests', () => {
      assertEquals(answer("Python", "1 in [1, 2] and 3 in [3, 4]"), "yes");
      assertEquals(
        rootOperator("Python", "1 in [1, 2] and 3 in [3, 4]"),
        "andl",
      );
    });

    it('parses "1 not in [3, 4] and 3 in [3, 4]" the same way', () => {
      assertEquals(answer("Python", "1 not in [3, 4] and 3 in [3, 4]"), "yes");
    });

    it('parses "not 1 in [3, 4]" as "not (1 in [3, 4])"', () => {
      assertEquals(answer("Python", "not 1 in [3, 4]"), "yes");
    });
  });

  describe("Pascal keeps Pascal's precedence", () => {
    it('requires brackets around comparisons joined by "and"', () => {
      // real Pascal binds "and" tighter than "=" too, so this is correct
      // behaviour and not a limitation - pinned so a later refactor can't
      // quietly "fix" it
      assertCompilerError(
        "Pascal",
        conditionProgram.Pascal("a = b and c = d"),
        "Type error",
      );
    });

    it("evaluates the bracketed form correctly", () => {
      assertEquals(answer("Pascal", "(a = b) and (c = d)"), "yes");
    });

    it('keeps "and" tighter than "or"', () => {
      assertEquals(answer("Pascal", "(a = b) or (c = d) and (a = c)"), "yes");
    });
  });

  describe("BASIC keeps Pascal's precedence", () => {
    // [known limitation] BASIC's AND/OR/EOR are documented (see
    // src/pages/documentation/help/BASIC/operators.ts) as bitwise-and-
    // boolean operators between integers, exactly as in BBC BASIC, and
    // that same page tells students "complex expressions require
    // brackets". Moving them would be moving the *bitwise* operators. So
    // unbracketed "a% = b% AND c% = d%" still parses as
    // "a% = (b% AND c%) = d%" and still answers "no" - deliberately, and pinned
    // here so the decision has to be revisited rather than stumbled into.
    it("parses an unbracketed AND of comparisons the Pascal way", () => {
      assertEquals(answer("BASIC", "a%=b% AND c%=d%"), "no");
      assertEquals(rootOperator("BASIC", "a%=b% AND c%=d%"), "eqal");
    });

    it("evaluates the bracketed form correctly", () => {
      assertEquals(answer("BASIC", "(a%=b%) AND (c%=d%)"), "yes");
    });

    it("keeps AND tighter than OR", () => {
      assertEquals(answer("BASIC", "(a%=b%) OR (c%=d%) AND (a%=c%)"), "yes");
    });
  });
});

/**
 * Per-language shell for the short-circuiting tests: a global counter `n`
 * and two functions that both bump it, `one()` returning 1 (truthy) and
 * `zero()` returning 0 (falsy). The counter is printed last, so "was the
 * right operand evaluated?" - the only observable difference short-
 * circuiting makes - is just a number in the output. Asserting the emitted
 * jumps instead would pin one encoding of laziness rather than the
 * semantics.
 */
const countingProgram: Partial<Record<Language, (body: string) => string>> = {
  Python: (body) =>
    `n = 0\n` +
    `def one():\n    global n\n    n = n + 1\n    return 1\n` +
    `def zero():\n    global n\n    n = n + 1\n    return 0\n` +
    `${body}\nprint(str(n))`,
  C: (body) =>
    `int n = 0;\n` +
    `int one () {\nn = n + 1;\nreturn 1;\n}\n` +
    `int zero () {\nn = n + 1;\nreturn 0;\n}\n` +
    `void main () {\n${body}\nprint(itoa(n));\n}`,
  Java: (body) =>
    `class Test {\nint n = 0;\n` +
    `int one () {\nn = n + 1;\nreturn 1;\n}\n` +
    `int zero () {\nn = n + 1;\nreturn 0;\n}\n` +
    `void main () {\n${body}\nprint(toString(n));\n}\n}`,
  TypeScript: (body) =>
    `var n: number = 0;\n` +
    `function one (): number {\nn = n + 1;\nreturn 1;\n}\n` +
    `function zero (): number {\nn = n + 1;\nreturn 0;\n}\n` +
    `${body}\nprint(toString(n));`,
};

/** Runs `body` in the shell above: everything it printed, and the call count. */
const counted = (
  language: Language,
  body: string,
): { printed: string[]; calls: number } => {
  const shell = countingProgram[language] as (body: string) => string;
  const lines = runProgram(language, shell(body)).split("\n");
  return {
    printed: lines.slice(0, -1),
    calls: Number(lines[lines.length - 1]),
  };
};

/** How each language spells the two operators, and an "if" around a condition. */
const OR: Record<LogicalLanguage, string> = {
  Python: "or",
  C: "||",
  Java: "||",
  TypeScript: "||",
};
const AND: Record<LogicalLanguage, string> = {
  Python: "and",
  C: "&&",
  Java: "&&",
  TypeScript: "&&",
};
const ifTaken: Record<LogicalLanguage, (condition: string) => string> = {
  Python: (condition) => `if ${condition}:\n    print('taken')`,
  C: (condition) => `if (${condition}) { print('taken'); }`,
  Java: (condition) => `if (${condition}) { print('taken'); }`,
  TypeScript: (condition) => `if (${condition}) { print('taken'); }`,
};

describe("compiler: logical operator short-circuiting", () => {
  describe("the right operand is skipped when the left decides the answer", () => {
    for (const language of LOGICAL_LANGUAGES) {
      it(`skips the right of "or" when the left is true in ${language}`, () => {
        const { printed, calls } = counted(
          language,
          ifTaken[language](`one() == 1 ${OR[language]} one() == 1`),
        );
        assertEquals(printed, ["taken"]);
        assertEquals(calls, 1);
      });

      it(`evaluates the right of "or" when the left is false in ${language}`, () => {
        const { printed, calls } = counted(
          language,
          ifTaken[language](`zero() == 1 ${OR[language]} one() == 1`),
        );
        assertEquals(printed, ["taken"]);
        assertEquals(calls, 2);
      });

      it(`skips the right of "and" when the left is false in ${language}`, () => {
        const { printed, calls } = counted(
          language,
          ifTaken[language](`zero() == 1 ${AND[language]} one() == 1`),
        );
        assertEquals(printed, []);
        assertEquals(calls, 1);
      });

      it(`evaluates the right of "and" when the left is true in ${language}`, () => {
        const { printed, calls } = counted(
          language,
          ifTaken[language](`one() == 1 ${AND[language]} one() == 1`),
        );
        assertEquals(printed, ["taken"]);
        assertEquals(calls, 2);
      });

      it(`stops at the first true operand of a chained "or" in ${language}`, () => {
        const condition = ["one() == 1", "one() == 1", "one() == 1"].join(
          ` ${OR[language]} `,
        );
        assertEquals(counted(language, ifTaken[language](condition)).calls, 1);
      });

      it(`evaluates every operand of a chained "or" that stays false in ${language}`, () => {
        const condition = ["zero() == 1", "zero() == 1", "one() == 1"].join(
          ` ${OR[language]} `,
        );
        const { printed, calls } = counted(
          language,
          ifTaken[language](condition),
        );
        assertEquals(printed, ["taken"]);
        assertEquals(calls, 3);
      });
    }
  });

  describe("the value rules are unchanged", () => {
    // these already held before short-circuiting existed (PCode.orl is
    // "n1 || n2" and PCode.andl is "n1 && n2"), and the whole point of
    // emitting the jumps the way they are emitted is that the surviving
    // operand's own value is what the expression evaluates to. Python is
    // the only one of the four whose type system lets an "or" of two
    // integers be used *as* an integer, which is why these aren't run
    // across the table.
    const value = (expression: string): string =>
      runProgram("Python", `print(str(${expression}))`);

    it('gives "0 or 5" the value 5', () => {
      assertEquals(value("0 or 5"), "5");
    });

    it('gives "2 and 3" the value 3', () => {
      assertEquals(value("2 and 3"), "3");
    });

    it('gives "0 and 5" the value 0', () => {
      assertEquals(value("0 and 5"), "0");
    });

    it("keeps the value when the right operand is skipped", () => {
      // the left operand's value has to survive the jump, not be consumed
      // by the test that decides whether to take it
      const { printed, calls } = counted("Python", "print(str(5 or one()))");
      assertEquals(printed, ["5"]);
      assertEquals(calls, 0);
    });
  });

  describe("a short-circuit nested inside a bigger expression", () => {
    // the jump has to land mid-expression rather than at a statement
    // boundary, with the surrounding arithmetic still to come after it
    it("skips the right operand and keeps arithmetic around it correct", () => {
      const { printed, calls } = counted(
        "Python",
        `x = 1 + (one() or one()) * 2\nprint(str(x))`,
      );
      assertEquals(printed, ["3"]);
      assertEquals(calls, 1);
    });

    it("uses the right operand's value when the left is falsy", () => {
      const { printed, calls } = counted(
        "Python",
        `x = 1 + (zero() or 5) * 2\nprint(str(x))`,
      );
      assertEquals(printed, ["11"]);
      assertEquals(calls, 1);
    });

    it("short-circuits inside a function call's argument", () => {
      const { printed, calls } = counted(
        "Python",
        `print(str(1 + (one() or one())))`,
      );
      assertEquals(printed, ["2"]);
      assertEquals(calls, 1);
    });
  });

  describe("each statement type's own line arithmetic still works", () => {
    // every statement encoder computes its jump targets from its
    // condition's actual length, so a condition that grows from one pcode
    // line to several is the regression risk. C has all four shapes with a
    // full expression as the condition (Python has no repeat/until, and
    // its "for" iterates a range rather than testing a condition), so the
    // sweep is done there, with Python covering the two it does have.
    it("an if condition", () => {
      const { printed, calls } = counted(
        "C",
        `if (one() == 1 || one() == 1) { print('taken'); } else { print('not'); }`,
      );
      assertEquals(printed, ["taken"]);
      assertEquals(calls, 1);
    });

    it("an else branch after a short-circuiting condition", () => {
      const { printed, calls } = counted(
        "C",
        `if (zero() == 1 && one() == 1) { print('taken'); } else { print('not'); }`,
      );
      assertEquals(printed, ["not"]);
      assertEquals(calls, 1);
    });

    it("a while condition", () => {
      const { printed, calls } = counted(
        "C",
        `int i = 0;\nwhile (i < 3 && one() == 1) {\ni = i + 1;\n}\nprint(itoa(i));`,
      );
      // one() is called on the three passes that get past "i < 3", and not
      // on the fourth, which is where the loop stops
      assertEquals(printed, ["3"]);
      assertEquals(calls, 3);
    });

    it("a do/while (repeat) condition", () => {
      const { printed, calls } = counted(
        "C",
        `int i = 0;\ndo {\ni = i + 1;\n} while (i < 3 && one() == 1);\nprint(itoa(i));`,
      );
      assertEquals(printed, ["3"]);
      assertEquals(calls, 2);
    });

    it("a for condition", () => {
      const { printed, calls } = counted(
        "C",
        `int i;\nfor (i = 0; i < 3 && one() == 1; i = i + 1) {\n}\nprint(itoa(i));`,
      );
      assertEquals(printed, ["3"]);
      assertEquals(calls, 3);
    });

    it("a Python while condition", () => {
      const { printed, calls } = counted(
        "Python",
        `i = 0\nwhile i < 3 and one() == 1:\n    i = i + 1\nprint(str(i))`,
      );
      assertEquals(printed, ["3"]);
      assertEquals(calls, 3);
    });
  });

  describe("break and continue in a loop whose condition short-circuits", () => {
    // these patch their jump targets after the fact (encoder/
    // loopContext.ts), so they are the most likely thing to break when a
    // condition grows extra lines
    it("break", () => {
      const { printed, calls } = counted(
        "C",
        `int i = 0;\nwhile (i < 10 && one() == 1) {\ni = i + 1;\nif (i == 2) { break; }\n}\nprint(itoa(i));`,
      );
      assertEquals(printed, ["2"]);
      assertEquals(calls, 2);
    });

    it("continue", () => {
      const { printed, calls } = counted(
        "C",
        `int i = 0;\nint total = 0;\nwhile (i < 4 && one() == 1) {\ni = i + 1;\nif (i == 2) { continue; }\ntotal = total + i;\n}\nprint(itoa(i));\nprint(itoa(total));`,
      );
      // i runs 1..4, and 2 is skipped: 1 + 3 + 4 = 8
      assertEquals(printed, ["4", "8"]);
      assertEquals(calls, 4);
    });
  });

  describe("where the jump has to land", () => {
    it("inside a subroutine body, not just the main program", () => {
      // subroutine code is assembled before the main program and at a
      // different offset, so this is the case an absolute jump target
      // computed from the expression alone could never have got right
      const { printed, calls } = counted(
        "Python",
        `def check(x):\n    if x == 1 or one() == 1:\n        return 10\n    return 20\n` +
          `print(str(check(1)))\nprint(str(check(2)))`,
      );
      assertEquals(printed, ["10", "10"]);
      // check(1) short-circuits; check(2) doesn't
      assertEquals(calls, 1);
    });

    it("with another short-circuit nested in the right operand", () => {
      const { printed, calls } = counted(
        "Python",
        ifTaken.Python("zero() == 1 or (one() == 1 and one() == 1)"),
      );
      assertEquals(printed, ["taken"]);
      assertEquals(calls, 3);
    });
  });

  describe("the guard pattern", () => {
    it("does not evaluate the guarded indexing when the bounds test fails", () => {
      // the user-visible point of the whole step: idiomatic Python that
      // used to raise an index error
      const output = runProgram(
        "Python",
        `x = [1, 2, 3]\ni = 5\nif i < len(x) and x[i] == 0:\n    print('bad')\nelse:\n    print('safe')`,
      );
      assertEquals(output, "safe");
    });

    it("still evaluates the indexing when the bounds test passes", () => {
      const output = runProgram(
        "Python",
        `x = [1, 2, 0]\ni = 2\nif i < len(x) and x[i] == 0:\n    print('found')\nelse:\n    print('not found')`,
      );
      assertEquals(output, "found");
    });
  });

  describe("Pascal and BASIC stay eager", () => {
    // [known limitation] deliberate, and pinned rather than left to drift:
    // standard Pascal doesn't guarantee short-circuit evaluation (Delphi
    // selects it with the $B switch, and Turtle's Pascal is modelled on
    // Delphi), and BASIC's AND/OR are the bitwise operators, which can't
    // short-circuit at all - both bits of an integer AND are needed.
    it("Pascal evaluates the right operand of an already-true or", () => {
      const output = runProgram(
        "Pascal",
        `program Test;\nvar n, x: integer;\n\nfunction one: integer;\nbegin\nn := n + 1;\nresult := 1\nend;\n\nbegin\nn := 0;\nx := 1;\nif (x = 1) or (one = 1) then writeln('taken');\nwriteln(str(n))\nend.`,
      );
      assertEquals(output.split("\n"), ["taken", "1"]);
    });

    it("BASIC evaluates the right operand of an already-true OR", () => {
      const output = runProgram(
        "BASIC",
        `n% = 0\nx% = 1\nIF (x%=1) OR (FNone=1) THEN PRINT("taken")\nPRINT(STR$(n%))\nEND\n\nDEF FNone\nn% = n% + 1\n=1`,
      );
      assertEquals(output.split("\n"), ["taken", "1"]);
    });
  });
});

/**
 * Every jump target in the finished pcode, as the pair (line it's on,
 * operand), found by stepping over each instruction's arguments with
 * `pcodeArgs` - the same way `encoder/relativeJumps.ts`'s `resolve` and
 * `encoder/encode.ts`'s `addHCLR` walk a line.
 */
const jumpTargets = (pcode: number[][]): { line: number; target: number }[] => {
  const targets: { line: number; target: number }[] = [];
  for (let line = 0; line < pcode.length; line += 1) {
    const words = pcode[line]!;
    let i = 0;
    while (i < words.length) {
      // in range by the loop condition, as is the operand every opcode
      // reached here carries after it
      const code = words[i]!;
      if (code === PCode.jump || code === PCode.ifno) {
        targets.push({ line, target: words[i + 1]! });
      }
      const args = pcodeArgs(code);
      i += args === -1 ? words[i + 1]! + 2 : args + 1;
    }
  }
  return targets;
};

/**
 * The same question asked without stepping over arguments at all: is there
 * a negative number immediately after a jump opcode's value anywhere in the
 * program?
 *
 * This deliberately duplicates the check above by a *different* method,
 * because the structured walk shares its one assumption - that every
 * opcode's `pcodeArgs` count is right - with the code it is checking. Get
 * that count wrong for an opcode sitting immediately before a jump (DUPL,
 * in an "and" prologue) and `resolve`'s walk steps straight over the jump
 * instead of onto it, leaving the target unresolved; this file's walk then
 * misses it in exactly the same way and reports nothing. Verified by
 * mutation, along with the more reassuring finding that a wrong count
 * *elsewhere* on the line mostly self-heals within an instruction or two,
 * because almost every opcode takes no arguments. A flat scan can't miss
 * either case.
 *
 * The price is the false-positive hazard `encode.ts`'s `programUsesListOps`
 * documents from the other direction: an opcode's numeric value can turn up
 * as some other instruction's plain operand. Acceptable here - the inputs
 * are a handful of fixed programs rather than anything a user writes, and
 * the failure mode is a loud, deterministic complaint pointing at a line,
 * not a silent pass.
 */
const looksLikeUnresolvedJump = (pcode: number[][]): boolean =>
  pcode.some((line) =>
    line.some(
      (code, i) =>
        (code === PCode.jump || code === PCode.ifno) && line[i + 1]! < 0,
    ),
  );

describe("compiler: jump targets survive encoding", () => {
  /**
   * Short-circuiting made expressions emit jumps for the first time, as
   * *relative* targets that `encode.ts` resolves into absolute line numbers
   * once the program is assembled (see
   * src/core/compiler/encoder/relativeJumps.ts). Two things have to hold of
   * every jump in the finished program, whoever emitted it: it must have
   * been resolved, and it must point at a line that exists.
   *
   * The invariant, not the encoding: this says nothing about *where* a
   * short-circuit jumps, so it doesn't have to be rewritten if that changes.
   * What it guards is the walk both resolution and HCLR insertion depend on
   * - add an opcode whose declared argument count is wrong, and an
   * expression's target silently reaches the machine as a negative line
   * number.
   */
  const assertJumpsResolved = (label: string, pcode: number[][]): void => {
    assertFalse(
      looksLikeUnresolvedJump(pcode),
      `${label}: a jump target was left unresolved (negative)`,
    );
    for (const { line, target } of jumpTargets(pcode)) {
      // targets are one-based (runtime.ts jumps to `target - 1`), so the
      // valid range is 1 to the number of lines
      assert(
        target >= 1 && target <= pcode.length,
        `${label}: jump on line ${line} targets line ${target}, outside 1..${pcode.length}`,
      );
    }
  };

  describe("a program with an if/else over an and/or", () => {
    // all six languages, including the two that don't short-circuit - a
    // statement's own jumps have to survive the same pass
    const conditions: Record<Language, string> = {
      ...AND_OF_COMPARISONS,
      Pascal: "(a = b) and (c = d)",
      BASIC: "(a%=b%) AND (c%=d%)",
    } as Record<Language, string>;

    for (const language of LANGUAGES) {
      it(language, () => {
        assertJumpsResolved(
          language,
          compileAndEncode(
            language,
            conditionProgram[language](conditions[language]),
          ),
        );
      });
    }
  });

  describe("a program whose loops and subroutines are full of them", () => {
    // backwards jumps, break/continue patching, a subroutine assembled
    // before the main program, and short-circuits inside all of it
    const bodies: Record<string, string> = {
      while: `int i = 0;\nwhile (i < 3 && one() == 1) {\ni = i + 1;\n}\nprint(itoa(i));`,
      "do/while": `int i = 0;\ndo {\ni = i + 1;\n} while (i < 3 && one() == 1);\nprint(itoa(i));`,
      for: `int i;\nfor (i = 0; i < 3 && one() == 1; i = i + 1) {\n}\nprint(itoa(i));`,
      break: `int i = 0;\nwhile (i < 10 && one() == 1) {\ni = i + 1;\nif (i == 2) { break; }\n}\nprint(itoa(i));`,
      continue: `int i = 0;\nwhile (i < 4 && one() == 1) {\ni = i + 1;\nif (i == 2) { continue; }\n}\nprint(itoa(i));`,
    };

    for (const [name, body] of Object.entries(bodies)) {
      it(name, () => {
        const shell = countingProgram.C as (body: string) => string;
        assertJumpsResolved(name, compileAndEncode("C", shell(body)));
      });
    }
  });
});
