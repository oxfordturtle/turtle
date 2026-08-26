# Refactoring `src/core/compiler/`

| #                                              | Phase                        | Depends on | Size      |
| ---------------------------------------------- | ---------------------------- | ---------- | --------- |
| [0](#phase-0--a-benchmark-task)                | A benchmark task             | —          | Small     |
| [1](#phase-1--the-tokenizer)                   | The tokenizer                | 0          | Medium    |
| [2](#phase-2--the-encoders-address-arithmetic) | Encoder address arithmetic   | 0          | Small     |
| [3](#phase-3--delete-the-__-brand)             | Delete the `__` brand        | —          | Small     |
| [4](#phase-4--encapsulate-the-lexeme-cursor)   | Encapsulate the cursor       | —          | **Large** |
| [5](#phase-5--parse-time-state-off-the-ast)    | Parse-time state off the AST | 4          | Medium    |
| [6](#phase-6--the-circular-references)         | The circular references      | 5          | Medium    |
| [7](#phase-7--the-c-family-parser-duplication) | C-family parser duplication  | 4          | **Large** |
| [8](#phase-8--the-language-capability-table)   | Language capability table    | —          | Medium    |

Phases 1, 2 and 3 are independent of each other and of everything else, and
each is a self-contained win. **Do those first.** Phases 4–7 are the structural
work and should go in order. Phase 8 is independent of all of them and can be
picked up at any time.

---

## Orientation

_Read before starting any phase._

### What this module is

Five stages, run in order by `islands/turtle-system/program.ts`:

```
source text
  → tokenizer/   flat tokens, no grammar applied (also drives syntax highlighting)
  → lexer/       lexemes: tokens with types, values and positions resolved
  → parser/      an AST of routines, statements and expressions
  → encoder/     pcode: number[][], one array per line
  → analyser/    usage tables, for the Usage tab
```

Fuller background: [src/README.md](src/README.md), "`core/` — the compiler".

### The shape of the problem

186 files, 15,559 lines. Largest files:

| File                                                                                                   | Lines |
| ------------------------------------------------------------------------------------------------------ | ----- |
| [parser/common/factor.ts](src/core/compiler/parser/common/factor.ts)                                   | 621   |
| [tokenizer/tokenize.ts](src/core/compiler/tokenizer/tokenize.ts)                                       | 594   |
| [parser/python/statements/forStatement.ts](src/core/compiler/parser/python/statements/forStatement.ts) | 475   |
| [parser/common/arguments.ts](src/core/compiler/parser/common/arguments.ts)                             | 382   |
| [lexer/lexeme.ts](src/core/compiler/lexer/lexeme.ts)                                                   | 361   |

No file is out of hand. `deno lint` reports **4 problems** across all 186 files
(two `no-explicit-any`, two in `compoundExpression.ts`). There are 55 `as` casts
and 12 non-null assertions — worth a look, but not a crisis.

### Two hard rules

1. **The barrel rule**, as in the machine: nothing outside
   `src/core/compiler/` imports from the directory — only
   [src/core/compiler.ts](src/core/compiler.ts) does. Phases 1–5 and 7 should
   not change a single import in a single test. Phase 6 might, and says so.
2. **Phases 1, 2, 4, 5 and 7 are strictly behaviour-preserving.** That is what
   makes the example snapshots a real safety net. Defects found on the way go
   in [TODO.md](TODO.md), not into the refactor.

### Not to be confused with the machine refactor

`MACHINE_REFACTOR.md` is live and touching `src/core/machine/`. The two do not
overlap in source, but they share three files — **[TODO.md](TODO.md),
[src/README.md](src/README.md) and [test/README.md](test/README.md)** — so
coordinate edits to those. `src/core/constants/pcodes.ts` is read by both and
should be changed by neither.

### Commands

```
deno test --allow-read test/core/compiler/   # ~2s, 33 tests / 1,964 steps — the tight loop
deno task test:core                          # all core suites (59 tests / 2,638 steps)
deno task coverage:check                     # 100% lines/branches/functions on src/core — ENFORCED
deno task test:examples                      # 503 programs, ~1m45s — the behaviour proof
deno task fmt:check                          # prettier 3.4.2
deno lint src/core/compiler/
```

**Never run `deno task test:examples:update` during this work.**

### The test net

[test/core/compiler/](test/core/compiler/) — 27 files, including a per-language
parser suite, `tokenize.test.ts`, `encode.test.ts` and the encoder subdirectory.
Plus [test/examples/](test/examples/): 503 programs compiled and run,
snapshotting pcode hash, output text, runtime errors, turtle state and a canvas
digest. Coverage is held at **100%** on `src/core` by
[tools/coverageGate.ts](tools/coverageGate.ts).

---

## Baseline measurements

Everything quoted below was measured on this machine against the 503-program
example corpus (821 KB of source). Reproduce with Phase 0's task.

**Per stage, whole corpus:**

| Stage     | Time       |
| --------- | ---------- |
| tokenize  | 340 ms     |
| lexify    | 12 ms      |
| parse     | 64 ms      |
| encode    | 419 ms     |
| **total** | **835 ms** |

**Per keystroke** (the editor re-tokenizes and re-highlights the whole file on
every edit — `islands/turtle-system/program.ts:146`, `editor.ts:74`):

|                                                                        | tokenize + highlight |
| ---------------------------------------------------------------------- | -------------------- |
| median example                                                         | 0.32 ms              |
| p90                                                                    | 1.39 ms              |
| p99                                                                    | 4.04 ms              |
| **worst shipped example** (`Pascal/Models/WaveSuperposer.tpas`, 30 KB) | **49 ms**            |

`highlight` is never more than 0.3 ms of that. The tokenizer is the whole cost —
your earlier investigation was right.

Phases 1 and 2 together take the corpus from **835 ms to 130 ms**, and the
worst-case keystroke from 49 ms to under 1 ms. Both are prototyped and verified
(see each phase).

---

## Phase 0 — A benchmark task

**Size: Small. Depends on: nothing. Do this first. — DONE**, as
[tools/benchmark.ts](tools/benchmark.ts) / `deno task bench`.

There is no benchmarking, which is why the two quadratic defects above survived.
Add `tools/benchmark.ts` and a `deno task bench`, in the shape of
[tools/coverageGate.ts](tools/coverageGate.ts) (which has its own test —
`tools/coverageGate.test.ts` — and is already in the `test` task, so follow
that).

It should report, over the 503-program corpus:

- per stage: `tokenize`, `lexify`, `parse`, `encode`
- the **per-keystroke** figure specifically — `tokenize` + `highlight` on one
  file, median / p90 / worst — since that is the number a student feels
- a **scaling check**: one file repeated to 1×/2×/4×/8× its length, reporting
  ms-per-unit. A rising ms-per-unit column is what makes a quadratic obvious at
  a glance; it is how both defects above were found, and it would have caught
  either the day it landed.

Do not gate CI on absolute timings — they are machine-dependent and will produce
false failures. Gating on the _scaling ratio_ is defensible if you want a guard:
ms-per-unit at 8× should not be more than ~1.5× the figure at 1×.

---

## Phase 1 — The tokenizer

**Size: Medium. Depends on: 0. — DONE**; see "As landed" at the end of this
section for the measured result.

### The defect

[tokenize.ts](src/core/compiler/tokenizer/tokenize.ts) is **quadratic in file
size**. Measured, tokenizing one Pascal file repeated to length:

| Size   | Time     | per unit |
| ------ | -------- | -------- |
| 30 KB  | 48 ms    | 48       |
| 60 KB  | 169 ms   | 85       |
| 121 KB | 630 ms   | 158      |
| 242 KB | 2,415 ms | 302      |
| 484 KB | 9,486 ms | 593      |

Doubling the input quadruples the time. Two causes, both in functions the main
loop calls **for every token**:

1. [`string()`](src/core/compiler/tokenizer/tokenize.ts#L189) opens with
   `code = code.split("\n")[0]` — **unconditionally, before checking whether
   `code[0]` is even a quote.** Every token splits the entire remaining source
   into an array of every remaining line, to look at the first one.
2. [`comment()`](src/core/compiler/tokenizer/tokenize.ts#L93)'s Pascal arm
   computes `const end = code.match(/}/)` before testing `start` — an unanchored
   scan of all remaining source on every token, whether or not a comment starts
   here.

Both are one-line fixes. Guarding just those two gives **4–28×** and most of the
way to linear.

Beyond those, the file re-does per-call work that belongs at module level:

- `keyword()`, `inputCode()` and `queryCode()` each `map`/`filter`/`join` a
  constants table and call `new RegExp(...)` **on every token**.
- `operator()`, `delimiter()`, `boolean()`, `binary()`, `octal()`,
  `hexadecimal()` and `turtle()` each build a six-entry object literal of regex
  literals per call, to use one — six allocations, five discarded.
- `identifier()` does a linear `colours.find()` and `commands.find()` per
  identifier.
- The main loop reslices `code` after every token.

### The change

Rewrite as a single pass over `code` with an integer cursor, sticky (`/y`)
regexes set via `lastIndex`, and every per-language table built once at module
load — including a `Map` from name to token type replacing the two `.find()`
scans. `split("\n")` becomes `indexOf("\n", index)`.

The file gets _shorter_ and flatter, and one `deno-coverage-ignore-start` block
disappears: the unreachable newline check inside the BASIC/Pascal string loop
(`tokenize.ts:196-210`) exists only because `code` was pre-truncated, and has no
analogue in the cursor version.

### As landed

Verified before and after, on this machine:

- **1,351,074-case differential comparison** against the previous
  implementation, asserting identical type, content, line and character on
  every token. That is all 503 examples tokenized in all six languages (not
  only their own), plus every pair and triple of ~140 hand-picked edge
  fragments — lone `?` and `\`, unterminated strings and comments,
  `0b`/`0o`/`0x` with bad digits, `\r` vs `\r\n`, doubled and
  backslash-escaped quotes, BASIC's `$`/`%`/`#` suffixes, non-ASCII.
  **0 mismatches.**
- `deno test test/core/compiler/` — **33 tests / 1,952 steps pass unchanged.**
- `deno task test` — **99 tests / 3,153 steps.**
- `deno task test:examples` — **504 steps pass**, including the determinism
  sentinel.
- `deno task coverage:check` — back to **100%**, via the two tests below.

| Measurement                      | before  | after       |
| -------------------------------- | ------- | ----------- |
| corpus tokenize                  | 319 ms  | **18.5 ms** |
| worst keystroke (WaveSuperposer) | 47.1 ms | **1.18 ms** |
| median keystroke                 | 0.30 ms | **0.03 ms** |
| tokenize scaling ratio, 1× → 8×  | 6.38×   | **1.05×**   |

Linear, and 40× faster on the largest shipped example. The corpus total falls
from 779 ms to 476 ms; what remains is Phase 2's encoder, which is why
`deno task bench` still reported the parse+encode scaling row as SUPERLINEAR
(Phase 2 closes that).

The file did **not** get shorter: 562 → 594 lines. The per-language regex
tables that used to be built inside each matcher, per token, are now written
out once at module level, which costs vertical space and is the whole point.
The `deno-coverage-ignore-start` block did go, as predicted — the cursor
version has no truncated `code` and so no unreachable newline check.

### The coverage cost, as predicted

The gate came back exactly 2 lines / 2 branches short, both foreseen: the
trailing `return null` in `inputCode()` and `queryCode()`, which stop being
reached incidentally once those functions early-out on `code[index] !== "\\"` /
`!== "?"`. Restored by two tests — a lone `\` and a lone `?`, across all six
languages — which pin real edge behaviour nothing previously exercised: both
are `illegal`, not `badInputCode`/`badQueryCode`, because those need at least
one word character to name.

(The predicted third line, the `start === null` guard in `comment()`, was not
a factor: `COMMENT_STARTS` is typed `Record<Language, string>` from the outset,
so the guard was never written.)

---

## Phase 2 — The encoder's address arithmetic

**Size: Small. Depends on: 0. — DONE**; see "As landed" at the end of this
section for the measured result.

### The defect

`encode()` spends **72% of its time in `programStart`** (315 ms of 419 ms across
the corpus). One 8.9 KB program,
`Pascal/Logic&CS/Syllogisms.tpas`, takes **248 ms** on its own — 63% of the
entire corpus's encode time. It is not a big program; it declares nine arrays of
256 elements.

Two nested pieces of accidental quadratic work:

1. [`getLength()`](src/core/compiler/parser/definitions/variable.ts#L79) measures
   an array element with `getLength(getSubVariables(variable)[0])` —
   `getSubVariables` **constructs a `SubVariable` object for every element of the
   array** so that the first can be measured. Every element has the same length.
2. [`variableAddress()`](src/core/compiler/encoder/addresses.ts#L42) computes a
   variable's offset from scratch on every call: `indexOf` over its siblings
   (O(n)), then **allocates a whole throwaway `Program`**, copies a slice of the
   sibling array into it, and calls `getMemoryNeeded` — which reduces over that
   slice calling `getLength` on each. Called once per variable _and_ once per
   sub-variable, so an N-element array pays it N times, each costing O(N) —
   and each of those `getLength` calls was itself O(N) by (1).

### The change

Two edits, both local:

- `getLength`: `makeSubVariable(variable, 0)` instead of
  `getSubVariables(variable)[0]`. O(1) instead of O(elementCount).
- `variableAddress`: replace the `makeProgram` + `slice` + `getMemoryNeeded`
  dance with a direct loop summing `getLength` over the preceding siblings. Same
  arithmetic, no allocation.

This leaves two imports unused in `addresses.ts` (`makeProgram`,
`getMemoryNeeded`) — `deno lint` flags both; delete them.

### Worth doing at the same time

While in here, `programStart` calls `getTurtleVariables(program)` four times and
`getMemoryNeeded(program)` three times in one array literal, each rebuilding its
result. Hoist to locals — no measurable gain after the above, but it is the same
mistake in miniature and reads badly.

The deeper fix, if you want it, is to compute every variable's address **once**,
in a single prefix-sum pass, and hand the encoder a lookup. That is a bigger
change and the two edits above already remove the pathology; I would not do it
unless Phase 5 restructures the encoder's inputs anyway.

### As landed

All three edits went in as described — `makeSubVariable(variable, 0)` in
`getLength`, a fused break-on-identity loop over the preceding siblings in
`variableAddress`, and the `programStart` hoists. The two now-unused imports
(`makeProgram`, `getMemoryNeeded`) are gone from `addresses.ts`.

The one judgement call: the old code did `indexOf` then `slice(0, arrayIndex)`,
which for a **non-member** variable (`indexOf` → `-1`) would have summed all but
the last sibling. The loop sums nothing instead. That arm is unreachable —
every caller passes a member of `variable.routine.variables`, including
`subroutines.ts`'s parameters, since `getParameters` is a filter of that same
array — so the two are equivalent in practice, and fusing the scan into the sum
drops a second O(n) pass.

Verified on this machine:

- `deno task test:core` — **58 tests / 2,636 steps pass.**
- `deno task test:examples` — **504 steps pass**, including the determinism
  sentinel. The snapshots hash the pcode, so identical addresses out is the
  behaviour-preservation proof.
- `deno task coverage:check` — still **100%** on `src/core`, no new tests
  needed. (Unlike Phase 1 this cost no coverage: nothing was deleted that a
  test relied on, and `getSubVariables` is still live in `programStart.ts` and
  `subroutines.ts`.)
- `deno lint src/core/compiler/` — clean; `deno task fmt:check` — clean.

| Measurement                         | before | after       |
| ----------------------------------- | ------ | ----------- |
| corpus encode                       | 395 ms | **24.9 ms** |
| `Syllogisms.tpas`                   | 257 ms | **3.01 ms** |
| corpus total (all four stages)      | 472 ms | **102 ms**  |
| parse+encode scaling, 4 → 32 arrays | 6.58×  | **1.06×**   |

`deno task bench` now reports **both** scaling rows as linear, so the guard has
no known outstanding failure. The corpus is 102 ms against the 835 ms baseline
at the top of this document — Phases 1 and 2 together beat the 130 ms estimate.

Encode is no longer the dominant stage; `parse` is, at 53.8 ms, and it is
linear. No new defects were found on the way, so nothing was added to
[TODO.md](TODO.md).

---

## Phase 3 — Delete the `__` brand

**Size: Small. Depends on: nothing. — DONE**; see "As landed" at the end of this
section.

You are right that it is mostly unused, but not entirely — the picture is
cleanly split.

**Six brands are load-bearing.** They are the discriminants of real unions, read
at 60-odd sites:

| Brand                        | Discriminates                  | Read at   |
| ---------------------------- | ------------------------------ | --------- |
| `"Program"` / `"Subroutine"` | `Routine`                      | ~30 sites |
| `"Command"` / `"Subroutine"` | a call's target                | ~16 sites |
| `"Variable"` / `"Parameter"` | `typeCheck.ts`, `arguments.ts` | 5 sites   |
| `"constant"`                 | Python's constant-vs-variable  | 2 sites   |

**Twelve are never read anywhere:** `Token`, `Lexeme`, `Statement`,
`expression`, `Colour`, `Keyword`, `Input`, `Font`, `Cursor`, `Category`,
`Example`, `ExampleGroup`. `Statement` and `expression` in particular look like
discriminants but are not — the real ones are `statementType` and
`expressionType`, which every node already carries.

### The change

1. Delete the twelve. They cost a property on every token, lexeme, statement and
   expression node the compiler allocates, and buy nothing. Note that five live
   in `src/core/constants/`, outside this directory — check nothing in
   `islands/` or `client/` reads them first (nothing does today).
2. Rename the six survivors from `__` to `kind`. `routine.kind === "Program"`
   says what it means; `routine.__ === "Program"` needs a footnote. Mechanical
   and safe — TypeScript catches every site.

Optionally fold `"Program"`/`"Subroutine"` into the existing naming so that
`Routine`, `Statement` and `Expression` all discriminate on a field called
`kind`, rather than one on `__` and two on `<x>Type`. That is a wider rename;
worth it for consistency, but it is a separate commit. **Done too** — see the
second half of "As landed".

### As landed

**Eleven brands deleted, seven renamed to `kind`** — not twelve and six. The
audit above was wrong about one: `Keyword` is load-bearing after all. It is not
compared against `"Keyword"` anywhere, which is what the grep saw, but it is a
member of `Expression = Command | Keyword | Subroutine`
([constants/categories.ts](src/core/constants/categories.ts)), and the analyser
narrows that union with `expression.kind === "Command"` at
[usageExpression.ts:17](src/core/compiler/analyser/usageExpression.ts#L17) and
[usageCategory.ts:41](src/core/compiler/analyser/usageCategory.ts#L41).
Deleting the property makes both reads a `TS2339` — TypeScript will not read a
property that only two of the three members have. It was deleted, the checker
objected, and it went back as `kind: "Keyword"`. The cost is nil: keywords are
82 module-level constants built once at load, not per-compile allocations, which is what the "delete the twelve" argument was actually about.

The other eleven went cleanly, and two of them took a whole abstraction with
them:

- `StatementCommon`/`makeStatement` and `ExpressionCommon`/`makeExpression`
  held **nothing but the brand**. With `__` gone, `extends StatementCommon` and
  `...makeStatement()` were an empty base and an empty spread, so both
  interfaces and both factories are deleted outright, along with the spread at
  the head of all 23 node constructors.
  [definitions/statement.ts](src/core/compiler/parser/definitions/statement.ts)
  is now nothing but the union, and needs a `deno-coverage-ignore-file`
  directive for the same reason
  [lexer/types.ts](src/core/compiler/lexer/types.ts) does — a module that
  declares only types is erased at compile time, so no test can load it and the
  gate scores it 0%.
- `LexemeCommon` and `Token` keep their other fields; they just lose the brand.

Verified:

- `deno check app.ts src/ test/ tools/` — clean, as before. (`build.ts` has a
  pre-existing `TS2532` unrelated to this work.)
- `deno task lint` — 400 files, clean. `deno task fmt` — applied.
- `deno task test` — **99 tests / 3,153 steps**, identical to before.
- `deno task test:examples` — **504 steps**, including the determinism
  sentinel.
- `deno task coverage:check` — back to **100%** on both trees, via the
  directive above.

Not a performance change, and the benchmark agrees: corpus total 102 ms before,
105 ms after, which is run-to-run noise on this machine. One property fewer on
each token, lexeme, statement and expression node is not something V8's hidden
classes were charging for. The win is
that `routine.kind === "Program"` now says what it means, and that 23 node
constructors no longer open with a spread of an empty object.

### The wider rename, also landed

The optional step above was taken in the same pass: `statementType` (231 sites)
and `expressionType` (141 sites) are both now `kind`, across 51 files. Every
discriminated union the parser produces — `Routine`, `Statement`, `Expression`,
and the `Variable`/`Parameter` and `Command`/`Subroutine` pairs — now names its
tag the same thing, so `switch (stmt.kind)` in
[encoder/statement.ts](src/core/compiler/encoder/statement.ts) reads the same
way as `switch (exp.kind)` in
[encoder/expression.ts](src/core/compiler/encoder/expression.ts).

Nothing collided: statement and expression nodes had no `kind` of their own
once `__` was gone, and the handful of pre-existing `kind` identifiers are
local variables about list _element_ kinds, in other scopes. Two comments that
named the old field as prose were reworded rather than blindly substituted —
`parser/typescript.test.ts` said an expression could never "carry
`expressionType` \"character\"" when it meant the _type_, so it now says the
type.

Re-verified after the rename: `deno check` clean, `deno task lint` clean over
400 files, `fmt:check` clean, **99 tests / 3,153 steps**, **504 example
steps**, and `coverage:check` **100%** on both trees.

---

## Phase 4 — Encapsulate the lexeme cursor

**Size: Large. Depends on: nothing (but Phases 5 and 7 depend on it). — DONE**;
see "As landed" at the end of this section.

### Why not thread the index explicitly

Your instinct is to thread the next-lexeme index through explicitly. I looked
into it, and I'd advise against — **the design genuinely needs random access,
not just a forward cursor.**

There are **51 sites** that reach past `get()`/`next()` straight into
`lexemes.index` and `lexemes.lexemes`, and they are not sloppiness: BASIC,
Python and TypeScript are **two-pass** parsers. They scan once to find
subroutine boundaries, record `start`/`end` lexeme indices on each routine, then
_rewind_ — `lexemes.index = routine.start` — and parse the bodies:

```ts
// parser/python/parser.ts:22
lexemes.index = routine.start;
while (lexemes.index < routine.end) { ... }
```

`basic/parser.ts` additionally does `lexemes.lexemes.findIndex(...)` to locate
`END`. A `(node, nextIndex)` tuple-returning parser can express this, but only
by passing the index back out of every one of ~1,300 call sites _and_ keeping a
separate handle on the array for the seeks — which is the same mutable state,
spelled more loudly. The functional version would be longer and harder to read,
not shorter.

### What to do instead

Keep one cursor, but make it a real abstraction instead of a struct with public
fields. Today `Lexemes` is 23 lines exposing `lexemes`, `index`, `get`, `next` —
everything is public, so callers reach in.

Give it a closed API:

```ts
peek((offset = 0)); // today's get()
advance(); // today's next()
atEnd();
expect(content, message); // match-or-throw
match(content); // test-and-consume, boolean
skipComments();
mark() / seek(mark); // the two-pass rewind, made explicit and named
```

`mark()`/`seek()` are the point: the two-pass parse stops being a field poke and
becomes a documented operation, and `index`/`lexemes` go private.

### The duplication it removes

This is the real payoff. Across the parser there are:

- **135** occurrences of `lexemes.get()?.content !== "..."` followed by a throw
- **106** bare `if (!lexemes.get())` null guards
- **575** `new CompilerError` call sites

The overwhelmingly common shape is six lines that `expect()` collapses to one:

```ts
// before — parser/c/statements/whileStatement.ts, and 134 others like it
if (!lexemes.get() || lexemes.get()?.content !== "(") {
  throw new CompilerError(
    '"while" must be followed by an opening bracket "(".',
    lexemes.get(-1),
  );
}
lexemes.next();

// after
lexemes.expect("(", '"while" must be followed by an opening bracket "(".');
```

Do this incrementally — the new methods can land alongside the old ones, and
files can migrate one at a time with the tests green throughout.

### As landed

`index` and `lexemes` are private to the closure in
[parser/definitions/lexemes.ts](src/core/compiler/parser/definitions/lexemes.ts),
and `get`/`next` are gone. The API:

```ts
peek(offset = 0);                     // was get()
advance();                            // was next()
atEnd();
match(content);                       // test-and-consume, boolean
expect(content, message, blame?);     // match-or-throw, blaming what was found
expectAfter(content, message);        // match-or-throw, blaming the lexeme before
skipComments();                       // was parser/common/skipComments.ts, now deleted
mark() / seek(mark) / before(mark);   // the two-pass rewind, named
length / at(mark) / indexOf(content); // read-only random access
```

**`expect` had to split in two**, which the phase as written did not anticipate.
The error lexeme is not incidental — it is what the editor highlights, and the
`assertCompilerError` tests match on it — and the 89 six-line sites were split
54 / 32 / 3 between blaming `get(-1)`, `get()`, and a lexeme captured earlier.
So `expectAfter` blames the previous lexeme (the majority, and the only sound
anchor when the stream has run dry), `expect` blames whatever was found, and
`expect`'s optional third argument takes a captured lexeme for the dozen sites
that name a construct further back — `if (`'s missing bracket is reported
against the `if`, not against the bracket's absence.

`RoutineCommon.start`/`end` are now typed `Mark` rather than `number`, which
Phase 5 will remove from the AST altogether.

| Measurement                             | before | after   |
| --------------------------------------- | ------ | ------- |
| `content !== "..."` followed by a throw | 135    | **39**  |
| `new CompilerError` in `parser/`        | 567    | **466** |
| reaches into `index` / `lexemes`        | 51     | **0**   |

103 files, 311 lines net removed. The 39 remaining `content !==` sites are
genuinely different: loop conditions, and checks that deliberately do not
consume.

Behaviour-preserving, as required: 58 core tests / 2,636 steps, the 503-program
example corpus, the 100% coverage gate and `deno lint` all green, and the
benchmark unchanged (parse 54.2 ms against 53.9 ms before — noise).

One defect found on the way went to [TODO.md](TODO.md) §3 rather than into the
refactor: Java's missing-`}` error blames one past the last lexeme, so it
reaches the student with no line or character.

---

## Phase 5 — Parse-time state off the AST

**Size: Medium. Depends on: 4. — DONE**; see "As landed" at the end of
this section.

Four fields on AST nodes are not part of the tree; they are scratch space for
whichever stage was running when they were written.

| Field          | On              | Written by                                | Read by                                                                           |
| -------------- | --------------- | ----------------------------------------- | --------------------------------------------------------------------------------- |
| `loopDepth`    | `RoutineCommon` | parser                                    | parser only — its own comment says "Parse-time only; the encoder doesn't read it" |
| `start`, `end` | `RoutineCommon` | parser                                    | parser only (the two-pass rewind of Phase 4)                                      |
| `startLine`    | `Subroutine`    | **encoder** (`program/subroutines.ts:32`) | encoder                                                                           |

`startLine` is the one to look at hardest: **`encode()` mutates the `Program` it
is given.** It happens to be idempotent today (I checked — encoding the same AST
twice gives identical pcode, because `startLine` is recomputed deterministically
before it is read), so this is a latent coupling rather than a live bug. But it
means the AST is not a value, and it is exactly the sort of thing that stops
being true quietly.

### The change

- `loopDepth`, `start`, `end` → a parser-owned context object, created by
  `parseProgram` and threaded alongside `lexemes`. Phase 4's cursor is the
  natural place to hang `start`/`end`, since they are cursor positions.
- `startLine` → have `subroutines()` return a `Map<Subroutine, number>` and pass
  it to `backPatchSubroutineCalls`, instead of writing into the node. The
  encoder already has both in scope at both sites, so this is a small change.

`index` on `RoutineCommon` stays: it is the subroutine's identity, used in the
emitted pcode, and genuinely belongs to the tree.

### On the mutable arrays

The `constants`/`variables`/`subroutines`/`statements` arrays pushed to during
parsing (101 sites) are a different case, and I would **leave them alone**.
Recursive-descent parsers accumulate; the alternative is either returning
partial arrays up through every frame or rebuilding the routine object on each
push, and both are more code for no correctness gain. The mutation is confined
to construction — nothing mutates a routine's arrays after parsing finishes.
What makes it feel unsafe is that the type doesn't say so. Fixing _that_ is
cheap: have the parser build into a mutable local shape and freeze it into a
`readonly`-array `Routine` when the routine is complete. Then the AST is
immutable by type everywhere downstream, which is the property you actually
want, and the parser's internals stay simple.

### As landed

All four fields are gone from the AST. `RoutineCommon` is now seven fields of
tree and nothing else, and `encode()` no longer writes to the `Program` it is
handed.

**`startLine`** went exactly as described: `encoder/program/subroutines.ts`
returns `{ pcode, startLines }` — a `Map<Subroutine, number>` — which
`encode.ts` passes to `backPatchSubroutineCalls` and reads for C/Java's closing
call to `main`.

**`start`/`end`** went onto the cursor, in
[parser/definitions/lexemes.ts](src/core/compiler/parser/definitions/lexemes.ts),
as `setBody(routine, start, end)` / `seekBody(routine)` /
`seekPastBody(routine)` / `inBody(routine)`. The old `before(mark)` is gone,
since every one of its callers was a body loop. Making these verbs rather than
getters is what pays: `lexemes.seek(routine.start)` and
`lexemes.before(routine.end)` become `lexemes.seekBody(routine)` and
`lexemes.inBody(routine)`, and TypeScript's and Python's `lexemes.seek(sub.end + 1)`
— each with a comment explaining the `+ 1` — become `lexemes.seekPastBody(sub)`.

**`loopDepth`** went to a new context object,
[parser/definitions/context.ts](src/core/compiler/parser/definitions/context.ts),
created by `parseProgram` and threaded alongside `lexemes` through the statement
parsers of C, Java, Python and TypeScript (23 files; BASIC and Pascal have no
`break`/`continue`, so they get nothing). It is a callback rather than a pair of
counters — `context.inLoop(routine, () => parseBlock(...))` — so the increment
and decrement cannot drift apart, and `routine.loopDepth === 0` reads
`!context.insideLoop(routine)`.

**The split into two homes was forced**, and the phase as written half-expected
it ("Phase 4's cursor is the natural place to hang `start`/`end`"). Threading a
single context everywhere was tried first and abandoned: BASIC parses a
subroutine's body lazily, at its first call site, from
`parser/common/procedureCall.ts` and `functionCall.ts` — which are reached
through `factor.ts` from every language's expression parser. A context those
could see would have had to be threaded through the whole expression chain,
including Pascal's, which has no use for it. The cursor is already there.

### The mutable arrays are still mutable

Not done, and not cheap after all. Swapping a completed routine for a frozen
copy breaks object identity, and identity is load-bearing: `subroutine.parent`
and `variable.routine` are captured while the routine is still being built (as
now are the cursor's body marks, keyed by routine). Freezing in place leaves the
type unchanged, which was the whole point; casting on every push would be
lying. Making the type say "immutable downstream" needs the ids-and-lookup-table
rewrite that Phase 6 argues against on its own merits — so this stays open, and
should be judged together with Phase 6 rather than smuggled in here.

### Verification

Behaviour-preserving, as required: 59 core tests / 2,638 steps, the 503-program
example corpus, the 100% coverage gate, `deno lint` and prettier all green, and
the benchmark unchanged (parse 54.0/54.2 ms against 55.5/54.4 ms on the same
machine immediately before — noise). No test imports changed, and nothing
outside `src/core/compiler/` was touched but a stale comment in
[tools/benchmark.ts](tools/benchmark.ts), which said `encode` mutates the
program it is handed.

---

## Phase 6 — The circular references

**Size: Medium. Depends on: 5.**

### What the cycles are

Five back-references, each closing a loop with the array that contains the node:

| Field      | On                                                                      | Closes through       |
| ---------- | ----------------------------------------------------------------------- | -------------------- |
| `routine`  | `Variable`                                                              | `routine.variables`  |
| `parent`   | `Subroutine`                                                            | `parent.subroutines` |
| `variable` | `VariableValue`, `VariableAddress`, `VariableAssignment`, `SubVariable` | `variable.routine`   |
| `command`  | `ProcedureCall`, `FunctionCall`                                         | `Subroutine.parent`  |
| `constant` | `ConstantValue`                                                         | `constant.routine`   |

They are not decorative — 26 sites walk them via `getProgram()` /
`getAllSubroutines()`, and `parser/common/find.ts` resolves names by walking
`parent` up the scope chain. Removing them means giving every node an id and a
lookup table to resolve against.

### First: what is this for?

**Nothing in the codebase serialises the AST today.** The `.tmj`/`.tmb` gap in
[TODO.md](TODO.md) §3.6 is _pcode_ as JSON and binary, not the AST — and pcode
is already `number[][]`, which serialises fine. So this phase is enabling work
for something not yet specified, and the right first step is to say what:

- **AST snapshot tests** — plausible, and would be genuinely valuable given how
  much of the test suite currently reaches the AST only through pcode.
- **Debugging / an AST inspector tab** — plausible.
- **Saving a parsed program to a file** — would need a decision about
  versioning, and the pcode formats probably serve it better.

The answer changes the recommendation, so **decide before starting.**

### The recommendation

For snapshotting and debugging — the two likely answers — do **not** restructure
the AST. Write a serialiser instead:

- One `serialiseProgram(program)` in `parser/definitions/`, walking the tree and
  emitting back-references as `{ $ref: "routine/0/variable/3" }` style paths
  (or plain ids if Phase 5 gives routines and variables stable ones).
- A matching `deserialiseProgram` only if a real round trip is needed. For
  snapshots and inspection it isn't — one direction is enough.

That gets you JSON in ~150 lines, with no change to the 200-odd sites that
dereference the back-references, and no risk to a behaviour-preserving
guarantee.

The id-and-lookup-table rewrite is the right answer only if the AST must
round-trip _and_ be storage-stable. It is a genuinely large change — every
`variable.routine.language` becomes a table lookup, and `find.ts`'s scope walk
gets materially harder to read. I would not pay that for serialisation alone.

---

## Phase 7 — The C-family parser duplication

**Size: Large. Depends on: 4. — DONE**; see "As landed" at the end of this
section.

`parser/c/`, `parser/java/` and `parser/typescript/` are **3,539 lines** between
them, and large parts are copies. Diffing file by file, ignoring whitespace:

| File                            | C vs Java | C vs TypeScript | of       |
| ------------------------------- | --------- | --------------- | -------- |
| `statements/eosCheck.ts`        | **0**     | 11              | 14 lines |
| `statements/returnStatement.ts` | **0**     | 9               | 34 lines |
| `statements/simpleStatement.ts` | **0**     | 49              | 61 lines |
| `statements/whileStatement.ts`  | 4         | **3**           | 59 lines |
| `statements/doStatement.ts`     | 4         | **5**           | 80 lines |
| `identifier.ts`                 | 5         | 11              | 37 lines |
| `statements/block.ts`           | 6         | 6               | 27 lines |
| `statements/ifStatement.ts`     | 6         | 5               | 71 lines |

`c/statements/whileStatement.ts` and `typescript/statements/whileStatement.ts`
are byte-identical apart from **one type annotation** (`routine: Subroutine`
versus `routine: Program | Subroutine`) and the import that annotation needs.
Three of the C/Java pairs are identical outright.

### The change

Add `parser/cFamily/` beside `parser/common/`, holding the shared brace-and-
semicolon statement parsers parameterised by the handful of things that actually
differ (`Program | Subroutine` vs `Subroutine`, `int` vs `number`, whether `div`
is a keyword). Keep `parser/c/`, `parser/java/` and `parser/typescript/` as thin
directories holding only genuine divergence — which is what
[src/README.md](src/README.md) already says they are for.

Do it a statement at a time, easiest first (`eosCheck`, `returnStatement`,
`whileStatement`, `block`), with the per-language parser suites and the example
snapshots green at each step. Stop when the remaining differences are real:
`type.ts` (108 lines of difference between C and Java) and `forStatement.ts` are
probably not worth forcing together.

**Do this after Phase 4.** Merging these files while each carries its own copy
of the six-line expect-or-throw boilerplate means merging the boilerplate too;
after Phase 4 the bodies are short enough that what differs is obvious.

Pascal, BASIC and Python are genuinely different languages here and should stay
separate. Python especially — as `src/README.md` notes, most of the compiler's
real complexity is Python's.

### As landed

`parser/cFamily/` now holds nine files. The parameterisation is a `dialect`
argument threaded through the shared parsers, declared in `cFamily/dialect.ts`:

```ts
interface StatementEnd {
  eosCheck(lexemes: Lexemes): void;
}

interface CFamilyDialect<R extends Program | Subroutine> extends StatementEnd {
  parseStatement(lexeme, lexemes, context, routine: R): Statement;
}
```

Two things only. `eosCheck` is the semicolon-versus-newline split — C and Java
share `cFamily/statements/eosCheck.ts`, TypeScript keeps its own. Everything
else the plan listed as "the handful of things that differ" turned out not to
need a dialect entry at all:

- **`Program | Subroutine` vs `Subroutine`** became the type parameter `R`
  rather than a value. Each shared parser is generic in it and infers it from
  the `routine` it is passed, so C and Java stay strictly typed to `Subroutine`
  and TypeScript keeps its top-level statements, with no widening and no
  bivariance escape hatch.
- **`int` vs `number` and whether `div` is a keyword** never reached these
  files — they live in `type.ts` and the tokenizer, both untouched.

Each language builds its dialect at the foot of its own `statement.ts`, right
after the `parseStatement` it names:

```ts
const dialect: CFamilyDialect<Subroutine> = { eosCheck, parseStatement };
```

That placement is deliberate: a separate `c/dialect.ts` would have to import
`c/statement.ts` while `c/statement.ts` imported it back, and the object
literal would evaluate `parseStatement` in its temporal dead zone. Declaring it
in the same file removes the cycle rather than tiptoeing around it. `cFamily/`
imports nothing from `c/`, `java/` or `typescript/` — the dependency runs one
way only, which is what Phase 6 will want.

#### What moved

| File                            | Now                                            |
| ------------------------------- | ---------------------------------------------- |
| `statements/eosCheck.ts`        | `cFamily/` (C, Java); TypeScript keeps its own |
| `statements/block.ts`           | `cFamily/` (all three)                         |
| `statements/ifStatement.ts`     | `cFamily/` (all three)                         |
| `statements/whileStatement.ts`  | `cFamily/` (all three)                         |
| `statements/doStatement.ts`     | `cFamily/` (all three)                         |
| `statements/returnStatement.ts` | `cFamily/` (all three)                         |
| `identifier.ts`                 | `cFamily/` (all three)                         |
| `statements/simpleStatement.ts` | `cFamily/` (C, Java)                           |
| `statements/variableAssignment` | `cFamily/` (C, Java)                           |

The last two are the plan's "0 lines of difference between C and Java" rows.
`variableAssignment.ts` needed no parameterisation whatever — it imports only
`common/` and `definitions/`. `simpleStatement.ts` did: though textually
identical, C's and Java's copies reach for their own `constant.ts` and
`variable.ts`, which are genuinely different (C's array brackets follow the
variable name, Java's belong to the type). It is therefore the one shared
parser exported as a factory — `makeParseSimpleStatement({ constant, variable })`
— so that `c/statements/simpleStatement.ts` and its Java twin are five lines
each and every call site is unchanged.

Stopped where the plan said to stop: `type.ts` and `forStatement.ts` stay per
language. `forStatement.ts` now takes the dialect so it can call the shared
`parseBlock`, but its own body — three clauses in C and Java, different error
messages and an explicit `expectAfter(";")` in TypeScript — is real divergence.
TypeScript's `simpleStatement.ts` and `variableAssignment.ts` likewise stay:
its `const`/`var` hoisting and its extra `":"`/`"["` diagnostics are its own.

#### Three behavioural near-misses, checked

- **C's `if` used `expect`, Java's and TypeScript's `expectAfter`.** C passed
  `ifLexeme` as `expect`'s third argument to blame the `if` itself. But
  `parseIfStatement` is only ever called after `lexemes.advance()` past that
  `if`, so `expectAfter`'s `peek(-1)` **is** `ifLexeme`. Merged to
  `expectAfter`; the error still points at the `if` (verified: `("if", line 2,
index 1)` for `void main () {\nif true {\n}\n}`, as before).
- **`doStatement` synthesised its `!` with `operatorLexeme(notToken, "C")`
  — in Java too.** The shared version passes `routine.language`, which is
  finally correct for Java, and is a no-op: the `language` argument only
  changes the subtype of `=`, `and` and `or`, never `!`, which is `not` in
  every language.
- **C's `variableAssignment` blamed `assignmentLexeme` where Java blamed
  `lexemes.peek(-1)`.** After the `advance()` past `=`, those are the same
  lexeme. Kept C's spelling, which says so.

#### The coverage directives

Nine `deno-coverage-ignore-start` blocks went, unreplaced. Every one was Java's
— an `atEnd()` or `!lexeme` guard that Java's `program.ts` makes unreachable by
guaranteeing the final lexeme is `"}"`, but which C, having no such guarantee,
reaches and tests. Once the two share a file the branch is simply covered.
`java/type.ts`, `java/constant.ts`, `java/subroutine.ts`, `java/program.ts` and
`java/statements/forStatement.ts` keep theirs, being files that did not merge.

The one directive added is `deno-coverage-ignore-file` on `cFamily/dialect.ts`,
which declares types and nothing else.

#### Verified

- `deno task test` — **100 tests / 3,155 steps**, unchanged from before.
- `deno task test:examples` — **7 tests / 503 steps**, including the
  determinism sentinel. No snapshot moved.
- `deno task coverage:check` — **100% on lines, branches and functions**,
  enforced, first run.
- `deno check src/`, `deno task lint`, `deno task fmt` — clean.

| Directory     | before    | after     |
| ------------- | --------- | --------- |
| `c/`          | 1,029     | 609       |
| `java/`       | 1,197     | 743       |
| `typescript/` | 1,138     | 882       |
| `cFamily/`    | —         | 569       |
| **total**     | **3,364** | **2,803** |

561 lines gone, 17%. (The 3,539 in the table above was measured before Phases 4
and 5 shortened these files.) Corpus parse time is unmoved — 52.7 ms before,
52.6 ms after — which is the expected answer for one extra property lookup per
statement.

---

## Phase 8 — The language capability table

**Size: Medium. Depends on: —.**

Six languages, and the differences between them are currently expressed three
different ways: as data in a `Record<Language, …>` table, as one bare array
literal, and as ninety-odd inline conditionals. Only the first scales.

| Stage     | Lines      | `language ===` / `Record<Language>` sites |
| --------- | ---------- | ----------------------------------------- |
| tokenizer | 687        | 12                                        |
| lexer     | 655        | 12                                        |
| parser    | 11,222     | 45                                        |
| encoder   | 2,471      | 12                                        |
| analyser  | 137        | 3                                         |
| formatter | 173        | 8                                         |
| **total** | **15,345** | **92**                                    |

The tables that already work, and are the model for this phase:

- `tokenizer/tokenize.ts` — `COMMENT_STARTS`, `SYMBOLS`, `DOUBLES_QUOTES`,
  `LITERALS`, `TURTLES` and `IDENTIFIERS`, all `Record<Language, …>`, with a
  `byLanguage` helper to build them.
- `parser/definitions/operators.ts` — its `precedence` table, a
  `Record<Language, …>` mapping six languages onto three ladders.
- `constants/languages.ts` — `extension` and `trueValue`.
- `constants/commands.ts` — 1,642 lines covering all six languages through one
  `names: Record<Language, string | null>` field.

Everything below is the same kind of fact, written the wrong way.

### The evidence

One capability — **Pascal's case-insensitive identifiers** — is spelled out
**20 times, in 7 files, across 4 of the 5 stages**:

| File                             | Sites |
| -------------------------------- | ----- |
| `parser/common/find.ts`          | 9     |
| `tokenizer/tokenize.ts`          | 3     |
| `lexer/lexeme.ts`                | 3     |
| `analyser/usageExpression.ts`    | 2     |
| `analyser/usageCategory.ts`      | 1     |
| `parser/definitions/routine.ts`  | 1     |
| `parser/definitions/variable.ts` | 1     |

Every one of them is either `language === "Pascal" ? x.toLowerCase() : x` or the
`"iy"`-versus-`"y"` regex flag. Nothing in the code says they are one fact, so
a seventh language that folds case means finding all twenty by grep.

The other clusters have the same shape:

| Capability                            | Languages       | Sites                    |
| ------------------------------------- | --------------- | ------------------------ |
| Case-insensitive identifiers          | Pascal          | 20                       |
| Strings indexed from 1, not 0         | Pascal          | 5 (all encoder)          |
| Has a character type                  | C, Java, Pascal | 4 — and it has a name    |
| `not` is logical, not bitwise         | C, Python, TS   | 1 (encoder)              |
| Booleans and integers interconvert    | Python, TS      | 2 (`typeCheck.ts`)       |
| `main` is the entry point             | C, Java         | 2 (parser + encoder)     |
| Functions may be called as statements | Python, TS      | 1 (`procedureCall.ts`)   |
| Reference parameters                  | BASIC, Pascal   | 2 (both `subroutine.ts`) |
| `=` is comparison, not assignment     | BASIC, Pascal   | 1 (`lexeme.ts`)          |
| `true` is 1, not −1                   | Python, TS      | already a table          |

The character-type entry is the telling one. It is the only capability here
that has ever been _named_ — `languagesWithCharacterType = ["C", "Java",
"Pascal"]` — and it is a bare `const` inside a function's file,
[parser/definitions/expression.ts:32](src/core/compiler/parser/definitions/expression.ts#L32),
which two other sites refer to **by comment rather than by import**
([typescript/type.ts:88](src/core/compiler/parser/typescript/type.ts#L88),
[definitions/statements/variableAssignment.ts:51](src/core/compiler/parser/definitions/statements/variableAssignment.ts#L51)).
Someone reached for exactly the right abstraction and had nowhere to put it.
This phase is giving it somewhere.

### The change

Extend [src/core/constants/languages.ts](src/core/constants/languages.ts) —
which already holds `extension` and `trueValue`, and is already imported
everywhere `Language` is — with one capability record:

```ts
export interface LanguageTraits {
  readonly caseInsensitive: boolean; // Pascal
  readonly characterType: boolean; // C, Java, Pascal
  readonly stringIndexBase: 0 | 1; // Pascal is 1
  readonly entryPoint: "main" | "top-level";
  readonly statementCalls: "any" | "procedures-only";
  readonly referenceParameters: boolean; // BASIC, Pascal
  readonly booleanIsInteger: boolean; // Python, TypeScript
  readonly arrays: "fixed" | "dynamic"; // see below
}

export const traits: Record<Language, LanguageTraits> = { ... };
```

Then replace the conditionals, one capability at a time. Most become a field
read at the site. The twenty case-folding sites are worth one helper —
`foldCase(language, name)`, reading `traits[language].caseInsensitive` — since
they are all the same expression rather than the same fact used differently.

**Strictly behaviour-preserving**, and cheaply proved: no pcode changes at all,
so the 503 example snapshots are the whole safety net, and each capability can
land as its own commit.

### Two axes, not a family tree

The temptation is to declare a family hierarchy — Pascal-like, C-like,
Python-like — and hang every difference off it. The data says no.

**Syntax** clusters C, Java and TypeScript tightly; that is Phase 7's evidence,
0–19 lines of difference per file between C and Java. It does _not_ cluster
Pascal with BASIC. Diffing those two the same way:

| File                            | Pascal ~ BASIC | (C ~ Java, for scale) |
| ------------------------------- | -------------- | --------------------- |
| `statements/whileStatement.ts`  | 32 of 58       | 4                     |
| `statements/ifStatement.ts`     | 72 of 78       | 6                     |
| `statements/simpleStatement.ts` | 41 of 42       | 0                     |
| `statements/forStatement.ts`    | 164            | 12                    |
| `subroutine.ts`                 | 257            | 19                    |

They share a precedence ladder and nothing else structural. There is no
`parser/pascalFamily/` to be had.

**Semantics** cuts across syntax rather than following it. TypeScript is
syntactically C-family and semantically heading for Python's model (below).
Pascal and BASIC pair on reference parameters and on `=`-as-comparison, but not
on case sensitivity or string indexing. C shares `trueValue` with Pascal and
`not`-is-logical with Python.

So: two independent tables, not one tree. `operators.ts` is the syntax-axis
table and is already right. `traits` is the semantics-axis table. A language is
a row in each, and the two rows need not agree.

If Phase 7 lands first, its `CFamilyDialect` record is a third, narrower
syntax-axis table. Keep it to syntax — the routine type, the keyword spellings,
the `parseStatement` hook — and let anything semantic go to `traits` instead.

### The list work is coming

TypeScript's array model today is a fixed-size array with a compile-time
constant bound — `var x: number[10]`, parsed in
[typescript/type.ts](src/core/compiler/parser/typescript/type.ts#L70) — which is
neither TypeScript syntax nor JavaScript semantics. It is a **stop-gap**, put in
before Python's list machinery existed. The intention is for TypeScript to
follow Python, so that arrays behave like real JS arrays, and for Java to gain
lists on the same machinery.

That is later work and out of scope here. It bears on this phase in one way:
it is precisely the kind of change the table exists for. `isList` currently
appears 25 times in `parser/python/` and **zero** times in the other five
language directories, while `parser/definitions/variable.ts` already carries the
entire vocabulary — `isList`, `listElementKind`, `isListOfLists`,
`innerListElementKind` — for Python's sake alone. The machine's list operators
are generic in mechanism and Python-flavoured in only a few behaviours
(`repr()`-style output, `insert` clamping, negative `n` in `list * n`).

So when TypeScript and Java move, "which languages have dynamic lists?" wants
one answer in one place, not a fresh scattering of `language === "Python" ||
language === "TypeScript"`. Include `arrays: "fixed" | "dynamic"` in the record
now, even though it reads `"fixed"` for five of six languages on the day it
lands. It is the field that is about to change.

### What not to put in the table

Not every conditional is a capability. `parser/common/arguments.ts`
special-cases Python's `input` and `print` by name; `factor.ts` carries Python's
slice syntax at four sites and BASIC's `(`/`)` array brackets at four more;
`tokenize.ts:172` handles Pascal's block comments. Those are syntax, they belong
to their language, and a boolean would only obscure them.

The test is whether the fact has a name a teacher would recognise. "Pascal isn't
case sensitive" does. "Python's `print` takes a `sep` argument" doesn't.

About a third of the 92 sites are real capabilities. Leave the rest alone.

### Order of work

Easiest first, each its own commit, snapshots green at each step:

1. **`characterType`** — move `languagesWithCharacterType` into the table and
   import it at the four sites. Smallest, and it ends the
   referenced-by-comment problem.
2. **`caseInsensitive`** — the 20 sites, via `foldCase`. The largest win and
   entirely mechanical.
3. **`stringIndexBase`** — the 5 encoder sites.
4. **`entryPoint`, `referenceParameters`, `statementCalls`,
   `booleanIsInteger`** — one to three sites each.
5. **`arrays`** — declare the field, wire nothing to it.

Stop there. `not`-is-logical sits next to the bitwise-precedence limitation
pinned in [TODO.md](TODO.md) §1.1, and should be moved only alongside that
decision rather than in passing.

---

## Summary

| Phase               | Cost   | Buys                                                                                     |
| ------------------- | ------ | ---------------------------------------------------------------------------------------- |
| 0 Benchmark task    | Small  | The thing whose absence let 1 and 2 happen                                               |
| 1 Tokenizer         | Medium | 49 ms → 1.2 ms per keystroke on the worst example; quadratic → linear — **done**         |
| 2 Encoder addresses | Small  | Corpus encode 395 ms → 25 ms; one program 257 ms → 3.0 ms — **done**                     |
| 3 `__` brand        | Small  | 11 dead properties gone, 7 survivors named honestly; every AST tag now `kind` — **done** |
| 4 Cursor            | Large  | ~240 duplicated guards collapsed; the two-pass seek made explicit                        |
| 5 Parse-time state  | Medium | `encode()` stops mutating its input; AST becomes a value                                 |
| 6 Circular refs     | Medium | JSON — _if_ Phase 6's opening question has an answer                                     |
| 7 C-family parsers  | Large  | ~1,000 lines of copy-paste                                                               |
| 8 Capability table  | Medium | 20 copies of one fact become one field; the seam the list work needs                     |

Phases 1 and 2 are eight lines of real change between them, both verified
against the full suite and the 503-program snapshots, and together they take the
compiler from 835 ms to 130 ms on the corpus. They are worth doing this week,
independently of whether the rest of the plan is ever picked up.
