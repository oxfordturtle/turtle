# TODO

Gaps, known bugs and deliberate limitations, collected from the markers already
in the codebase so each can be picked up on its own. §1 is behaviour that is
wrong and not yet fixed; §2 is behaviour that is deliberate and should not be
"fixed" without a decision; §3 and §4 are work not yet done.

Everything in §1 and §2 has a test pinning the current behaviour, following the
convention in `test/README.md` §5: a `[known bug]` (or `[known limitation]`,
where the behaviour is a decision rather than a defect) test asserts what the
code actually does, so that changing it trips the test rather than passing
silently. **Changing one of those therefore means updating its pinned test as
part of the change.**

Sources of truth this file was collected from, and which should be updated
alongside it:

- `[known limitation]` / `[known bug]` markers in `src/` and `test/`
- the "Known gaps" section of `src/README.md`
- `TODO:` comments in `src/`

---

## 1. Known bugs — wrong, and not yet fixed

All twelve are in `src/core/machine/`, found while working through the refactor
recorded in `MACHINE_REFACTOR.md` — §§1.1–1.10 in Phase 1, and §§1.11–1.12 in
Phase 4, where writing the instruction-set reference meant checking every
`MachineOptions` field against the code that reads it. Each is pinned by a
`[known bug]` test asserting what the code **actually does**, so that fixing it
trips the test rather than passing silently. Fixing one therefore means updating
its pin in the same change.

Two of them (1.8, 1.9) have nothing observable to pin, and say so. §1.9 has
since been fixed by Phase 2 and is kept as a record rather than renumbered;
everything else here is still outstanding.

**§§1.2, 1.11 and 1.12 are one bug three times over**: three `MachineOptions`
fields that the Run menu offers a student, `program.ts` threads into the
machine, and nothing in `src/core/machine/` ever reads. They are numbered
separately because each needs its own decision about what honouring it should
do.

### 1.1 `MIXC`, `TEST` and `CONS` are silent no-ops on an empty stack

[operators/canvas.ts:163](src/core/machine/operators/canvas.ts#L163),
[operators/variables.ts:106](src/core/machine/operators/variables.ts#L106) and
[operators/io.ts:131](src/core/machine/operators/io.ts#L131), pinned at
[test/core/machine/errors.test.ts](test/core/machine/errors.test.ts) ("MIXC,
TEST and CONS are silent no-ops instead").

These are the only three arms of `execute()`'s switch whose operand guard is an
`if` with no `else`. Every other operator throws
`"Stack operation called on empty stack."`; these three fall through and carry
on. It reads as an omission rather than a decision.

**`CONS` was missed when this was first written**, which said "the only two".
Phase 2 found it while replacing the ~166 hand-written guards with
`memory.popValue`, and pinned it alongside the other two — see
`MACHINE_REFACTOR.md`.

It was also invisible to the coverage gate. Deno derives branch coverage from
V8's block ranges, and V8 emits a range only where the inner count _differs_
from the enclosing one — so an `if` whose body runs on every execution of its
arm produces no `BRDA` pair at all, and the untaken false path is never counted
as a miss. `mixc` appeared in only two tests and in neither error sweep. The
pins now give all three arms a false execution, so the pairs exist and both
sides are covered.

### 1.2 `TEST` ignores `MachineOptions.rangeCheckArrays`

[operators/variables.ts:114](src/core/machine/operators/variables.ts#L114), pinned at
[test/core/machine/errors.test.ts](test/core/machine/errors.test.ts)
("range-checks anyway when rangeCheckArrays is turned off").

The arm carries a stale `TODO: make range check a runtime option`. The option
already exists ([types.ts](src/core/machine/types.ts), `rangeCheckArrays`),
defaults to `true`, and is threaded from the Run menu through
`src/islands/turtle-system/program.ts` into the machine — `TEST` simply never
consults it. Same shape as §3.9's seven dead `EncoderOptions`: a control a
student can turn off that changes nothing — and as §1.11 and §1.12, the two
other `MachineOptions` fields nothing reads.

### 1.3 Two placeholder runtime error messages

[operators/strings.ts:171](src/core/machine/operators/strings.ts#L171) ("String is not a
character.") and [operators/strings.ts:179](src/core/machine/operators/strings.ts#L179) ("Not
found."), each with its own `TODO: better error message`. Pinned at
[test/core/machine/errors.test.ts](test/core/machine/errors.test.ts) (the two
`[known bug]` tests under "Python string tests").

Both are what a student sees, and neither says what was wrong or where.

### 1.4 `COPY`, `DELS` and `INSS` mis-handle an index of 0 or less

[operators/strings.ts:54-83](src/core/machine/operators/strings.ts#L54-L83) — the three
operators and the comment above them saying why `substr` is deliberate. Pinned
at
[test/core/machine/runtime.test.ts](test/core/machine/runtime.test.ts)
("substr's negative-index behaviour at index <= 0").

All three are transcribed from Pascal's 1-based `Copy(s, index, count)` using
the deprecated `String.prototype.substr`, hence the `n2 - 1` offsets — but
`substr`'s first argument counts _backwards from the end_ when negative, where
Delphi clamps an index below 1 up to 1. So `COPY("hello", 0, 3)` gives `"o"`
instead of `"hel"`, and `INSS("XY", "hello", 0)` gives `"XYo"`, discarding
`"hell"` outright.

The pins double as a guard on the obvious modernisation: `slice` and
`substring` clamp negatives differently again, so a like-for-like replacement
of `substr` would change all three answers a second time.

### 1.5 A student-facing message mangled by a rename

[operators/io.ts:107](src/core/machine/operators/io.ts#L107), pinned at
[test/core/machine/errors.test.ts](test/core/machine/errors.test.ts) ("TDET
throws a rename-mangled message").

`"Detect called with invalid input state.code: ..."` — a `code` → `state.code`
find-and-replace caught the string literal as well as the identifiers. It
should read "invalid input code".

### 1.6 `copyForward`/`copyBackward` recurse once per word

[memory.ts:302-314](src/core/machine/memory.ts#L302-L314), pinned at
[test/core/machine/errors.test.ts](test/core/machine/errors.test.ts) ("CPTR
recurses per word"). A `CPTR` of 100,000 words blows the JavaScript call stack
in either direction; the real threshold is wherever V8 runs out, around
12k–20k words on a typical machine.

Their immediate neighbour [memory.ts:286](src/core/machine/memory.ts#L286)
documents that `zero` was made iterative precisely because "recursion cannot
survive" thousands of words. `copy` has the identical exposure and contradicts
its own neighbour.

### 1.7 `error as Error` blind-casts an `unknown`

[runtime.ts:139](src/core/machine/runtime.ts#L139), pinned by the same tests as
§1.6, which assert the leaked error is a `RangeError`.

`execute()`'s catch reports whatever it caught straight to
`ports.output.notifyRuntimeError`. An internal V8 error — §1.6's
`"Maximum call stack size exceeded"` is a live example — is shown to a student
verbatim, exactly as if it were an error in their own program. `MachineError`
exists and would let the two be told apart. Phase 2 moved it into
`src/core/machine/error.ts`, gave it `line`/`code` fields and exported it from
`src/core/machine.ts`, so the discrimination is now _possible_ — but nothing
does it yet, because actually discriminating changes what a student sees and is
entangled with §1.6 (the recursion in `memory.copy` is what produces the
`RangeError` these tests reach it through).

### 1.8 `memory.init()` does not reset `heapClearPending`

[memory.ts:98-117](src/core/machine/memory.ts#L98-L117) vs
[memory.ts:24](src/core/machine/memory.ts#L24), pinned at
[test/core/machine/memory.test.ts](test/core/machine/memory.test.ts) ("init()
does not reset heapClearPending").

`init()` resets six of the module's seven private `let`s; the seventh is not in
the list, and the list is hand-maintained against the declarations directly
above it, so nothing catches the omission.

The flag is genuinely reachable — `HCLR` with a non-empty evaluation stack sets
it, and `options.activateHCLR` defaults to `true` — so a program that halts
before the next `execute()` leaves it raised, and it survives into the next
`run()`. It is nevertheless **harmless today**, which is what the pin asserts:
`delayedHeapClear()` consumes the stale flag on the new run's first `execute()`,
at which point `init()` has just set `heapTemp === heapPerm`, so the clear is a
no-op. The margin is one instruction.

### 1.9 `Math.pow(2, 31) - 1` written out rather than `MAXINT` — **fixed**

Three sites wrote the value longhand rather than using the `MAXINT` defined a
few hundred lines above them: `MXIN` (the opcode that pushes maximum integer,
and the one place the value is the point rather than a stand-in for "as long as
possible"), `RDLN` and `TDET`. Note **three**, not the two the refactor plan
originally listed.

Identical value, so there was no behaviour to pin. **Fixed in Phase 2e**, which
was where it was always going to be swept up; all three now read `MAXINT`
([limits.ts:4](src/core/machine/limits.ts#L4), where Phase 3 moved it). Kept here rather
than
renumbered, so that the cross-references from `MACHINE_REFACTOR.md` and from the
other entries still land.

### 1.10 Two stale comments, corrected in place

Recorded because both stated something factually untrue about the current code,
which a refactor reading them would have been misled by. Fixed as part of Phase
1 (comments only, no behaviour change):

- `writeListHeader` (now
  [operators/lists.ts:81](src/core/machine/operators/lists.ts#L81)) justified
  its own zeroing loop as avoiding
  "`memory.zero`'s recursion" — but `memory.zero` has since been made
  iterative, for exactly the same exposure, and says so at its own definition.
  The stated reason was therefore obsolete: `writeListHeader` could simply call
  `memory.zero`. Phase 1 corrected the comment to say so and left the code
  alone; **Phase 2 collapsed the two**, which is where that de-duplication
  belonged.
- `test/core/machine/memory.test.ts`'s header called the machine's `HCLR` case
  a "commented-out no-op", and concluded from that that `heapClear()` and
  `heapClearPending` were unreachable. The operator (now
  [operators/variables.ts:175](src/core/machine/operators/variables.ts#L175)) is
  live, gated on
  `options.activateHCLR`, which defaults to `true` — see §1.8.

### 1.11 `MEMC` ignores `MachineOptions.preventStackCollision`

[operators/variables.ts:147](src/core/machine/operators/variables.ts#L147),
pinned at
[test/core/machine/errors.test.ts](test/core/machine/errors.test.ts) ("MEMC
checks anyway when preventStackCollision is turned off").

`MEMC` throws _"Memory stack has overflowed into memory heap"_ whenever a new
frame's `base + size` passes `options.stackSize`, and never consults the option
named after that exact check. Precisely §1.2's shape, and the same fix: read the
flag at the guard.

Deciding what "off" should mean is the real work here, and it is not the same
question as §1.2's. An unchecked array index reads a wrong value; an unchecked
memory frame grows the stack region into the heap, where `heapBase` is fixed
for the run at `stackSize - 1` and every heap pointer already handed out points
above it. Turning the check off therefore trades a clean error for silent
corruption, which may be why it was written unconditionally in the first place.

### 1.12 `MachineOptions.traceOnRun` is read by nothing

Pinned at
[test/core/machine/runtime.test.ts](test/core/machine/runtime.test.ts)
("traceOnRun changes nothing about a run"), under "debugging and tracing".

There is no site to cite, which is the bug: grepping every `MachineOptions`
field for `options.<field>` across `src/core/machine/` finds ten of the twelve
live, `rangeCheckArrays` dead (§1.2) and `traceOnRun` dead. Turning tracing on
in the Run menu changes nothing a student can see.

It has a matching gap in the instruction set: `TRAC` (`0x78`) pops its operand
and does nothing, alongside `MEMW` — both marked "not implemented" at the site
and listed as such in
[machine/README.md](src/core/machine/README.md). Whatever tracing should emit,
those two arms are presumably where it emits from.

The pin is an equality between two runs of one program, with the flag off and
on, rather than an assertion about either: what a trace should contain is an
open question, but it must make the two differ.

---

## 2. Deliberate limitations — do not "fix" without a decision

These are marked `[known limitation]` and pinned **in both directions**, so that
the decision has to be revisited rather than stumbled into. Each has a reason
recorded at the pin site. Changing any of them is a design call, not a bug fix.

### 2.1 Bitwise `&` / `|` / `^` keep their old precedence

[test/core/compiler/logicalOperators.test.ts:205](test/core/compiler/logicalOperators.test.ts#L205)

When the logical operators moved, the bitwise ones kept the multiplicative and
additive slots they have always had, which is nobody's real rule. Real Python
and real C both bind `*` tighter than `&`, so `3 & 2 * 3` is `3 & (2 * 3)` = 2
for them, whereas here `&` and `*` share a level and go left to right, giving
`(3 & 2) * 3` = 6. Python and C also disagree with each other about where `&`
belongs relative to the comparisons, and no example program depends on either
rule — so it was pinned as it stands rather than changed.

### 2.2 BASIC's AND / OR / EOR keep Pascal's precedence

[test/core/compiler/logicalOperators.test.ts:314](test/core/compiler/logicalOperators.test.ts#L314)

BASIC's AND/OR/EOR are documented (see
`src/pages/documentation/help/BASIC/operators.ts`) as bitwise-and-boolean
operators between integers, exactly as in BBC BASIC, and that same page tells
students that complex expressions require brackets. Moving them would mean
moving the _bitwise_ operators. So unbracketed `a% = b% AND c% = d%` still
parses as `a% = (b% AND c%) = d%`.

### 2.3 Pascal and BASIC evaluate both operands eagerly

[test/core/compiler/logicalOperators.test.ts:659](test/core/compiler/logicalOperators.test.ts#L659)

Standard Pascal doesn't guarantee short-circuit evaluation (Delphi selects it
with the `$B` switch, and Turtle's Pascal is modelled on Delphi), and BASIC's
AND/OR are the bitwise operators, which can't short-circuit at all — both bits
of an integer AND are needed.

---

## 3. Unimplemented features

Larger gaps, several already listed under "Known gaps" in `src/README.md`.

### 3.1 Array-by-value parameter copy

[src/core/compiler/encoder/program/subroutines.ts:103](src/core/compiler/encoder/program/subroutines.ts#L103),
pinned at
[test/core/compiler/encoder/program.test.ts:323](test/core/compiler/encoder/program.test.ts#L323).
C never sets `isReferenceParameter`, so a plain array parameter is by-value
syntax that is legal but has no copying logic. The parameter-storing loop pushes
an (initially empty) line for it and leaves it empty. Compare the string
by-value case immediately below it in the same file, which does copy, via
`PCode.cstr`.

### 3.2 The formatter is a stub

[src/core/compiler/formatter/statement.ts:33-51](src/core/compiler/formatter/statement.ts#L33)
and
[src/core/compiler/formatter/expression.ts:74-77](src/core/compiler/formatter/expression.ts#L74)
between them have nine branches that literally `return "TODO"`, and
`formatProgram` returns the literal string `"program"`. Listed as a known gap
in `src/README.md`.

The stub is nevertheless exported from the compiler barrel
(`src/core/compiler.ts`, as `formatProgram`/`formatStatement`/
`formatExpression`/`formatType`) and its current behaviour — the finished
arms and the `"TODO"`/`"program"` placeholders alike — is pinned in
[test/core/compiler/formatter.test.ts](test/core/compiler/formatter.test.ts),
so the coverage gate can see it. Implementing the formatter therefore means
updating those pins as part of the change: the `[known limitation]` tests
will trip rather than pass silently.

### 3.3 Undo, Redo, Cut, Copy and Paste report "not implemented"

[src/islands/turtle-system/editing.ts:8](src/islands/turtle-system/editing.ts#L8),
pinned at
[test/ui/dom/controls.test.ts](test/ui/dom/controls.test.ts). As `src/README.md` records,
these need either `document.execCommand`, which is deprecated and unspecified,
or an undo stack that would have to replace the browser's rather than sit beside
it. The keyboard shortcuts all work on the textarea already, so this is only the
Edit menu.

### 3.4 Save/load settings

[src/islands/settings.ts:211](src/islands/settings.ts#L211) and
[:215](src/islands/settings.ts#L215) both report "Not yet implemented", pinned
at [test/ui/dom/settings.test.ts](test/ui/dom/settings.test.ts) ("saving
settings to an account"). Blocked on an account system that does not exist.
`loadSavedSettings` has no call site at all yet; `saveSettings` is reached from
the Options menu, and from `init()`'s `beforeunload` listener when
`alwaysSaveSettings` is on.

### 3.5 No filesystem adapter

The file-processing opcodes have nothing real behind them in the browser: every
method of [src/client/adapters/files.ts](src/client/adapters/files.ts) answers
as if the sandboxed filesystem were always empty (the intended backing is OPFS),
pinned at
[test/ui/dom/adapters/ports.test.ts](test/ui/dom/adapters/ports.test.ts).
Listed as a known gap in `src/README.md`.

### 3.6 `.tmj` and `.tmb` file loading

[src/islands/turtle-system/program.ts:384](src/islands/turtle-system/program.ts#L384),
pinned at
[test/ui/dom/program.test.ts](test/ui/dom/program.test.ts) ("rejects a file
type it cannot read"). pcode as JSON and pcode as binary respectively; both
currently fall through to "Invalid file type."

### 3.7 Underlined and strikethrough canvas text

[src/client/adapters/canvas.ts:179](src/client/adapters/canvas.ts#L179) and
[:183](src/client/adapters/canvas.ts#L183), pinned at
[test/ui/dom/adapters/canvas.test.ts](test/ui/dom/adapters/canvas.test.ts)
("ignores the underline and strikethrough bits"). The font bits are decoded and
then ignored; bold and italic immediately above them are handled.

### 3.8 `TRAC` and `MEMW` opcodes just pop the stack

[operators/io.ts:22](src/core/machine/operators/io.ts#L22) and
[:26](src/core/machine/operators/io.ts#L26), pinned at
`test/core/machine/runtime.test.ts:1066`.

### 3.9 Seven of the eight `EncoderOptions` are dead

Pinned at
[test/core/compiler/encode.test.ts:178](test/core/compiler/encode.test.ts#L178).
`canvasStartSize`, `setupDefaultKeyBuffer`, `turtleAttributesAsGlobals`,
`allowCSTR`, `separateReturnStack`, `separateMemoryControlStack` and
`separateSubroutineRegisterStack` are all threaded from the Compile menu
through `compilerOptions()` in
`src/islands/turtle-system/program.ts` into `encode()`, and then never read:
`programStart` ignores its options argument entirely, and `initialiseLocals` is
the only field the encoder consults anywhere. The seven controls in the Compile
submenu are rendered `disabled` for the same reason, and say so when clicked.
Implementing any one of them means giving it a real test and updating the pin.

### 3.10 Python's indexed-array-assignment arm is dead code

Two regions in
[src/core/compiler/parser/python/statements/variableAssignment.ts:28](src/core/compiler/parser/python/statements/variableAssignment.ts#L28)
and [:100](src/core/compiler/parser/python/statements/variableAssignment.ts#L100),
both under justified `deno-coverage-ignore` directives. No Python variable is
ever an array: `python/type.ts` returns empty `arrayDimensions` on every path
(Python has no array declaration syntax, and a `List[T]` hint sets `isList`
instead), so `isArray()` is always false here and indexed assignment always goes
through the string and list branches. Either Python grows arrays, or the arms
go.

---

## 4. Smaller TODOs

Individually cheap, listed so they can be swept up opportunistically. Three
`src/core/machine/` entries that used to live here — the hard-coded range check
and the two placeholder error messages — moved to §1 once they were pinned;
they are §1.2 and §1.3.

| Item                                                                 | Where                                                                                                                        |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| No error for binary literals with digits > 1                         | [tokenize.ts:300](src/core/compiler/tokenizer/tokenize.ts#L300)                                                              |
| No error for octal literals with digits > 7                          | [tokenize.ts:335](src/core/compiler/tokenizer/tokenize.ts#L335)                                                              |
| Single-quoted strings should perhaps be ruled out in BASIC           | [tokenize.ts:208](src/core/compiler/tokenizer/tokenize.ts#L208)                                                              |
| TypeScript: no block-scoped `let`, and constants aren't block-scoped | [typescript/parser.ts:23](src/core/compiler/parser/typescript/parser.ts#L23)                                                 |
| TypeScript: constants hoisted on the first pass                      | [typescript/parser.ts:32](src/core/compiler/parser/typescript/parser.ts#L32)                                                 |
| Character/string operator choice made by operand type, not context   | [common/expression.ts:221](src/core/compiler/parser/common/expression.ts#L221)                                               |
| `analyse.ts` counts subroutine definitions as subroutine calls       | [analyser/analyse.ts:30](src/core/compiler/analyser/analyse.ts#L30)                                                          |
| Numeric and unicode string escapes unsupported                       | [lexer/lexeme.ts:254](src/core/compiler/lexer/lexeme.ts#L254)                                                                |
| Python: can't iterate directly over a list of lists                  | [python/statements/forStatement.ts:337](src/core/compiler/parser/python/statements/forStatement.ts#L337)                     |
| Slices with a step (`s[a:b:c]`) unsupported                          | [common/factor.ts:46](src/core/compiler/parser/common/factor.ts#L46), [:107](src/core/compiler/parser/common/factor.ts#L107) |
| `stvg` placement relative to NEWTURTLE needs checking                | [statements/variableAssignment.ts:69](src/core/compiler/encoder/statements/variableAssignment.ts#L69)                        |
| Local-variable zeroing may not match Peter's latest compiler         | [program/subroutines.ts:77](src/core/compiler/encoder/program/subroutines.ts#L77)                                            |

The last two are open questions rather than known-wrong behaviour — both are
recorded as things to check rather than things to change.

Two of the character/string entries interact: the `expression.ts:221` note
("whether to use the string operator should be determined by the context")
already has a test exercising the special case at
`test/core/compiler/parser/shared.test.ts:446`, so that one has a pin to update
if it's changed.
