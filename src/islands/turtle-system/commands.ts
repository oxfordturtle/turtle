/// <reference lib="dom" />
/**
 * How code outside a component's own subtree asks that component to do
 * something: a query and a method call, after which the commit, the re-render
 * and any effect follow exactly as they would from a DOM event inside it. A
 * method call is script-initiated, so it doesn't announce - HTML's own rule that
 * setting `.value` never fires `input`.
 *
 * Its own module so its callers can reach these components without importing
 * them, which would create import cycles and register the whole system app on
 * every page of the site.
 */

/**
 * A target as it may actually be found. The element type comes from
 * `HTMLElementTagNameMap`, where each defining module publishes its own, so what
 * a `querySelector` here can call is exactly what that component declared.
 *
 * `Partial` makes every method optional, and the optional calls below are not
 * defensiveness: a custom element has no methods until its tag is registered,
 * and the client entry runs the page-wide passes before that has happened. A
 * command sent then is correctly a no-op - a component that hasn't upgraded is
 * about to render from its server-rendered attributes, with nothing to correct.
 */
type Target<Tag extends keyof HTMLElementTagNameMap> = Partial<
  HTMLElementTagNameMap[Tag]
> | null;

const system = (): Target<"turtle-system"> =>
  document.querySelector("turtle-system");

const editor = (): Target<"system-editor"> =>
  document.querySelector("system-editor");

/** Shows a particular tab. The machine asks for this on RUN, on output, and on a memory dump. */
export const requestTab = (tab: string): void => {
  system()?.selectTab?.({ tab });
};

/** Closes the system menu, for the settings store's `resetDefaults`. */
export const requestCloseMenu = (): void => {
  system()?.closeMenu?.();
};

/** Selects the whole program in the editor, for the Edit menu's "Select All". */
export const requestSelectAll = (): void => {
  editor()?.selectAllCode?.();
};
