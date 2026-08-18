import {
  assertNoLogs,
  captureLogs,
  flush,
  type LogEntry,
  q,
  qa,
  setupDom,
  tick,
} from "@merivale/womble/testing";

/**
 * Everything a layer 2 (hydration and interaction) test needs, in one module.
 *
 * **Import this before anything else, and import nothing from `src/` in a
 * test file directly.** That isn't a style rule, it's the only ordering that
 * works. `define()` checks for a DOM *at the moment it runs* and skips real
 * custom-element registration if there isn't one - so every island module has
 * to be evaluated after `setupDom()`. An ES module's imports are hoisted and
 * evaluated before its body, so the only way to guarantee that is to put
 * `setupDom()` above a set of dynamic imports, which is what happens below.
 * A test file that reached for `@/islands/...` (or `@/pages/router.ts`, which
 * pulls the islands in for its own server rendering) with a plain `import`
 * would risk evaluating it first, and would then be driving a page of
 * *unhydrated* markup - which looks exactly like a page that hydrated and
 * did nothing. Re-exporting the modules from here removes the hazard rather
 * than documenting it.
 *
 * Deno evaluates each test file's module graph separately, so every test file
 * gets its own DOM, its own island registrations and its own copy of the three
 * stores. Within one file they are shared, as they are in a real page: a test
 * sets up what it needs rather than assuming a pristine store.
 *
 * ## What is faked, and why
 *
 * Only two things, both of them squarely in the "out of reach" half of
 * `@merivale/womble/testing`'s own boundary list:
 *
 * - **`ResizeObserver`**, because there is no layout to observe. Without it
 *   `<system-editor>`'s `editorDom` effect throws on setup, which Womble
 *   logs and carries on from - so every test in this layer would start with a
 *   log entry and the editor's textarea would never sync. The stub does
 *   nothing, deliberately: the width it would feed back is a measurement, and
 *   measurement is layer 3's job.
 * - **`HTMLCanvasElement.prototype.getContext`**, which jsdom implements by
 *   reporting "not implemented" to its virtual console unless the `canvas`
 *   npm package is installed. `attachCanvas` already copes with a null
 *   context (`element?.getContext("2d") ?? null`), so returning null is what
 *   the adapter is written for. Canvas pixels are layer 3's job too.
 *
 * `sessionStorage` needs no stub at all: Deno implements the Web Storage API
 * natively, so `src/client/state/storage.ts` reads and writes a real one.
 * It's process-wide rather than per-window, so `mountRoute` clears it - which
 * is also what makes a mount reproducible, since the settings store and the
 * command table both reconcile against it.
 */

// `setupDom` hands back the document; the window it belongs to is what the
// canvas stub below has to reach, and jsdom's is only typed as the DOM's own
// `Window`, without the constructors a real global carries.
const window = setupDom().defaultView as unknown as Window & typeof globalThis;

// deno-lint-ignore no-explicit-any
(globalThis as any).ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

window.HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof window.HTMLCanvasElement.prototype.getContext;

// Every import below is dynamic, and every one of them has to stay that way -
// see the note above. The order mirrors src/client/index.ts: the site-wide
// islands, then the system app through its own barrel, then the documentation
// islands.
const { default: route } = await import("@/pages/router.ts");
await import("@/islands/site-menu.ts");
await import("@/islands/language-select.ts");
await import("@/islands/setting-controls.ts");
await import("@/islands/turtle-system/index.ts");
await import("@/islands/doc-tabs.ts");
await import("@/islands/reference/colour-table.ts");
await import("@/islands/reference/command-table.ts");
await flush();

/** every persisted setting (src/islands/settings.ts) */
export const settings = await import("@/islands/settings.ts");

/** the file memory and the compile pipeline (src/islands/turtle-system/program.ts) */
export const program = await import("@/islands/turtle-system/program.ts");

/** what the running machine reports (src/islands/turtle-system/machine.ts) */
export const machine = await import("@/islands/turtle-system/machine.ts");

/** the out-of-subtree command channels (src/islands/turtle-system/commands.ts) */
export const commands = await import("@/islands/turtle-system/commands.ts");

/** the page-wide DOM passes the client entry runs and re-runs (src/client/passes.ts) */
const passes = await import("@/client/passes.ts");

// The file memory the client entry would have restored. Idempotent, and there
// is nothing in storage at this point, so this is what creates the one empty
// file every test that touches the editor needs.
program.initialise();

// The other half of what the client entry wires up: the two sweeps that follow
// the settings for as long as the page lives. Once per test file rather than
// once per mount, since the store outlives a mount and so does its listener -
// exactly as in a browser, where both outlive every render.
settings.settingsStore.subscribe(() => {
  passes.languageVisibility();
  passes.modeVisibility();
});

/**
 * Every failure Womble reports, for as long as this module is loaded. Read it
 * directly to assert an *expected* degradation; the usual posture is
 * `assertNoWombleLogs()` (rule 6 in test/README.md).
 */
export const logs: LogEntry[] = captureLogs().entries;

/** Rule 6: a UI test asserts that Womble reported nothing. */
export const assertNoWombleLogs = (): void => assertNoLogs(logs);

/**
 * Renders a route through the real router and hydrates its markup, which is
 * as close to "load the page" as this layer gets: the same server output
 * layer 1 asserts against, parsed into the document the islands upgrade in.
 *
 * The `<body>`'s own attributes are dropped (only its contents are needed,
 * and jsdom's body is already there), the session is cleared so storage
 * reconciliation starts from the defaults, and `logs` is emptied so a test
 * asserts on its own interactions rather than on the mount before it.
 *
 * The document's own URL is set to `path` as well, so `mountRoute("/?l=Pascal")`
 * is a page loaded at that address and not just a page whose markup was
 * rendered for it. The settings store reads `?l=` off `document.location` as it
 * initialises, and before this it would have seen the previous test's URL.
 *
 * **The three calls after the markup are the client entry's startup, in its
 * order** (src/client/index.ts): the settings are re-read from the session and
 * the URL - which is a store's version of a page load, and what the settings
 * island used to get from re-mounting - and the page-wide passes then sweep the
 * document the route just produced. They run *after* the markup is in the
 * document, as they do in a browser, where a `defer`red bundle is the last
 * thing the parser reaches.
 *
 * `keepSession` is for the one thing clearing the session hides: a *second*
 * page load, which finds whatever the first one stored. Everything the settings
 * store and the command table reconcile against lives there.
 */
export const mountRoute = async (
  path: string,
  { keepSession = false }: { keepSession?: boolean } = {},
): Promise<Document> => {
  if (!keepSession) sessionStorage.clear();
  document.defaultView?.history.replaceState(null, "", path);
  const response = await route(new Request(`http://localhost${path}`));
  const markup = await response.text();
  const body = markup.slice(
    markup.indexOf("<body"),
    markup.lastIndexOf("</body>"),
  );
  // The store seed script is genuine server output that lives in the `<head>`,
  // which this otherwise drops, so it's carried across - Womble finds it with
  // `document.querySelector`, so anywhere in the document will do. It changes
  // nothing here today, and can't: a store adopts a seed on its first read and
  // memoizes that per *document*, and a test file has exactly one document, so
  // only the first mount in a file could ever adopt. What a `?l=` assertion in
  // this layer is really guaranteed by is `initialiseSettings` below, which
  // re-derives the language from the URL the same way the server did.
  document.body.innerHTML =
    seedScript(markup) + body.slice(body.indexOf(">") + 1);
  settings.initialiseSettings();
  // `highlightCodeBlocks` is deliberately not run: it reads `innerText`, which
  // jsdom doesn't implement, so it throws here and always has. As an effect on
  // the settings island that throw was caught and logged by Womble, and
  // `logs.length = 0` below then swallowed it; as a plain call it would fail
  // the mount. Syntax-highlighted prose is layer 3's to check either way.
  passes.languageVisibility();
  passes.modeVisibility();
  await settle();
  logs.length = 0;
  return document;
};

/** Womble's `<script type="application/json" data-womble-stores>`, lifted out of the head. */
const seedScript = (markup: string): string => {
  const start = markup.indexOf('<script type="application/json"');
  if (start === -1) return "";
  const end = markup.indexOf("</script>", start);
  return markup.slice(start, end + "</script>".length);
};

/**
 * Waits for everything a click or a store change sets off: Womble commits and
 * re-renders on a microtask, and an effect that dispatches in turn queues
 * another - so a macrotask, which comes after all of them, is the reliable
 * wait. Every assertion in this layer follows one of these.
 */
export const settle = async (): Promise<void> => {
  await flush();
  await tick();
};

/** Clicks an element, as a user would - a real bubbling event, which is what Womble's delegated listeners hear. */
export const click = async (element: Element): Promise<void> => {
  (element as HTMLElement).click();
  await settle();
};

/**
 * Changes a form control and announces it, which the DOM does not do by
 * itself: assigning `.value`/`.checked` fires nothing. The event bubbles
 * because that is how Womble hears it, and it is dispatched on the control
 * so `element` in the action is the control the user touched.
 */
export const change = async (control: Element): Promise<void> => {
  control.dispatchEvent(new Event("change", { bubbles: true }));
  await settle();
};

/** Types into a textarea or input, announcing it the way a keystroke does. */
export const type = async (
  control: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<void> => {
  control.value = value;
  control.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
};

export { flush, q, qa, tick };
export type { LogEntry };
