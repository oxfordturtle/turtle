# Reading the source

Turtle compiles a program written in one of six languages into pcode, and runs
that pcode on a virtual machine, in the browser. This file is the map. The
top-level `README.md` says what the application is and who it is for;
`test/README.md` covers the test suites and their conventions.

Written in TypeScript, run by Deno. A functional style with immutable data is
preferred, but mutation within a function is fine where it reads better or runs
faster, and the machine's memory is mutable by nature.

## The four directories

```
src/
  core/      the compiler and the virtual machine. No UI, no DOM.
  islands/   the UI, as Womble components and stores. Isomorphic.
  pages/     server-only: the router, request parsing, whole-page assembly.
  client/    the browser entry point, the machine's adapters, page-wide DOM passes.
```

`core/` knows nothing about the other three. `islands/` and `pages/` import
`core/` through its barrels. `client/` is the only place that assumes a browser
at import time.

### The dependency rule for `core/`

`core/`'s entire public API is three barrel modules:

| Barrel              | What it is                                                         |
| ------------------- | ------------------------------------------------------------------ |
| `core/constants.ts` | types and constants shared by the compiler, the machine and the UI |
| `core/compiler.ts`  | `tokenize`, `lexify`, `parse`, `encode`, `analyse`, `highlight`    |
| `core/machine.ts`   | `run`/`pause`/`halt`, user input, machine state, the port types    |

Everything under `core/compiler/`, `core/machine/` and `core/constants/` is a
private implementation detail. **No code outside `core/` may import from those
deeper paths** — always import from the barrel. The same rule binds the tests,
and matters more there: it is the only thing keeping `core/`'s internals free to
be refactored.

Every stage of compilation is exposed rather than hidden behind one `compile()`,
because the UI shows each stage to the user in advanced mode.

## `core/` — the compiler

Five stages, each a separate directory, run in order by
`islands/turtle-system/program.ts`:

```
source text
  → tokenizer/   flat tokens, with no grammar applied (also drives syntax highlighting)
  → lexer/       lexemes: tokens with types, values and positions resolved
  → parser/      an AST of routines, statements and expressions
  → encoder/     pcode: number[][], one array per line
  → analyser/    usage tables, for the Usage tab
```

`formatter/` is a stub, but an _exported_ one: `formatProgram`,
`formatStatement`, `formatExpression` and `formatType` all come out of the
barrel, and nine of its branches return the literal string `"TODO"` while
`formatProgram` returns `"program"`. What it does today — the finished arms and
the placeholders alike — is pinned in `test/core/compiler/formatter.test.ts`,
marked `[known limitation]`, so finishing it trips those tests rather than
passing silently. See `TODO.md` §2.2.

### The parser

- `parser/<language>/` — one directory per language, holding whatever that
  language's syntax needs that no other shares.
- `parser/common/` — the machinery they share: expressions, factors, arguments,
  type checking, name resolution.
- `parser/definitions/` — the AST node types themselves, plus the per-language
  operator precedence ladders.

Precedence lives in `parser/definitions/operators.ts` as a table of rungs,
loosest first, which `common/expression.ts` walks. The tightest-binding prefixes
(`-`, `!`, `~`) have no rung: they bottom out in `common/factor.ts`.

Python is the language that diverges most, and most of the compiler's genuine
complexity is Python's: dynamic lists, string slices, membership tests, method
calls on expressions, and real Python's scoping rule that assigning a name
anywhere in a function makes it local to the whole function.

### The encoder

Pcode is `number[][]` — an array of lines, each an array of opcodes and inline
operands. Two facts shape the whole encoder:

**Jump targets are absolute line numbers.** A statement encoder is handed its
`startLine` and can compute them. An expression encoder is not, and the same
expression fragment may be built more than once and merged into different places
— so an expression emits a _relative_ target instead, encoded as a negative
number, and `encoder/relativeJumps.ts` resolves every one of them into an
absolute line once the program is assembled. `break` and `continue` use a third
mechanism: a placeholder the enclosing loop back-patches
(`encoder/loopContext.ts`).

**A jump leaves the line it is on.** Anything merged onto that line is skipped
along with whatever the jump was meant to skip, so a jump's landing point must
start a new pcode line. This trips up short-circuit `and`/`or`
(`encoder/expressions/compoundExpression.ts`) and the Python list growth guard
(`encoder/lists.ts`) alike, and both say so at the site.

`encoder/encode.ts` finishes the job: back-patch subroutine calls, resolve
relative jumps, append `HCLR` to every line that made a heap string, `HALT`.

## `core/` — the machine

`machine/runtime.ts` is one large `switch` over the pcode instruction set,
inside a loop that runs until a draw or instruction budget is spent, then
reschedules itself through the timers port. Scheduling rather than recursing is
what lets the canvas actually paint between blocks.

The rest of `machine/` is small: `memory.ts` (main memory, the stacks and the
heap), `state.ts` (runtime state and the installed ports), `vcanvas.ts`
(virtual-to-real coordinate mapping), `input.ts` (keyboard and mouse).

Where the machine's behaviour is a judgement call rather than a derivation, it
follows the Delphi original, which lives in the sibling `turtle-pascal/`
repository — `Win_TurtleRun.pas` is the runtime. Comments in `runtime.ts` name
the Pascal procedure where it matters.

### Ports and adapters

The machine is hexagonal. Its outbound ports are declared as types in
`machine/types.ts` and re-exported from `core/machine.ts`; the adapters live in
`client/adapters/`.

| Port     | What the machine does with it             | Browser adapter                      |
| -------- | ----------------------------------------- | ------------------------------------ |
| `canvas` | draws, and reads pixels back              | an HTML canvas and its 2D context    |
| `output` | writes console/output text, reports state | DOM elements, plus the machine store |
| `timers` | current time, schedule/cancel a callback  | `Date.now`, `setTimeout`             |
| `files`  | a filesystem, entirely async              | none yet — a no-op is installed      |

`ports` has no default value: supplying an adapter is the caller's job. `run()`
installs them, but "Reset machine" calls `reset()` without a run, so
`client/index.ts` installs them at startup too.

Pseudo-random numbers turned out not to need a port: they are a pure function of
a seed already in machine state.

The filesystem port is asynchronous because its intended backend (OPFS) is.
`runtime.ts`'s `suspendFor` is the mechanism: it suspends the instruction loop
until a promise settles, then resumes — and refuses to resume if a new `run()`
has started in the meantime, so a stale promise can never mutate the new run's
state.

## `islands/` — the UI

The UI is [Womble](#womble) components: isomorphic modules that render real
markup on the server and hydrate in the browser. This is the bulk of the UI
code.

Each app is one root component whose `render` _is_ the structure of the page,
with its subcomponents in a directory named after it: `turtle-system.ts` plus
`turtle-system/` is the IDE. A route is then mostly just "render this
component".

### The three stores

State that several unrelated components read is a store, not a provider. There
are three, each one `store(id, {state, actions})`, read with `get(property)` and
written with `dispatch(action, args)`:

| Store                      | Holds                                                                    |
| -------------------------- | ------------------------------------------------------------------------ |
| `settings.ts`              | every persisted setting; read on the documentation pages too             |
| `turtle-system/program.ts` | the open files, and everything the compiler derives from the current one |
| `turtle-system/machine.ts` | what the running machine reports                                         |

A component declares one in its `sources` and reads its getters from inside
`render`; Womble subscribes on connect, unsubscribes on disconnect, and
re-renders on notify. The module's exported functions are the names the rest of
the app calls, and each is one dispatch plus whatever part of the job isn't the
store's — halting the machine, prompting for a file, telling the settings store
about a language.

Why these are stores rather than state on an island:

- Womble serialises every declared state key into an attribute when it renders
  on the server, so a `pcode` field would ship the whole program's machine code
  in the page source. `Live` fields don't help: they skip _reflection_, not the
  initial serialisation.
- There is no single island the values could sit on. The editor, the filename
  bar, four tab panes, three menus and the transport controls all read some part
  of them, from different branches of the tree.
- The machine's adapters sit outside the component tree altogether, so there is
  no island for them to write to at all.

Four rules those modules keep:

1. **A mutation is an action.** An action takes one argument after the state, so
   anything needing two passes an object. An exported wrapper stays a _function_
   wherever its signature is generic (`setSetting<K>`, `setTurtleProperty<P>`):
   `dispatch` takes exactly what the action declared, so a bare dispatch would
   lose the correlation between the two arguments.
2. **An action never calls another action.** Shared work is a helper that
   returns a partial, which both actions spread. An inner dispatch notifies
   twice for one gesture, and — worse — commits before the outer action returns,
   so the outer's merge silently clobbers it.
3. **`coalesce: true` is for a writer that isn't a person.** Only
   `turtle-system/machine.ts` has one: the VM's instruction loop writes it
   thousands of times a second, and Womble re-renders inline on a notify.
4. **A store is never written during a server render.** The value would be
   scoped and discarded, and `save()` writes to Deno's _process-wide_
   `sessionStorage`, which no scope covers.

Ephemeral UI state — a menu open or closed, the active tab — stays on the
component that owns it.

### Womble

Womble is the component library, published at `jsr:@merivale/womble`. Its own
`README.md` is the reference; what follows is the set of rules this codebase has
to keep, all of which fail _silently_ apart from a console line.

**Don't name an action after a native DOM event.** A committed action announces
itself as a bubbling event of the same name, which is how a parent listens to a
child (`on-selectTab="..."` on the child's tag). An action called `select`,
`toggle`, `close`, `change` or `submit` doesn't announce at all, because the
synthesised event would be indistinguishable from the real one. Name them
`selectTab`, `closeMenu`, `toggleSubmenu`.

**Don't name an attribute after a DOM property, or an action after a DOM
method.** Every attribute becomes a property on the element and every action
becomes a method. `title`, `id`, `hidden`, `children`, `style`, `lang`, `dir`,
`slot`, `className` and `textContent` collide on the property side; `remove`,
`focus`, `blur`, `append`, `closest` and `scrollIntoView` on the method side.
Womble skips the accessor or the method for those.

**A component's `attributes` is its default state.** Each is written as the
value it holds when absent (`label: ""`, `open: false`, `tab: "canvas"`), and
its type is that value's own. Two rules follow. An attribute may not be an
**array** — no attribute in HTML carries a list, so use a store, call-site
children, or a comma-separated string (as `class` and `rel` do, and as `modes`
and `options` in `setting-controls.ts` do). And a **boolean may never default to
`true`**: absence is all a boolean attribute has to say false with. A flag that
starts on is either named the other way round or turned on at the call site.

Spelling is free: an attribute travels lowercased, but Womble resolves between
the declared spelling and the wire one, so `maxCount` is legal and arrives in
`render` spelled that way.

**A control something other than the user can change needs a property binding**
— `.checked`/`.selected`/`.value`, not the plain attribute.
`setting-controls.ts` has the full rule.

**A child talks to its call site by announcing, not through `context`.** Every
committed action reached from a real DOM event announces itself, including one
returning `undefined`, so a child with no state of its own can still report a
pure command. _Which_ child asked is read off `args.element`: an announced event
carries no payload, the same way `change` doesn't.

**Commanding a component from outside its subtree is a method call on its
element.** `element.selectTab({ tab: "canvas" })` runs the real action — commit,
re-render, and any effect that follows — rather than setting a field the way a
property write does. That is how a plain module, an adapter, or a page-wide DOM
pass reaches a component. All of ours are collected in
`turtle-system/commands.ts`, which reads the element types out of
`HTMLElementTagNameMap`, where each defining module publishes its own.

Nothing in this app declares `context` any more.

## `client/` — the browser

`index.ts` exports `init()`, the one place where startup order matters: install
the ports, restore the file memory, initialise the settings, run the page-wide
passes, subscribe the last two to the settings store. The islands hydrate on a
microtask after this module's body, so the first render of every display already
has the right program and settings in it.

`main.ts` is the bundle entry (`build.ts` points at it) and does nothing but
call `init()`. The split is what lets the jsdom test layer run the real startup
— `mountRoute` calls the same `init()` after injecting a route's markup — rather
than keeping a mirror of it that can drift.

`adapters/` implements the machine's outbound ports, plus keyboard and mouse
input — which is a _driving_ port, the one that calls in rather than out. The
canvas and console adapters stay imperative and write the DOM directly: a
running program appends to them character by character and pixel by pixel, at a
rate no re-render can follow. Everything else the machine reports is state, and
goes to the machine store for components to render.

None of the adapters touches the DOM at import time. `<canvas-tab>` and
`<output-tab>` hand them their elements from their own mount effects, which is
what lets an isomorphic island module import them at all.

`passes.ts` holds the three page-wide DOM passes, which have no component to
hang off. All three sweep _static, server-rendered documentation prose_ —
scattered across the help and reference pages, owned by no island. Anything
inside an island derives its own visibility from the settings instead, because
these run before the islands hydrate and a component's first render would wipe
whatever they had just set. That is why the nine tab panes carry no `data-mode`.

## `pages/` — the server

The router, request parsing, response helpers, and the full-page assembly that
wraps a route's markup in `<html>`.

`_layout/page.ts` is the whole page as one `html` template, which is what makes
island expansion happen exactly once, at the final `String(...)`. Two things
about its `withStores` scope are load-bearing:

- **The scope wraps the stringification, not the `html` call.** Expansion — and
  so every component's `render` — happens at that stringification. Anything that
  stringifies markup outside this function renders outside the scope, and is
  served the store's module defaults.
- **The callback must stay synchronous.** The scope is a stack unwound in a
  `finally`, so it lasts exactly as long as the call. Every `await` in `pages/`
  is outside it, and has to stay there.

`${storeSeeds()}` in the `<head>` is the other half: the seeded fields as one
inert JSON script, which the store adopts on its first read in the browser, so
the first paint matches the markup the server sent. Exactly one field is ever
seeded — a link's `?l=` language. Everything else a page varies with is a
`sessionStorage` fact the server cannot see, so the defaults are the honest
answer and `initialiseSettings` corrects them in the browser.

`documentation/` holds the help and reference pages, whose content is written
per language and per topic. Much of it is generated from `core/constants/` —
`commands.ts` in particular — so that the documentation cannot drift from what
the compiler actually implements.

## Known gaps

- No filesystem adapter, so the file-processing opcodes have nothing real behind
  them in the browser.
- `core/compiler/formatter/` is a stub — exported and pinned, but unimplemented
  (see above, and `TODO.md` §2.2).
- Undo, Redo, Cut, Copy and Paste in the Edit menu report "not implemented".
  They need either `document.execCommand`, which is deprecated and unspecified,
  or an undo stack that would have to replace the browser's rather than sit
  beside it. The keyboard shortcuts all work on the textarea already.
- "Save settings" needs an account system that does not exist.
