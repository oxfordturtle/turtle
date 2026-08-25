# TODO

Gaps and deliberate limitations, collected from the markers already in the
codebase so each can be picked up on its own. There are no known bugs
outstanding: everything below is either a decision to revisit or work not yet
done.

The limitations in §1 have a test pinning the current behaviour, following the
convention in `test/README.md` §5: a `[known limitation]` (or, if a bug is ever
found and not fixed straight away, a `[known bug]`) test asserts what the code
actually does, so that changing it trips the test rather than passing silently.
**Changing one of those therefore means updating its pinned test as part of the
change.**

Sources of truth this file was collected from, and which should be updated
alongside it:

- `[known limitation]` / `[known bug]` markers in `src/` and `test/`
- the "Known gaps" section of `src/README.md`
- `TODO:` comments in `src/`

---

## 1. Deliberate limitations — do not "fix" without a decision

These are marked `[known limitation]` and pinned **in both directions**, so that
the decision has to be revisited rather than stumbled into. Each has a reason
recorded at the pin site. Changing any of them is a design call, not a bug fix.

### 1.1 Bitwise `&` / `|` / `^` keep their old precedence

[test/core/compiler/logicalOperators.test.ts:205](test/core/compiler/logicalOperators.test.ts#L205)

When the logical operators moved, the bitwise ones kept the multiplicative and
additive slots they have always had, which is nobody's real rule. Real Python
and real C both bind `*` tighter than `&`, so `3 & 2 * 3` is `3 & (2 * 3)` = 2
for them, whereas here `&` and `*` share a level and go left to right, giving
`(3 & 2) * 3` = 6. Python and C also disagree with each other about where `&`
belongs relative to the comparisons, and no example program depends on either
rule — so it was pinned as it stands rather than changed.

### 1.2 BASIC's AND / OR / EOR keep Pascal's precedence

[test/core/compiler/logicalOperators.test.ts:314](test/core/compiler/logicalOperators.test.ts#L314)

BASIC's AND/OR/EOR are documented (see
`src/pages/documentation/help/BASIC/operators.ts`) as bitwise-and-boolean
operators between integers, exactly as in BBC BASIC, and that same page tells
students that complex expressions require brackets. Moving them would mean
moving the _bitwise_ operators. So unbracketed `a% = b% AND c% = d%` still
parses as `a% = (b% AND c%) = d%`.

### 1.3 Pascal and BASIC evaluate both operands eagerly

[test/core/compiler/logicalOperators.test.ts:659](test/core/compiler/logicalOperators.test.ts#L659)

Standard Pascal doesn't guarantee short-circuit evaluation (Delphi selects it
with the `$B` switch, and Turtle's Pascal is modelled on Delphi), and BASIC's
AND/OR are the bitwise operators, which can't short-circuit at all — both bits
of an integer AND are needed.

---

## 2. Unimplemented features

Larger gaps, several already listed under "Known gaps" in `src/README.md`.

### 2.1 Array-by-value parameter copy

[src/core/compiler/encoder/program/subroutines.ts:103](src/core/compiler/encoder/program/subroutines.ts#L103),
pinned at
[test/core/compiler/encoder/program.test.ts:323](test/core/compiler/encoder/program.test.ts#L323).
C never sets `isReferenceParameter`, so a plain array parameter is by-value
syntax that is legal but has no copying logic. The parameter-storing loop pushes
an (initially empty) line for it and leaves it empty. Compare the string
by-value case immediately below it in the same file, which does copy, via
`PCode.cstr`.

### 2.2 The formatter is a stub

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

### 2.3 Undo, Redo, Cut, Copy and Paste report "not implemented"

[src/islands/turtle-system/editing.ts:8](src/islands/turtle-system/editing.ts#L8),
pinned at
[test/ui/dom/controls.test.ts](test/ui/dom/controls.test.ts). As `src/README.md` records,
these need either `document.execCommand`, which is deprecated and unspecified,
or an undo stack that would have to replace the browser's rather than sit beside
it. The keyboard shortcuts all work on the textarea already, so this is only the
Edit menu.

### 2.4 Save/load settings

[src/islands/settings.ts:211](src/islands/settings.ts#L211) and
[:215](src/islands/settings.ts#L215) both report "Not yet implemented", pinned
at [test/ui/dom/settings.test.ts](test/ui/dom/settings.test.ts) ("saving
settings to an account"). Blocked on an account system that does not exist.
`loadSavedSettings` has no call site at all yet; `saveSettings` is reached from
the Options menu, and from `init()`'s `beforeunload` listener when
`alwaysSaveSettings` is on.

### 2.5 No filesystem adapter

The file-processing opcodes have nothing real behind them in the browser: every
method of [src/client/adapters/files.ts](src/client/adapters/files.ts) answers
as if the sandboxed filesystem were always empty (the intended backing is OPFS),
pinned at
[test/ui/dom/adapters/ports.test.ts](test/ui/dom/adapters/ports.test.ts).
Listed as a known gap in `src/README.md`.

### 2.6 `.tmj` and `.tmb` file loading

[src/islands/turtle-system/program.ts:384](src/islands/turtle-system/program.ts#L384),
pinned at
[test/ui/dom/program.test.ts](test/ui/dom/program.test.ts) ("rejects a file
type it cannot read"). pcode as JSON and pcode as binary respectively; both
currently fall through to "Invalid file type."

### 2.7 Underlined and strikethrough canvas text

[src/client/adapters/canvas.ts:179](src/client/adapters/canvas.ts#L179) and
[:183](src/client/adapters/canvas.ts#L183), pinned at
[test/ui/dom/adapters/canvas.test.ts](test/ui/dom/adapters/canvas.test.ts)
("ignores the underline and strikethrough bits"). The font bits are decoded and
then ignored; bold and italic immediately above them are handled.

### 2.8 `TRAC` and `MEMW` opcodes just pop the stack

[src/core/machine/runtime.ts:1977](src/core/machine/runtime.ts#L1977) and
[:1981](src/core/machine/runtime.ts#L1981), pinned at
`test/core/machine/runtime.test.ts:1066`.

### 2.9 Seven of the eight `EncoderOptions` are dead

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

### 2.10 Python's indexed-array-assignment arm is dead code

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

## 3. Smaller TODOs

Individually cheap, listed so they can be swept up opportunistically.

| Item                                                                 | Where                                                                                                                        |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Range checking should be a runtime option, not hard-coded            | [runtime.ts:1354](src/core/machine/runtime.ts#L1354)                                                                         |
| Placeholder runtime error message: "String is not a character."      | [runtime.ts:1329](src/core/machine/runtime.ts#L1329)                                                                         |
| Placeholder runtime error message: "Not found."                      | [runtime.ts:1341](src/core/machine/runtime.ts#L1341)                                                                         |
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
