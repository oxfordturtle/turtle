# The pcode instruction set

Turtle's compiler emits pcode; this directory interprets it. `src/README.md`
("`core/` — the machine") is the map of the module itself — what each file is
and how the ports work. This file is the other half: the format the compiler
and the machine agree on, which until now was defined only by the enum in
[../constants/pcodes.ts](../constants/pcodes.ts) and by the code that reads it.

## The format

A program is `number[][]`: an array of lines, each an array of numbers. A
number is either an opcode — a value of the `PCode` enum — or an inline operand
belonging to the opcode before it. Nothing in the encoding tells the two apart.
A reader knows which is which only by starting at the beginning of a line and
stepping instruction by instruction, consuming each opcode's operands as it
goes.

The program counter is therefore a pair, `state.line` and `state.code`
([state.ts](state.ts)). `execute()` advances `state.code` after every
instruction, and wraps to the start of the next line when it reaches the end of
the current one.

Lines are not basic blocks. The encoder merges freely onto a line — a whole
statement, expression and all, is usually one line. What a line _is_ is the only
addressable position in the program.

### Jumps land on the start of a line

`JUMP`, `IFNO` and `SUBR` carry a **1-indexed** line number as an inline
operand. `RETN` and `PLRJ` jump to a **0-indexed** line taken off a stack, where
`SUBR`/`PSRJ` pushed `state.line + 1`. Both go through `jumpTo` in
[operators/flow.ts](operators/flow.ts), which sets `state.code = -1` so that the
loop's own `+= 1` lands on index 0 of the target line.

There is no way to jump into the middle of a line, and a jump _leaves_ the line
it is on: anything encoded after it on that line is unreachable. That is the
constraint the encoder works around by starting every jump target on a fresh
line — see `src/README.md`, "The encoder", where the two places it bites are
named.

Execution starts at line 0, code 0. `encoder/encode.ts` appends a `HALT` to the
program, so the counter never runs off the end in practice; a jump to a line
that does not exist is caught in the loop and reported as _"The program has
tried to jump to a line that does not exist"_.

## Inline operands

`pcodeArgs()`, at the end of [../constants/pcodes.ts](../constants/pcodes.ts),
is the authority on how many operands an opcode takes. Twenty-five take one, six
take two, `LSTR` takes a varying run, and every other opcode takes none.

| Operands | Opcodes                                                                                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| one      | `PICK` `TRUE` `TRY` `LAPP` `LCPY` `LDEL` `LEXT` `LIDX` `LINS` `LMUL` `LPRT` `LREM` `LREV` `LIAD` `LIHP` `LDIN` `LDVG` `LDAG` `STVG` `JUMP` `IFNO` `SUBR` `PSSR` `MEMR` |
| two      | `LDVV` `LDVR` `LDAV` `STVV` `STVR` `MEMC`                                                                                                                              |
| varying  | `LSTR`: a character count, then that many character codes                                                                                                              |

`pcodeArgs()` also lists `LPOP`, which has no arm in the machine's switch: it is
not implemented. That makes 31 opcodes with operands, and all 31 agree with the
table.

An operator reads its operands through `cycle.operand()`
([types.ts](types.ts)), which advances the program counter as it reads rather
than indexing ahead. So an operator that reads an operand and then throws —
`MEMC` and `MEMR` — throws with the counter already past it. Nothing observes
that: the error handler either restores the position from the try stack or halts
outright.

## The execution loop

`execute()` in [runtime.ts](runtime.ts) runs instructions until a budget is
spent, then **reschedules itself through the timers port** rather than
recursing. Returning is what lets the browser paint the canvas before the next
block starts. The budgets are `options.drawCountMax` draws (default 4) and
`options.codeCountMax` instructions (default 100,000).

Three things end a block before the budget does:

- **`HALT`** clears `state.running`, and the loop returns without rescheduling.
- **Suspension.** Nineteen arms call `cycle.suspend()`: `RDLN`, `TDET`, `WAIT`,
  and the sixteen file operators. Each has already advanced the program counter
  itself, through `advancePastCurrentInstruction()`, and arranged its own
  resumption — a timer callback for the first three, `suspendFor`'s promise
  continuation for the file operators. The loop must therefore neither advance
  again nor reschedule.
- **`PCOH`** records a line number; the loop halts when the counter reaches it.

A `MachineError` thrown anywhere inside the block unwinds to the nearest
enclosing `TRY`, restoring the evaluation stack to the height that `TRY`
recorded. With no active `TRY`, the machine halts and reports through the output
port. `suspendFor`'s rejection path does the same, so an async port failure is
catchable by a student's program exactly as a synchronous one is.

## The stacks

Five stacks live in [memory.ts](memory.ts), all outside `main`:

| Stack             | Holds                                                                  |
| ----------------- | ---------------------------------------------------------------------- |
| `stack`           | the evaluation stack: operands and results                             |
| `memoryStack`     | memory-frame base addresses, pushed by `STMT`/`MEMC`, popped by `MEMR` |
| `returnStack`     | return line numbers, pushed by `SUBR`/`PSRJ`, popped by `RETN`/`PLRJ`  |
| `subroutineStack` | the current subroutine's index, for `PSSR`/`PLSR`                      |
| `tryStack`        | `[xcptLine, stackHeight]` per active `TRY`                             |

`coords` is not a stack but belongs beside them: every turtle move records its
destination there, `RMBR` records the current position explicitly, `FRGT` drops
the last _n_, and `POLY`/`PFIL` draw the last _n_ as one polygon.

The three call stacks are each capped at `MAX_CALL_STACK_DEPTH` (1,000, mirroring
Pascal's `maxreturnstack`/`maxsubregstack`/`maxmemstack`), so runaway recursion
fails with a clean error rather than however an unbounded JS array eventually
fails.

### Evaluation-stack discipline

Every value on the evaluation stack is a `number`. A string is a **pointer** to
its length cell in `main`; so is an array, and so is a Python list. There is no
tagging — an operator knows what its operands are because the compiler emitted
it knowing.

Operands are pushed left to right and popped in reverse. There is deliberately
no `popPair` helper returning several at once: an operator that needs three
values calls `popValue()` three times, in pop order, which also removes any
chance of silently reversing a subtraction. (The reason it is not a tuple is
performance, and [memory.ts](memory.ts) records the measurement.)

The typed accessors are the only sanctioned way to consume operands:

| Accessor               | Use                                                               |
| ---------------------- | ----------------------------------------------------------------- |
| `popValue()`           | pop one, throwing on an empty stack                               |
| `peekValue(depth = 0)` | read without popping, for `CTST`/`ERNF`, whose value is reused    |
| `popString()`          | pop a pointer and resolve it, for a _deepest_ string operand only |
| `popMemoryStack()`     | pop the memory stack                                              |
| `peek(address)`        | read one word of `main`, throwing if the address is outside it    |

`peek` is the same guard on the other half of the machine's state, and every
read of `main` goes through it: an address the machine produced is as
out-of-bounds-prone as a `pop`, and before `noUncheckedIndexedAccess` was turned
on it was the half the type checker let through. Writes go direct — assigning
past the end of a JS array grows it.

`popString` is restricted to the deepest operand because resolving a pointer
frees the temporary heap above it (below). An operator holding two pointers must
pop both and resolve the **shallower one first**; the six string comparisons in
[operators/comparison.ts](operators/comparison.ts) do exactly that, and say so.

Three arms — `MIXC`, `TEST` and `CONS` — used to fall through silently on a
short stack instead of throwing. That was a defect, not a convention, and is
fixed: all three read their operands through the helpers above like everything
else. `TODO.md` §1.1 records it, and `errors.test.ts` names all three by hand in
its stack-empty table, because the coverage gate cannot see the shape they used
to have.

## Memory

`memory.main` is a flat `number[]` of `0x200000` (2,097,152) cells. Every cell
holds a 32-bit signed integer by convention — `MAXINT`/`MININT` in
[limits.ts](limits.ts) are what the arithmetic operators range-check against.
`options.stackSize` (default 50,000) splits it in two:

```
  0                              stackSize-1                        0x200000
  |---------- memory stack ----------|--------- heap --------->            |
  ^  ^  ^      ^                     ^                        ^
  |  |  |      |                     heapBase                 heapTemp
  |  |  |      globals               (fixed for the run)      (grows upward)
  |  |  file handles 2..11
  |  keyboard buffer pointer
  turtle pointer
```

### The fixed addresses

The bottom twelve cells are the encoder's convention, not the machine's
(`compiler/encoder/addresses.ts`, `baseGlobals = 12`), but the machine depends
on the first two:

| Address       | What                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| `main[0]`     | a pointer to the turtle's six cells                                                                             |
| `main[1]`     | the keyboard buffer's base address, 0 until `BUFR` has run                                                      |
| `main[2..11]` | the ten file handles                                                                                            |
| `main[12..]`  | one cell per subroutine (plus one for a function result), then the turtle variables, then the program's globals |

The turtle is six consecutive cells at `main[main[0] + 1 .. + 6]` — `x`, `y`,
`d` (direction), `a` (angle units in a full turn), `t` (pen thickness, negative
for pen-up) and `c` (colour). `memory.ts`'s `getTurtX`/`setTurtX` and friends
are the only things that should know those offsets.

### Strings, arrays and lists

A string and an array have the same shape, and a pointer to either points at its
length cell:

```
  main[p]         = current length (characters, or elements)
  main[p + 1 ...] = the data: character codes, or element cells
```

A fixed-size string carries its capacity in the cell _below_ the pointer:
`main[p - 1]` is the declared maximum length plus one, which is what `CSTR`
truncates against. Heap strings have no such cell — nothing writes into them
after they are made. `TEST` range-checks an index against `main[p]`.

Python lists are different, and [operators/lists.ts](operators/lists.ts)
documents them at the top: a five-cell header (length, three dimension
capacities, per-element string size) followed by flat row-major element storage,
in one contiguous run so that `LINS`/`LREM` can shift it.

### The heap

Four watermarks, all module-private to [memory.ts](memory.ts) and reached
through accessors:

| Watermark  | Meaning                                                            |
| ---------- | ------------------------------------------------------------------ |
| `heapBase` | `stackSize - 1`: the last cell before the heap. Fixed for the run. |
| `heapPerm` | the top of the _permanent_ heap. `HFIX` raises it to `heapTemp`.   |
| `heapTemp` | the top of the allocated heap. Every allocation bumps it.          |
| `heapMax`  | the high-water mark, for the memory display only                   |

`heapGlobal` is a fifth, set to `heapPerm` on the first `SUBR` and thereafter
read only to ask whether it has been set: no operator uses its value.

Allocation is a bump: `makeHeapString` writes a length cell at `heapTemp + 1`,
the character codes after it, and pushes the pointer. `keybuffer.allocate` does
the same for the ring buffer.

Reclamation has two rules, and they are the subtlest thing in the module:

1. **Reading a temporary heap string frees it, and everything above it.**
   `getHeapString` winds `heapTemp` back to the string it just read, on the
   grounds that an expression's intermediate strings are dead once consumed.
   The bound is strict — `address > heapPerm`, not `>=` — and `memory.ts` works
   through the counterexample that a looser one would mis-evaluate.
2. **`HCLR` winds `heapTemp` back to `heapPerm`.** `encoder/encode.ts` appends
   one to every line that made a heap string, which is what stops a
   string-building loop exhausting the heap. It is deferred while the evaluation
   stack is non-empty, because a part-evaluated expression may still hold
   pointers into the temporary heap; the deferred clear runs at the top of the
   next block.

`HRST` resets both watermarks to `heapBase` and zeroes `main[1]`, discarding the
global heap strings and the keyboard buffer together.

### The keyboard buffer

A ring buffer on the heap, allocated by `BUFR`, with its base address in
`main[1]` and a three-cell header. [keybuffer.ts](keybuffer.ts) is the only
place that knows the layout and documents it there.

### The side arrays

Two arrays live outside `main` because a program reads them only through `STAT`
and clears them only through `ICLR`:

- `memory.keys` (256 cells) — one per key code, holding the modifier bits of the
  last press, or `-1` for "not pressed". `keys[0]` mirrors the number of
  characters currently buffered, which a program reads as `?keybuffer`.
- `memory.query` (16 cells) — indexed by the _negated_ input code, so `?mousex`
  (`-7`) is `query[7]`. [input.ts](input.ts) names them all.

## The opcode groups

The section headings below are the ones
[../constants/pcodes.ts](../constants/pcodes.ts) declares the opcodes under,
`runtime.ts`'s switch dispatches them under, and `runtime.test.ts` tests them
under, so all three read side by side. Every group's body lives in the
`operators/` module named here.

| Group                                | Module          | Opcodes                                                                                               |
| ------------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------- |
| basic stack operations               | `stack.ts`      | `NULL` `DROP` `DUPL` `SWAP` `ROTA` `ROLL` `PICK`                                                      |
| operators on stack value             | `arithmetic.ts` | `INCR` `DECR` `NEG` `ABS` `SIGN`                                                                      |
| random numbers                       | `arithmetic.ts` | `RAND` `SEED`                                                                                         |
| maximum integer                      | `arithmetic.ts` | `MXIN`                                                                                                |
| true value                           | `arithmetic.ts` | `TRUE`                                                                                                |
| Boolean (bitwise) operators          | `arithmetic.ts` | `SHFT` `NOT` `AND` `OR` `XOR`                                                                         |
| lazy Boolean operators               | `arithmetic.ts` | `ANDL` `ORL`                                                                                          |
| binary integer operators             | `arithmetic.ts` | `PLUS` `SUBT` `MULT` `DIVR` `DIV` `MOD`                                                               |
| floored integer division             | `arithmetic.ts` | `DIVF` `MODF`                                                                                         |
| pseudo-real number operators         | `arithmetic.ts` | `DIVM` `LERP` `HYP` `ROOT` `POWR` `LOG` `ALOG` `LN` `EXP` `SIN` `COS` `TAN` `ASIN` `ACOS` `ATAN` `PI` |
| integer/Boolean comparison operators | `comparison.ts` | `EQAL` `NOEQ` `LESS` `MORE` `LSEQ` `MREQ` `MAXI` `MINI`                                               |
| string comparison operators          | `comparison.ts` | `SEQL` `SNEQ` `SLES` `SMOR` `SLEQ` `SMEQ` `SMAX` `SMIN`                                               |
| string operators                     | `strings.ts`    | `CASE` `COPY` `DELS` `INSS` `POSS` `REPL` `SCAT` `SLEN` `SMUL` `SPAD` `TRIM`                          |
| python string tests                  | `strings.ts`    | `CTST` `ERNF`                                                                                         |
| string/array/list bound test         | `variables.ts`  | `TEST`                                                                                                |
| exception handling                   | `flow.ts`       | `TRY` `XCPT`                                                                                          |
| list operators (Python)              | `lists.ts`      | `LAPP` `LCPY` `LEXT` `LIDX` `LINS` `LMUL` `LPRT` `LREM` `LDEL` `LREV` `LIAD` `LIHP`                   |
| file processing                      | `files.ts`      | `CHDR` `FILE` `OPEN` `CLOS` `FBEG` `EOF` `EOLN` `FRDS` `FRLN` `FWRS` `FWLN`                           |
| … directory, search and move         | `files.ts`      | `DIRY` `FFND` `FDIR` `FNXT` `FMOV`                                                                    |
| type conversion operators            | `conversion.ts` | `CTOS` `SASC` `ITOS` `HEXS` `SVAL` `SVDF` `QTOS` `QVAL`                                               |
| debugging and tracing                | `io.ts`         | `TRAC` `MEMW` `DUMP` `PCOH` `POKE`                                                                    |
| canvas state                         | `canvas.ts`     | `CANV` `RESO` `UDAT`                                                                                  |
| basic turtle settings                | `turtle.ts`     | `HOME` `SETX` `SETY` `SETD` `ANGL` `THIK` `PEN` `COLR`                                                |
| turtle movement                      | `turtle.ts`     | `TOXY` `MVXY` `DRXY` `FWRD` `BACK` `LEFT` `RGHT` `TURN`                                               |
| fills and colours                    | `canvas.ts`     | `BLNK` `RCOL` `FILL` `PIXC` `PIXS` `RGB` `MIXC`                                                       |
| drawing shapes                       | `canvas.ts`     | `RMBR` `FRGT` `POLY` `PFIL` `CIRC` `BLOT` `ELPS` `EBLT` `BOX`                                         |
| loading the (evaluation) stack       | `variables.ts`  | `LDIN` `LDVG` `LDVV` `LDVR` `LDAG` `LDAV` `LSTR`                                                      |
| storing from the (evaluation) stack  | `variables.ts`  | `STVG` `STVV` `STVR`                                                                                  |
| pointer and string/array operations  | `variables.ts`  | `LPTR` `SPTR` `ZPTR` `CPTR` `CSTR` `HSTR`                                                             |
| flow control                         | `flow.ts`       | `JUMP` `IFNO` `HALT` `SUBR` `RETN` `PSSR` `PLSR` `PSRJ` `PLRJ`                                        |
| memory management                    | `variables.ts`  | `LDMT` `STMT` `MEMC` `MEMR` `HFIX` `HCLR` `HRST`                                                      |
| input                                | `io.ts`         | `STAT` `ICLR` `BUFR` `READ` `RDLN` `TDET` `CURS`                                                      |
| text output                          | `io.ts`         | `KECH` `OUTP` `CONS` `DISP` `WRIT` `NEWL`                                                             |
| timing                               | `io.ts`         | `TIME` `TSET` `WAIT`                                                                                  |

That is 203 opcodes, in switch order. Any other value throws _"Unknown
PCode 0x…"_ naming the line and code it was found at.

### What the enum contains and the machine does not implement

- **`LPOP`** (`0x57`) has no arm.
- **`TRAC`** and **`MEMW`** pop a value and do nothing with it. Neither does the
  `traceOnRun` option, which nothing in this directory reads — `TODO.md` §3.8
  (recorded as §1.12 until it was clear this is a missing feature rather than a
  defect), where all three are deliberately left undecided: what a trace should
  contain is an open question, and until it is answered these arms stay as they
  are.
- **The twelve "dummy codes"**, `ADDR` through `WRLN` (`0xf0`–`0xfb`), appear
  nowhere but the enum: not emitted by the encoder, not dispatched by the
  machine.
- The enum has gaps — `0x1f`, `0x5d`–`0x5f`, and `0xd0`–`0xef` between the
  timing codes and the dummy ones — where the original system's numbering left
  room. 216 enum members, 203 arms.

## Provenance

Where the machine's behaviour is a judgement call rather than a derivation, it
follows the Delphi original in the sibling `turtle-pascal/` repository:
`Win_TurtleRun.pas` is the runtime, with `RunTypes.pas` and
`SystemConstants.pas` for the limits. Comments name the Pascal procedure at each
site where it matters — `pcCase`, `pcShft`, `pcLerp`, `pcRoot`, `pcPowr`,
`pcFMov` — and those citations should move with the code they annotate.
