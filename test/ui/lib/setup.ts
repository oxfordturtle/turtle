import {
  assertNoLogs,
  captureLogs,
  flush,
  type LogEntry,
  q,
  qa,
  resetStore,
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
 *   log entry and the editor's textarea would never sync. The stub keeps the
 *   one behaviour that isn't a measurement: a real observer calls back once
 *   as soon as it observes, and so does this. What it feeds back here is
 *   jsdom's unlaid-out zero, so a test that wants a width sets one on the
 *   element and calls `resize()` below; the *real* measurement is layer 3's
 *   job.
 * - **`HTMLCanvasElement.prototype.getContext`**, which jsdom implements by
 *   reporting "not implemented" to its virtual console unless the `canvas`
 *   npm package is installed. `attachCanvas` already copes with a null
 *   context (`element?.getContext("2d") ?? null`), so returning null is what
 *   the adapter is written for. Canvas pixels are layer 3's job too.
 * - **`alert`**, because Deno has one and it blocks on stdin. The error
 *   handler `init()` registers ends in `alert` (src/client/index.ts), so any
 *   test that reaches a reporting path - deliberately or not - would stop the
 *   whole suite dead, mid-test, until someone at the terminal pressed enter.
 *   Recording the message instead is what a browser's alert amounts to here:
 *   the user was told, and nothing was waited for. `alerts` below is the
 *   recording, so the production handler stays under test rather than being
 *   swapped out for a test-only one.
 *
 * `localStorage` needs no stub at all: Deno implements the Web Storage API
 * natively, so `src/client/state/storage.ts` reads and writes a real one.
 * It's process-wide rather than per-window, so `mountRoute` clears it - which
 * is also what makes a mount reproducible, since the settings store and the
 * file memory both reconcile against it.
 *
 * `document.cookie` is the one piece jsdom does not join up for us. The five
 * cookie fields are how the *server* learns what this browser has stored, and
 * jsdom's document has no connection to the `Request` this harness builds - so
 * `mountRoute` reads `localStorage` and sends the cookie the browser would have
 * sent. Without that, a second page load would be server-rendered at the
 * defaults and corrected on hydration, which is precisely what these tests exist
 * to catch.
 */

// `setupDom` hands back the document; the window it belongs to is what the
// canvas stub below has to reach, and jsdom's is only typed as the DOM's own
// `Window`, without the constructors a real global carries.
const window = setupDom().defaultView as unknown as Window & typeof globalThis;

const resizeCallbacks: Array<() => void> = [];

// deno-lint-ignore no-explicit-any
(globalThis as any).ResizeObserver = class {
  #callback: () => void;
  constructor(callback: () => void) {
    this.#callback = callback;
  }
  observe(): void {
    resizeCallbacks.push(this.#callback);
    this.#callback();
  }
  unobserve(): void {}
  disconnect(): void {
    const index = resizeCallbacks.indexOf(this.#callback);
    if (index >= 0) resizeCallbacks.splice(index, 1);
  }
};

/**
 * Runs every live `ResizeObserver` callback, as a resize would. The elements
 * report jsdom's zero unless the test has given one a size of its own
 * (`Object.defineProperty(pre, "scrollWidth", ...)`), which is the only way
 * anything in this layer has a width at all.
 */
export const resize = (): void => {
  for (const callback of [...resizeCallbacks]) callback();
};

window.HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof window.HTMLCanvasElement.prototype.getContext;

/**
 * Every message the page has alerted since the last `mountRoute` - which is
 * every error reported through `showError`, once `init()` has registered the
 * handler that alerts them.
 *
 * Assert on this to check what a failing path told the user. A test that
 * wants the error object rather than its message, or its own collection, can
 * still register a handler of its own with `errors.setErrorHandler` after
 * mounting.
 */
export const alerts: string[] = [];

// deno-lint-ignore no-explicit-any
globalThis.alert = ((message?: any) => {
  alerts.push(String(message));
}) as typeof alert;

// Every import below is dynamic, and every one of them has to stay that way -
// see the note above. The client entry module imports every island itself, in
// its own order, so evaluating it (now that the DOM exists) registers exactly
// what a real page registers - no separate list to keep in sync.
const { default: route } = await import("@/pages/router.ts");
const client = await import("@/client/index.ts");
await flush();

/** every persisted setting (src/islands/settings.ts) */
export const settings = await import("@/islands/settings.ts");

/** the file memory and the compile pipeline (src/islands/turtle-system/program.ts) */
export const program = await import("@/islands/turtle-system/program.ts");

/** what the running machine reports (src/islands/turtle-system/machine.ts) */
export const machine = await import("@/islands/turtle-system/machine.ts");

/** the out-of-subtree command channels (src/islands/turtle-system/commands.ts) */
export const commands = await import("@/islands/turtle-system/commands.ts");

/** the two document-level jobs the client entry runs (src/client/passes.ts) */
export const passes = await import("@/client/passes.ts");

/**
 * The error-reporting seam (src/client/tools/error.ts). `init()` - which every
 * `mountRoute` runs - registers the production handler, and that handler ends
 * in `alert`. Tests read what it said off `alerts` (the stub above); a test
 * that wants its own collection can register one with `errors.setErrorHandler`
 * after mounting.
 */
export const errors = await import("@/client/tools/error.ts");

/** the localStorage load/save pair behind every persisted value (src/client/state/storage.ts) */
export const storage = await import("@/client/state/storage.ts");

/** the cookie's format, shared by the browser that writes it and the server that reads it */
export const cookie = await import("@/client/state/cookie.ts");

/** the property list, its defaults, and which five of them the cookie carries */
export const properties = await import("@/client/constants/properties.ts");

/**
 * The machine barrel itself (src/core/machine.ts), for the one path a test
 * can't reach through an island: `reset()` without a run, which draws through
 * whatever ports `init()` installed.
 */
export const coreMachine = await import("@/core/machine.ts");

// The file memory the client entry restores on init. Also restored by every
// `mountRoute` (which runs the real startup), but tests that never mount still
// need the one empty file everything editor-shaped assumes.
program.initialise();

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
 * The `<body>`'s own attributes are dropped (only its contents are needed, and
 * jsdom's body is already there) - `syncBodyState` in `init()` puts back the two
 * that matter, and layer 1 is where the server's own are asserted. Storage is
 * cleared so reconciliation starts from the defaults, and `logs` is emptied so a
 * test asserts on its own interactions rather than on the mount before it.
 *
 * The document's own URL is set to `path` as well, so `mountRoute("/?l=Pascal")`
 * is a page loaded at that address and not just a page whose markup was
 * rendered for it. The settings store reads `?l=` off `document.location` as it
 * initialises, and before this it would have seen the previous test's URL.
 *
 * **After the markup, the real client startup runs**: `init()` from
 * src/client/index.ts, the same function the bundle entry calls, in the same
 * place in the sequence - after the markup is in the document, as in a
 * browser, where a `defer`red bundle is the last thing the parser reaches.
 * There is no hand-kept mirror of the startup here to drift out of date.
 *
 * The mount itself must be clean: any Womble report produced while the page
 * hydrates and initialises (a bad attribute, an effect throwing on setup, an
 * action named after a DOM event) fails the mount right here, instead of
 * being silently discarded before the test's own assertions start. Only then
 * is `logs` emptied, so a test asserts on its own interactions rather than on
 * the mount before it.
 *
 * `keepStorage` is for the one thing clearing storage hides: a *second* page
 * load, which finds whatever the first one stored - and which is served, as a
 * browser would serve it, with the cookie that storage implies.
 */
export const mountRoute = async (
  path: string,
  { keepStorage = false }: { keepStorage?: boolean } = {},
): Promise<Document> => {
  if (!keepStorage) localStorage.clear();
  document.defaultView?.history.replaceState(null, "", path);
  // In a browser every page load is a fresh document served by a process whose
  // stores sit at their declared values, and every load adopts its own store
  // seeds. In here the "server" is this same process, so a previous test's
  // dispatches would leak into the SSR markup, and a store memoizes its seed
  // adoption per *document* - a test file has exactly one - so only the first
  // mount in a file could ever adopt. Both are the same fix: `resetStore` puts
  // each store back to its declared values and forgets the adoption, so the
  // render below is a fresh server's and the hydration after it is a fresh
  // page's. It must run before `route()`: the router renders through these
  // very store instances.
  resetStore(settings.settingsStore);
  resetStore(program.programStore);
  resetStore(machine.machineStore);
  const response = await route(
    new Request(`http://localhost${path}`, { headers: browserCookie() }),
  );
  const markup = await response.text();
  const body = markup.slice(
    markup.indexOf("<body"),
    markup.lastIndexOf("</body>"),
  );
  // The store seed script is genuine server output that lives in the `<head>`,
  // which this otherwise drops, so it's carried across - Womble finds it with
  // `document.querySelector`, so anywhere in the document will do. With the
  // stores reset above, each mount adopts it on first read, as a fresh page
  // would.
  document.body.innerHTML =
    seedScript(markup) + body.slice(body.indexOf(">") + 1);
  client.init();
  alerts.length = 0;
  await settle();
  assertNoLogs(logs);
  logs.length = 0;
  return document;
};

/**
 * The `cookie` header this browser would send, built from what `localStorage`
 * holds - the same five fields `writeCookie` mirrors, through the same
 * serialiser, so the header the server parses is the one a browser would send.
 * Empty storage sends nothing, which is a first-ever visit.
 */
const browserCookie = (): HeadersInit => {
  if (localStorage.length === 0) return {};
  const values = Object.fromEntries(
    properties.cookieFields.map((field) => [field, storage.load(field)]),
  ) as Parameters<typeof cookie.serialiseCookie>[0];
  return { cookie: `${cookie.COOKIE_NAME}=${cookie.serialiseCookie(values)}` };
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

// `resetStore` is what `mountRoute` uses to make each mount a fresh page's
// (see the comment inside it); a test reaches for it directly only to put a
// store back into its *pre-initialise* state - a page the client entry has
// not run on - without mounting anything.
export { flush, q, qa, resetStore, tick };
export type { LogEntry };
