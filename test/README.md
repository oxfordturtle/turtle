# Testing Turtle

Day-to-day testing conventions for this project.

## The suites

| Task                        | What it runs                                                                                        | Speed  |
| --------------------------- | --------------------------------------------------------------------------------------------------- | ------ |
| `deno task test:core`       | `test/core/**` - unit tests against the three barrels                                               | ~6s    |
| `deno task test:ui`         | `test/ui/ssr/**` and `test/ui/dom/**` - server markup, then hydration and interaction in jsdom      | ~11s   |
| `deno task test`            | both of the above, plus `tools/` - the fast set                                                     | ~18s   |
| `deno task coverage:check`  | the fast set again, instrumented, then the coverage gate                                            | ~37s   |
| `deno task test:examples`   | `test/examples/**` - compiles and runs all 503 real programs under `assets/examples/`               | ~1m45s |
| `deno task test:ui:browser` | `test/ui/browser/**` - five smoke tests in a real Chrome, against a server this suite starts itself | ~3s    |

**Run `test` constantly; run `coverage:check`, `test:examples` and
`test:ui:browser` before you commit.** Always run `test:examples` after touching
the parser, encoder, or machine - it is the only thing that checks real programs
still work end to end - and `test:ui:browser` after touching the canvas, the
console, or anything about how the page loads. `test:ui:browser` needs
`deno task build` to have run (it serves `assets/build/index.js`, and says so if
it's missing).

`.github/workflows/ci.yml` runs `fmt:check`, `coverage:check`, `test:examples`
and, after a `build`, `test:ui:browser` - so CI runs everything, and
`coverage:check` is what stands in for the plain `test` task there.

## Coverage: 100%, enforced, on both trees

`deno task coverage:check` instruments two runs and then fails the task if
either tree is below **100% of lines, branches and functions**:

| Tree                                     | Measured from                     | Reported as |
| ---------------------------------------- | --------------------------------- | ----------- |
| `src/core`                               | `test/core/` (and `tools/`)       | enforced    |
| `src/islands`, `src/pages`, `src/client` | `test/ui/ssr/` and `test/ui/dom/` | enforced    |

> **The two profiles are separate on purpose, and the core one is measured from
> `test:core` alone.** `src/core` has to stand on its own unit tests. The
> example sweep is regression cover, not a coverage source - it must never be
> the reason a line is "covered" - and neither is the browser suite, which
> doesn't run under instrumentation at all.

The gate is `tools/coverageGate.ts`, which has its own tests (run by
`deno task test`). Two things about it are worth knowing:

- **A file no test imports counts as 0%, not as absent.** `deno coverage` only
  reports files that were _loaded_, so the gate walks the whole `src` tree
  itself and fails on anything the lcov report never mentions.
- **Exclusions live in the source, not in the gate.** Deno's own directives
  (`deno-coverage-ignore`, `-start`/`-stop`, `-file`) take the excluded lines,
  branches and functions out of the lcov output. The gate's `FILE_EXCLUSIONS`
  map is a last resort for a file that can't carry a directive; it is empty, and
  every exclusion of either kind is printed on every run, so the list can't grow
  unnoticed.

```
deno task coverage:check      # the gate: what CI runs
deno task coverage:html       # per-file browsable report, per tree
```

100% is a floor, not a goal in itself. Rules 3 and 4 below are what stop it
turning into a number to game.

## Rules

**1. Import only from the three barrels.** Tests may import
`@/core/constants.ts`, `@/core/compiler.ts`, and `@/core/machine.ts`, and
nothing deeper. `src/README.md` states this for source code; it matters at least
as much for tests, because it is the only thing keeping `src/core`'s internals
free to be refactored. A test that reaches into `src/core/compiler/parser/...`
freezes that path's shape forever.

(Test _helpers_ - everything under a `lib/` directory, see "Helpers" below - are
shared infrastructure and may be imported freely between test files. `test/ui/`
has a rule of its own on top of this one: layer 2 imports `src/` only through
`test/ui/lib/setup.ts`.)

**2. New code ships with its tests in the same change.** Not as a follow-up.
Every past effort to add tests to already-written code found real bugs in it -
20-odd across the whole of `src/core`, and in the UI sweep that closed the last
of these gaps, a `setting-flag` control whose two radios both stood for `true`

- which is exactly the cost of writing them late. With both trees enforced at
  100%, the gate now says so as well.

**3. Assert behaviour, not execution.** A test whose only effect is to make a
line count as covered is worse than no test: it costs maintenance and catches
nothing. For a parser, assert the specific `CompilerError` message or the parsed
structure. For the encoder, assert the emitted pcode. For the machine, assert
output, canvas calls, or memory. For a component, assert what it rendered or
what it wrote to a store. Ask: _if someone broke this on purpose, would my test
fail?_

**4. Don't force a test onto genuinely unreachable code.** Some defensive guards
can't fire. Contorting a test to reach one is not the goal: establish that it
really is unreachable, then exclude it with a `deno-coverage-ignore` directive
**whose comment says why**, in the form the existing ones use:

```ts
// deno-coverage-ignore-start -- the `?? ""` fallback is unreachable:
// `textContent` is null only on a document or doctype node, and this
// query only ever yields elements.
```

The justification is not optional - it is the whole difference between an
exclusion and a hole. There are ~65 of these across the parsers, the encoder,
the machine and the islands, each arguing its own case in place, plus four
whole-file directives on type-only modules.

**5. Pin known-wrong behaviour deliberately.** When you find a bug you're not
fixing now, write a test asserting the current (wrong) behaviour, marked
`[known bug]` or `[known limitation]`, with a comment saying what the right
behaviour would be. Fixing it then trips the test instead of passing silently.
`TODO.md` collects these; changing one of them means updating its pinned test as
part of the change.

**6. A UI test asserts that Womble reported nothing.** Womble degrades rather
than throws: an invalid attribute, a missing ancestor, an action named after a
DOM event and an attribute colliding with a DOM property all log and carry on. A
test that doesn't check the log can pass against a component that never
hydrated. In `test/ui/ssr/` that's `assertEquals(logs, [])` on what
`renderRoute` captured; in `test/ui/dom/` it's `afterEach(assertNoWombleLogs)`
at the top of the file, plus `mountRoute`'s own check that the mount itself was
clean.

## Helpers

**Helpers live in a `lib/` directory beside the tests that use them, under
plain names** - `test/core/machine/lib/fakes.ts`, not `_fakes.ts`. Deno treats
`*.test.ts` as the test files, so nothing else needs a prefix to stay out of the
run.

- **Cross-language behaviour → the `LANGUAGES` table.**
  `test/core/compiler/lib/languages.ts`. Anything true of two or more of the six
  languages (a `for` loop, an `if`, an assignment) is tested once through the
  table, not copy-pasted six times. Per-language test files are for genuinely
  divergent syntax.
- **Program fixtures →** `test/core/compiler/parser/lib/programs.ts`
  (`parseProgram`, `wrapProgram`, `bodyStatements`), which hides each language's
  boilerplate; `test/core/compiler/encoder/lib/helpers.ts` (`compileAndEncode`)
  is the whole pipeline in one call.
- **Machine behaviour → the fake ports.** `test/core/machine/lib/fakes.ts`
  provides `fakeTimers`/`fakeOutput`/`fakeCanvas`/`fakeFiles`;
  `lib/helpers.ts` provides `runPcode`, `runSource`, `runSourceToText`,
  `assertCompilerError` and friends. The machine's I/O is behind injectable
  outbound ports precisely so it can be tested without a browser - use them
  rather than inventing new scaffolding. `fakeTimers.flush()` drives a program
  to completion and throws if it exceeds its iteration cap, so a runaway loop
  fails loudly instead of hanging the suite.
- **Installing ports outside a run →** `setPorts` (see
  `test/core/machine/control.test.ts`). `run()` installs ports itself; only code
  paths reachable _without_ a run (e.g. `reset()`) need it explicitly.

## The example suite

`test/examples/` is a **snapshot suite**: every program under
`assets/examples/` is compiled and run, and the whole of what it did is compared
against a golden record in `test/examples/snapshots/`, which mirrors the
examples tree file for file (503 of them, and excluded from prettier).

Each record (`lib/record.ts`) holds the pcode as a line count and an FNV-1a
hash, whether the run hit its iteration cap, the console and output text
verbatim, any runtime errors, the final turtle, and a digest of the canvas
traffic: how many calls, how many of each method, a hash of the whole call log
folded in as it goes, and the first and last 25 calls in full. So a change to
the compiler or the machine shows up as a _named field_ on a _named example_,
not as "something moved".

`lib/harness.ts` discovers the examples and runs each in one of four modes -
`bounded` (500 iterations and stop), `readline`, `keypress` and `asyncFiles` -
with the input each interactive program needs supplied from its own table.

**When a change moves a golden on purpose:**

```
deno task test:examples:update   # rewrites the snapshots, naming what changed
```

It prints new/changed/unchanged and names the fields that moved, so the diff is
reviewable rather than a wall of JSON. Read what it says before committing it:
this is the one suite where accepting the output is the same gesture as
approving the change.

Two things the updater cannot wave through:

- **`EXPECTED_RUNTIME_ERRORS` is a hard gate**, checked _before_ the comparison.
  It is empty: no example may fail at runtime. An example that starts throwing
  fails the suite whatever its snapshot says.
- **Determinism** - the suite runs one example (Dendrites) twice and requires
  the two records to be identical, so a program that quietly depends on the
  clock can't be snapshotted into looking stable.

The suite also carries one cross-language check worth keeping: the Python and
Pascal `MandelbrotSpectrumDemo` goldens have the _identical_ canvas `logHash`,
which is a strong statement that two front ends really do compile to the same
drawing.

Six synthetic regression tests for compiled-Python list handling live in
`test/core/machine/lists.test.ts` ("compiled-Python regression pins"), where
they belong: they are hand-written programs, not examples.

## The UI layers

`test/ui/` is three suites, because the UI has three genuinely different
substrates and one harness can't reach all of them. Which layer a test belongs
in is decided by what it needs, not by what it is about:

| Layer              | Substrate           | Covers                                                                               |
| ------------------ | ------------------- | ------------------------------------------------------------------------------------ |
| `test/ui/ssr/`     | none (pure Deno)    | what the server sends: island expansion, props, stores, static markup                |
| `test/ui/dom/`     | jsdom               | what the client does: actions, state, the stores, the adapters, the page-wide passes |
| `test/ui/browser/` | Playwright + Chrome | what neither can see: canvas pixels, console text, layout, visibility                |

- **Layer 1 renders through the real router** - `renderRoute("/about")` is one
  function call, no server and no DOM (`test/ui/ssr/lib/render.ts`). That
  includes `?l=`, which the layout seeds the settings store from per request, so
  `renderRoute("/?l=BASIC")` really does send a BASIC page. What no URL can
  reach is the **mode**, a `sessionStorage` fact the server never sees, and that
  is what `renderIslands` is left for: it opens Womble's own `withStores` scope
  around the render. `test/ui/ssr/pages.test.ts` drives the router with
  constructed `Request`s for the parts no route reaches - the asset branch and
  its 404, POST bodies, the error pages, the response helpers.
- **Layer 2 imports everything from `test/ui/lib/setup.ts`** and nothing from
  `src/` directly. That module sets up the DOM _before_ the island modules are
  evaluated, which is the only ordering under which they register at all; its
  doc comment is the full explanation, and it's worth reading before writing a
  test here.
- **`mountRoute` is a page load, and runs the real startup.** It renders the
  route through the router, puts the markup in the document, then calls the
  actual `init()` from `src/client/index.ts` - the same function the bundle
  entry calls, in the same place in the sequence. There is no hand-kept mirror
  of the startup to drift. It also resets the three stores first, so each mount
  adopts its own seed as a fresh document would, and asserts that the mount
  itself produced no Womble reports before handing over.
- **Layer 2 doesn't measure.** No real widths, no canvas pixels, no computed
  style, no focus beyond the basics - jsdom can't answer those and
  `@merivale/womble/testing` says so in its own doc comment. Two stubs stand in
  for what would otherwise throw: a `ResizeObserver` that calls back on
  `observe` (as a real one does) with jsdom's unlaid-out zero, and
  `getContext` returning null. What the canvas adapter _would_ have drawn is
  asserted as a call sequence instead, against the recording context in
  `test/ui/dom/adapters/lib/recording.ts`; the pixels themselves are layer 3's.
- **`highlightCodeBlocks` runs here now.** It reads each block with
  `textContent` rather than `innerText` - identical for these blocks, which the
  server renders as plain escaped text, and unlike `innerText` it exists in
  jsdom. A layer 3 test double-checks the rendered result in real Chrome.
- **Layer 3 stays small.** Five tests: an acceptance pass - the checks a human
  would otherwise do by hand before a release - not a second functional suite.
  It serves the router itself on a port of its own, never :8000, where a stale
  `deno task run` from an earlier session serves pre-edit markup against a fresh
  bundle and looks exactly like a hydration bug.

## Follow-ups (not done, deliberately)

- **`src/core/compiler/formatter/`.** Exported from the compiler barrel and
  pinned by `test/core/compiler/formatter.test.ts`, but still a stub: nine
  branches return the literal `"TODO"` and `formatProgram` returns
  `"program"`. The pins assert exactly that, marked `[known limitation]`, so
  implementing it trips them rather than passing silently. See `TODO.md` §2.2.
