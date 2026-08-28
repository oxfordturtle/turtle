# TODO

## 1. Known gaps and unimplemented features

### 1.1 The formatter is a stub

[src/core/compiler/formatter/statement.ts:33-51](src/core/compiler/formatter/statement.ts#L33)
and
[src/core/compiler/formatter/expression.ts:74-77](src/core/compiler/formatter/expression.ts#L74)
between them have nine branches that literally `return "TODO"`, and
`formatProgram` returns the literal string `"program"`. Listed as a known gap in
`src/README.md`.

The stub is nevertheless exported from the compiler barrel
(`src/core/compiler.ts`, as `formatProgram`/`formatStatement`/
`formatExpression`/`formatType`) and its current behaviour — the finished arms
and the `"TODO"`/`"program"` placeholders alike — is pinned in
[test/core/compiler/formatter.test.ts](test/core/compiler/formatter.test.ts), so
the coverage gate can see it. Implementing the formatter therefore means
updating those pins as part of the change: the `[known limitation]` tests will
trip rather than pass silently.

### 1.2 Undo, Redo, Cut, Copy and Paste report "not implemented"

[src/islands/turtle-system/editing.ts:8](src/islands/turtle-system/editing.ts#L8),
pinned at [test/ui/dom/controls.test.ts](test/ui/dom/controls.test.ts). As
`src/README.md` records, these need either `document.execCommand`, which is
deprecated and unspecified, or an undo stack that would have to replace the
browser's rather than sit beside it. The keyboard shortcuts all work on the
textarea already, so this is only the Edit menu.

### 1.3 No filesystem adapter

The file-processing opcodes have nothing real behind them in the browser: every
method of [src/client/adapters/files.ts](src/client/adapters/files.ts) answers
as if the sandboxed filesystem were always empty (the intended backing is OPFS),
pinned at
[test/ui/dom/adapters/ports.test.ts](test/ui/dom/adapters/ports.test.ts). Listed
as a known gap in `src/README.md`.

### 1.4 `.tmj` and `.tmb` file loading

[src/islands/turtle-system/program.ts:384](src/islands/turtle-system/program.ts#L384),
pinned at [test/ui/dom/program.test.ts](test/ui/dom/program.test.ts) ("rejects a
file type it cannot read"). pcode as JSON and pcode as binary respectively; both
currently fall through to "Invalid file type."

### 1.5 Underlined and strikethrough canvas text

[src/client/adapters/canvas.ts:179](src/client/adapters/canvas.ts#L179) and
[:183](src/client/adapters/canvas.ts#L183), pinned at
[test/ui/dom/adapters/canvas.test.ts](test/ui/dom/adapters/canvas.test.ts)
("ignores the underline and strikethrough bits"). The font bits are decoded and
then ignored; bold and italic immediately above them are handled.

### 1.6 `TRAC` and `MEMW` opcodes just pop the stack, and `traceOnRun` is dead

[operators/io.ts:22](src/core/machine/operators/io.ts#L22) and
[:26](src/core/machine/operators/io.ts#L26), pinned at
`test/core/machine/runtime.test.ts:1066`. Both are marked "not implemented" at
the site and listed as such in [machine/README.md](src/core/machine/README.md).

`MachineOptions.traceOnRun` is the same gap seen from the Run menu. Turning
tracing on changes nothing a student can see. Whatever tracing should emit,
`TRAC` and `MEMW` are presumably where it emits from.

**Deliberately left open, and not to be implemented in passing.** What a trace
should contain has never been decided — a console log per instruction is only
the likeliest answer. The pin at
[runtime.test.ts](test/core/machine/runtime.test.ts) ("traceOnRun changes
nothing about a run") reflects that: it asserts an equality between two runs of
one program, with the flag off and on, rather than anything about either, so
whatever tracing turns out to be, it trips.

### 1.7 Seven of the eight `EncoderOptions` are dead

Pinned at
[test/core/compiler/encode.test.ts:178](test/core/compiler/encode.test.ts#L178).
`canvasStartSize`, `setupDefaultKeyBuffer`, `turtleAttributesAsGlobals`,
`allowCSTR`, `separateReturnStack`, `separateMemoryControlStack` and
`separateSubroutineRegisterStack` are all threaded from the Compile menu through
`compilerOptions()` in `src/islands/turtle-system/program.ts` into `encode()`,
and then never read: `programStart` ignores its options argument entirely, and
`initialiseLocals` is the only field the encoder consults anywhere. The seven
controls in the Compile submenu are rendered `disabled` for the same reason, and
say so when clicked. Implementing any one of them means giving it a real test
and updating the pin.

## 2. Smaller TODOs

Individually cheap, listed so they can be swept up opportunistically.

| Item                                                                 | Where                                                                                                                        |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| No error for binary literals with digits > 1                         | [tokenize.ts:331](src/core/compiler/tokenizer/tokenize.ts#L331)                                                              |
| No error for octal literals with digits > 7                          | [tokenize.ts:332](src/core/compiler/tokenizer/tokenize.ts#L332)                                                              |
| Single-quoted strings should perhaps be ruled out in BASIC           | [tokenize.ts:266](src/core/compiler/tokenizer/tokenize.ts#L266)                                                              |
| TypeScript: no block-scoped `let`, and constants aren't block-scoped | [typescript/parser.ts:23](src/core/compiler/parser/typescript/parser.ts#L23)                                                 |
| TypeScript: constants hoisted on the first pass                      | [typescript/parser.ts:32](src/core/compiler/parser/typescript/parser.ts#L32)                                                 |
| Character/string operator choice made by operand type, not context   | [common/expression.ts:221](src/core/compiler/parser/common/expression.ts#L221)                                               |
| `analyse.ts` counts subroutine definitions as subroutine calls       | [analyser/analyse.ts:30](src/core/compiler/analyser/analyse.ts#L30)                                                          |
| Numeric and unicode string escapes unsupported                       | [lexer/lexeme.ts:254](src/core/compiler/lexer/lexeme.ts#L254)                                                                |
| Python: can't iterate directly over a list of lists                  | [python/statements/forStatement.ts:337](src/core/compiler/parser/python/statements/forStatement.ts#L337)                     |
| Slices with a step (`s[a:b:c]`) unsupported                          | [common/factor.ts:46](src/core/compiler/parser/common/factor.ts#L46), [:107](src/core/compiler/parser/common/factor.ts#L107) |
| Java: the missing-`}` error has no line or character                 | [java/program.ts:78](src/core/compiler/parser/java/program.ts#L78)                                                           |
| `stvg` placement relative to NEWTURTLE needs checking                | [statements/variableAssignment.ts:69](src/core/compiler/encoder/statements/variableAssignment.ts#L69)                        |
| Local-variable zeroing may not match Peter's latest compiler         | [program/subroutines.ts:77](src/core/compiler/encoder/program/subroutines.ts#L77)                                            |

The last two are open questions rather than known-wrong behaviour — both are
recorded as things to check rather than things to change.

Two of the character/string entries interact: the `expression.ts:221` note
("whether to use the string operator should be determined by the context")
already has a test exercising the special case at
`test/core/compiler/parser/shared.test.ts:446`, so that one has a pin to update
if it's changed.
