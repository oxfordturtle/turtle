# Testing Turtle

Day-to-day testing conventions for this project.

## The four suites

| Task                        | What it runs                                                                                                                 | Speed  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| `deno task test:core`       | `test/core/**` — unit tests against the three barrels                                                                        | ~4s    |
| `deno task test:ui`         | `test/ui/ssr/**` and `test/ui/dom/**` — server markup, then hydration and interaction in jsdom                               | ~4s    |
| `deno task test`            | both of the above — the fast pair                                                                                            | ~8s    |
| `deno task test:examples`   | `test/examples/**` — compiles and runs all 503 real programs under `assets/examples/`, plus the Python-list regression files | ~1m31s |
| `deno task test:ui:browser` | `test/ui/browser/**` — four smoke tests in a real Chrome, against a server this suite starts itself                          | ~5s    |

**Run `test` constantly; run `test:examples` and `test:ui:browser` before you
commit.** Always run `test:examples` after touching the parser, encoder, or
machine — it is the only thing that checks real programs still work end to end —
and `test:ui:browser` after touching the canvas, the console, or anything about
how the page loads. `test:ui:browser` needs `deno task build` to have run (it
serves `assets/build/index.js`, and says so if it's missing).

The split exists so the fast pair stays fast enough to run on every save. It
also means something more important:

> **Coverage is measured from `test:core` only.** `src/core` has to stand on its
> own unit tests. The example sweep is regression cover, not a coverage source —
> it must never be the reason a line is "covered".

```
deno task test:core:coverage && deno task coverage:report
deno task coverage:html       # per-file browsable report
```

There is no enforced floor: coverage is a thing to look at when you have changed
`src/core`, not a number to defend.

## Rules

**1. Import only from the three barrels.** Tests may import
`@/core/constants.ts`, `@/core/compiler.ts`, and `@/core/machine.ts`, and
nothing deeper. `src/README.md` states this for source code; it matters at least
as much for tests, because it is the only thing keeping `src/core`'s internals
free to be refactored. A test that reaches into `src/core/compiler/parser/...`
freezes that path's shape forever.

(Test _helpers_ under `test/core/machine/` — `_fakes.ts`, `_helpers.ts` — are
shared infrastructure and may be imported freely between test files.)

**2. New `src/core` code ships with its tests in the same change.** Not as a
follow-up. Every past effort to add tests to already-written code found real
bugs in it — 20-odd across the whole of `src/core` — which is exactly the cost
of writing them late.

**3. Assert behaviour, not execution.** A test whose only effect is to make a
line count as covered is worse than no test: it costs maintenance and catches
nothing. For a parser, assert the specific `CompilerError` message or the parsed
structure. For the encoder, assert the emitted pcode. For the machine, assert
output, canvas calls, or memory. Ask: _if someone broke this on purpose, would
my test fail?_

**4. Don't force a test onto genuinely unreachable code.** Some defensive guards
can't fire. Contorting a test to reach one is not the goal. Establish it really
is unreachable, write down _why_ next to the code or in the test file, and leave
it.

**5. Pin known-wrong behaviour deliberately.** When you find a bug you're not
fixing now, write a test asserting the current (wrong) behaviour, marked
`[known bug]` or `[known limitation]`, with a comment saying what the right
behaviour would be. Fixing it then trips the test instead of passing silently.

**6. A UI test asserts that Womble reported nothing.** Womble degrades rather
than throws: an invalid attribute, a missing ancestor, an action named after a
DOM event and an attribute colliding with a DOM property all log and carry on. A
test that doesn't check the log can pass against a component that never
hydrated. In `test/ui/ssr/` that's `assertEquals(logs, [])` on what
`renderRoute` captured; in `test/ui/dom/` it's `assertNoWombleLogs()`.

## Patterns to reuse

- **Cross-language behaviour → the `LANGUAGES` table.**
  `test/core/compiler/_languages.ts`. Anything true of two or more of the six
  languages (a `for` loop, an `if`, an assignment) is tested once through the
  table, not copy-pasted six times. Per-language test files are for genuinely
  divergent syntax.
- **Program fixtures →** `test/core/compiler/parser/_programs.ts`
  (`parseProgram`, `wrapProgram`, `bodyStatements`), which hides each language's
  boilerplate.
- **Machine behaviour → the fake ports.** `test/core/machine/_fakes.ts` provides
  `fakeTimers`/`fakeOutput`/ `fakeCanvas`/`fakeFiles`; `_helpers.ts` provides
  `runPcode`, `runToInt`, `runToString` and friends. The machine's I/O is behind
  injectable outbound ports precisely so it can be tested without a browser —
  use them rather than inventing new scaffolding. `fakeTimers.flush()` drives a
  program to completion and throws if it exceeds its iteration cap, so a runaway
  loop fails loudly instead of hanging the suite.
- **Installing ports outside a run →** `setPorts` (see
  `test/core/machine/control.test.ts`). `run()` installs ports itself; only code
  paths reachable _without_ a run (e.g. `reset()`) need it explicitly.

## The UI layers

`test/ui/` is three suites, because the UI has three genuinely different
substrates and one harness can't reach all of them. Which layer a test belongs
in is decided by what it needs, not by what it is about:

| Layer              | Substrate           | Covers                                                                 |
| ------------------ | ------------------- | ---------------------------------------------------------------------- |
| `test/ui/ssr/`     | none (pure Deno)    | what the server sends: island expansion, props, stores, static markup  |
| `test/ui/dom/`     | jsdom               | what the client does: actions, state, the stores, the page-wide passes |
| `test/ui/browser/` | Playwright + Chrome | what neither can see: canvas pixels, console text, layout, measurement |

- **Layer 1 renders through the real router** — `renderRoute("/about")` is one
  function call, no server and no DOM (`test/ui/ssr/_render.ts`). That includes
  `?l=`, which the layout seeds the settings store from per request, so
  `renderRoute("/?l=BASIC")` really does send a BASIC page. What no URL can
  reach is the **mode**, a `sessionStorage` fact the server never sees, and that
  is what `renderIslands` is left for: it opens Womble's own `withStores` scope
  around the render.
- **Layer 2 imports everything from `test/ui/_setup.ts`** and nothing from
  `src/` directly. That module sets up the DOM _before_ the island modules are
  evaluated, which is the only ordering under which they register at all; its
  doc comment is the full explanation, and it's worth reading before writing a
  test here.
- **Layer 2 doesn't measure.** No `ResizeObserver`-driven widths, no canvas, no
  computed style, no focus beyond the basics — jsdom can't answer those and
  `@merivale/womble/testing` says so in its own doc comment. They go in layer 3
  or nowhere.
- **Layer 3 stays small.** It is an acceptance pass — the checks a human would
  otherwise do by hand before a release — not a second functional suite. It
  serves the router itself on a port of its own, never :8000, where a stale
  `deno task run` from an earlier session serves pre-edit markup against a fresh
  bundle and looks exactly like a hydration bug.

## Follow-ups (not done, deliberately)

- **The UI suites can't run in CI as things stand.** `.github/workflows/ci.yml`
  runs all five tasks, but `deno.json` maps `@merivale/womble` to
  `../../merivale/womble/mod.ts` — a path outside this repo, in a git repository
  with no remote and no JSR package, so nothing outside a working copy that has
  Womble beside it can resolve the import. Publishing Womble is the real answer.
- **`src/core/compiler/formatter/`.** Four files, zero coverage, not exported
  from any barrel and headed by a stub. Left as-is on purpose; if the formatter
  is ever finished, it gets tests then.
