# Refactoring `src/core/compiler/`

A staged plan, in the shape of [MACHINE_REFACTOR.md](MACHINE_REFACTOR.md). Each
phase is self-contained and can be picked up cold — but **read "Orientation"
first, every time.**

Unlike the machine, this module is not in bad shape. It is 186 files averaging
84 lines, with a good separation of stages and genuinely explanatory comments.
`MACHINE_REFACTOR.md` holds it up as the target shape for `runtime.ts`, and that
is fair. What follows is therefore mostly **sharpening**, not rescue — with one
exception: the performance work in Phases 1 and 2, where two localised defects
make the compiler quadratic in ways that are visible to a student.

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

Phases 1, 2 and 3 are independent of each other and of everything else, and
each is a self-contained win. **Do those first.** Phases 4–7 are the structural
work and should go in order.

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
| [tokenizer/tokenize.ts](src/core/compiler/tokenizer/tokenize.ts)                                       | 562   |
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
deno test --allow-read test/core/compiler/   # ~2s, 33 tests / 1,952 steps — the tight loop
deno task test:core                          # all core suites (58 tests / 2,759 steps)
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

**Size: Small. Depends on: nothing. Do this first.**

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

**Size: Medium. Depends on: 0.**

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

### Evidence

A prototype of exactly this was written and checked:

- **Identical token output on all 503 example programs.**
- **130,560-case differential fuzz** against the current implementation —
  every pair and triple of 110 hand-picked edge fragments (lone `?` and `\`,
  unterminated strings and comments, `0b`/`0o`/`0x` with bad digits, `\r` vs
  `\r\n`, doubled and backslash-escaped quotes, BASIC's `$`/`%`/`#` suffixes,
  non-ASCII) across all six languages — **0 mismatches**.
- `deno test test/core/compiler/` — **33 tests / 1,952 steps pass unchanged.**
- `deno task test:examples` — **504 steps pass**, including the determinism
  sentinel.

Result:

| Size   | before   | after       |
| ------ | -------- | ----------- |
| 30 KB  | 46 ms    | **0.8 ms**  |
| 121 KB | 660 ms   | **3.7 ms**  |
| 484 KB | 9,460 ms | **13.6 ms** |

Linear, and 57× faster on the largest shipped example. Corpus tokenize time
340 ms → **27 ms**.

### One thing to budget for

The coverage gate comes back **3 lines short** and needs handling as part of the
phase — not a surprise, but not free either:

- The `start === null` guard in `comment()` is dead once `COMMENT_STARTS` is
  typed `Record<Language, string>` (every language has a comment start). Delete
  the guard and narrow the type.
- The trailing `return null` in `inputCode()` and `queryCode()` become
  unreachable-in-practice once those functions early-out on `code[index] !== "\\"`
  / `!== "?"`. Today they are covered only because the old code ran those
  regexes against every token. Two one-line tests (a lone `?` and a lone `\` at
  end of input) restore them — worth adding regardless, since they pin real
  edge behaviour that nothing currently exercises.

---

## Phase 2 — The encoder's address arithmetic

**Size: Small. Depends on: 0.**

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

### Evidence

Both edits were applied and verified:

- `deno task test:core` — **58 tests / 2,759 steps pass.**
- `deno task test:examples` — **504 steps pass.**

|                      | before | after      |
| -------------------- | ------ | ---------- |
| Syllogisms.tpas      | 248 ms | **3.1 ms** |
| whole corpus, encode | 395 ms | **34 ms**  |

### Worth doing at the same time

While in here, `programStart` calls `getTurtleVariables(program)` four times and
`getMemoryNeeded(program)` three times in one array literal, each rebuilding its
result. Hoist to locals — no measurable gain after the above, but it is the same
mistake in miniature and reads badly.

The deeper fix, if you want it, is to compute every variable's address **once**,
in a single prefix-sum pass, and hand the encoder a lookup. That is a bigger
change and the two edits above already remove the pathology; I would not do it
unless Phase 5 restructures the encoder's inputs anyway.

---

## Phase 3 — Delete the `__` brand

**Size: Small. Depends on: nothing.**

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
worth it for consistency, but it is a separate commit.

---

## Phase 4 — Encapsulate the lexeme cursor

**Size: Large. Depends on: nothing (but Phases 5 and 7 depend on it).**

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

---

## Phase 5 — Parse-time state off the AST

**Size: Medium. Depends on: 4.**

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

**Size: Large. Depends on: 4.**

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

---

## Summary

| Phase               | Cost   | Buys                                                                  |
| ------------------- | ------ | --------------------------------------------------------------------- |
| 0 Benchmark task    | Small  | The thing whose absence let 1 and 2 happen                            |
| 1 Tokenizer         | Medium | 49 ms → 0.8 ms per keystroke on the worst example; quadratic → linear |
| 2 Encoder addresses | Small  | Corpus encode 395 ms → 34 ms; one program 248 ms → 3.1 ms             |
| 3 `__` brand        | Small  | 12 dead properties gone, 6 survivors named honestly                   |
| 4 Cursor            | Large  | ~240 duplicated guards collapsed; the two-pass seek made explicit     |
| 5 Parse-time state  | Medium | `encode()` stops mutating its input; AST becomes a value              |
| 6 Circular refs     | Medium | JSON — _if_ Phase 6's opening question has an answer                  |
| 7 C-family parsers  | Large  | ~1,000 lines of copy-paste                                            |

Phases 1 and 2 are eight lines of real change between them, both verified
against the full suite and the 503-program snapshots, and together they take the
compiler from 835 ms to 130 ms on the corpus. They are worth doing this week,
independently of whether the rest of the plan is ever picked up.
