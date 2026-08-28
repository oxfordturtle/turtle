import {
  html,
  type HtmlResult,
  type LogEntry,
  setLogger,
  withStores,
} from "@merivale/womble";
import router from "@/pages/router.ts";
import { type Settings, settingsStore } from "@/islands/settings.ts";
import type { CookieValues } from "@/client/constants/properties.ts";
import { COOKIE_NAME, serialiseCookie } from "@/client/state/cookie.ts";
import { defaults } from "@/client/constants/properties.ts";

/**
 * Layer 1's whole harness: render markup exactly as the server would, with
 * Womble's log sink captured, and nothing else.
 *
 * There is no DOM here and there must not be one - that's what makes this
 * layer cost milliseconds and what makes it able to say something about the
 * page a browser is *sent*, rather than the page it ends up with. `setLogger`
 * comes from `@merivale/womble` rather than `@merivale/womble/testing` for the same reason:
 * the testing entry point pulls in jsdom, and none of it is wanted here.
 *
 * **Every render goes through the real router**, which is a plain
 * `(Request) => Promise<Response>` with no server around it, so a route test
 * is one function call - `?l=` included, since the layout seeds the settings
 * store from it per request, and now the five cookie fields too, since
 * `renderRoute` can send a cookie.
 *
 * `renderIslands` is what is left for a component rendered outside any route.
 */

/** What a route sent, plus anything Womble reported while it was rendering. */
export type Rendered = {
  status: number;
  markup: string;
  logs: LogEntry[];
};

/**
 * Renders one route, capturing everything Womble reports on the way.
 *
 * `cookie` is what this browser has stored, as a partial - the five fields in
 * `cookieFields` are the whole of what a request tells the server about who is
 * asking. Anything left out takes its default, which is what a first-ever
 * visitor sends. This is how layer 1 asks the question the whole cookie exists
 * for: is the markup we *send* already right, or does it need correcting?
 */
export const renderRoute = async (
  path: string,
  { cookie }: { cookie?: Partial<CookieValues> } = {},
): Promise<Rendered> => {
  const logs: LogEntry[] = [];
  const restore = setLogger((entry) => logs.push(entry));
  try {
    const response = await router(
      new Request(`http://localhost${path}`, { headers: cookieHeader(cookie) }),
    );
    return { status: response.status, markup: await response.text(), logs };
  } finally {
    restore();
  }
};

/** The five fields as a `cookie` header, with anything unnamed at its default. */
const cookieHeader = (values?: Partial<CookieValues>): HeadersInit =>
  values === undefined
    ? {}
    : {
        cookie: `${COOKIE_NAME}=${serialiseCookie({ ...defaults, ...values })}`,
      };

/**
 * Renders `content` with the settings store seeded to `language` and `mode` -
 * the server-side half of "changing the language changes the page". A component
 * reads the store's getters inside its own `render`, on the server exactly as
 * in the browser, so the result is what a page whose user had those settings
 * would have been sent.
 *
 * Both now reach the *real* server as well - `language` off a link's `?l=` or
 * the cookie, `mode` off the cookie - so `renderRoute(path, { cookie })` is the
 * more faithful way to ask either question. This is what is left for a component
 * rendered on its own, outside any route.
 *
 * **`withStores` is the same scope the layout opens** (src/pages/_layout/page.ts),
 * not a stand-in for one: it unwinds in a `finally` of its own, so one render
 * cannot leak into the next even if this one throws.
 */
export const renderIslands = (
  settings: Partial<Settings>,
  content: HtmlResult,
): Rendered => {
  const logs: LogEntry[] = [];
  const restore = setLogger((entry) => logs.push(entry));
  try {
    return {
      status: 200,
      markup: withStores(
        [
          settingsStore.seed({
            language: "Python",
            mode: "normal",
            ...settings,
          }),
        ],
        () => String(html`${content}`),
      ),
      logs,
    };
  } finally {
    restore();
  }
};

/**
 * The marker Womble leaves in place of an island whose props failed to parse
 * or validate: `<!-- <tag-name> failed to render: invalid props, see server
 * console -->`. Its presence anywhere in a page is a component that isn't
 * there at all, and it is otherwise entirely invisible - the page renders,
 * responds 200, and is missing a chunk of itself.
 */
export const FAILED_TO_RENDER = "failed to render";

/**
 * Every hyphenated tag name in `markup`, which for this codebase means every
 * island tag (no HTML element has a hyphen in its name). Closing tags are
 * skipped by construction: `</foo-bar>` starts with a `/`, which the leading
 * `[a-z]` can't match.
 */
export const customTags = (markup: string): Set<string> =>
  new Set(
    Array.from(markup.matchAll(/<([a-z][a-z0-9]*-[a-z0-9-]*)[\s/>]/g)).map(
      (match) => match[1]!,
    ),
  );

/**
 * Every tag name `src/islands/**` calls `define()` with, read off the source
 * rather than out of Womble's registry - the registry isn't part of `mod.ts`'s
 * public API, and reading the source is also what makes the check meaningful:
 * it is the set of names that will still be defined *on the client*, which is
 * the thing a stray tag in a route is missing.
 */
export const islandNames = async (): Promise<Set<string>> => {
  const names = new Set<string>();
  for await (const path of sourceFiles("src/islands")) {
    const source = await Deno.readTextFile(path);
    for (const match of source.matchAll(/define\("([a-z][a-z0-9-]*)"/g)) {
      names.add(match[1]!);
    }
  }
  return names;
};

/**
 * Every `setting="..."` value written anywhere in `src/`, read off the source
 * for the same reason `islandNames` is: it is the set of names a page *could*
 * carry, which is what makes "the routes rendered all of them" a claim worth
 * asserting rather than a coincidence. Compare with what a route actually
 * sent - see routes.test.ts's settings sweep.
 */
export const settingAttributes = async (): Promise<Set<string>> => {
  const names = new Set<string>();
  for await (const path of sourceFiles("src")) {
    const source = await Deno.readTextFile(path);
    for (const match of source.matchAll(/setting="([^"$]*)"/g)) {
      names.add(match[1]!);
    }
  }
  return names;
};

/** Every `setting="..."` value in a page of markup. */
export const settingsNamed = (markup: string): Set<string> =>
  new Set(
    Array.from(markup.matchAll(/setting="([^"]*)"/g), (match) => match[1]!),
  );

async function* sourceFiles(directory: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(directory)) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory) yield* sourceFiles(path);
    else if (entry.name.endsWith(".ts")) yield path;
  }
}

/** The routes with a page of their own, as a table for the sweeps in routes.test.ts. */
export const ROUTES = [
  { path: "/", name: "the system" },
  {
    path: "/?l=Pascal&x=hello&f=program.tpas",
    name: "the system, with parameters",
  },
  { path: "/documentation/help", name: "the help page" },
  { path: "/documentation/reference", name: "the reference page" },
  {
    path: "/documentation/reference?tab=colours",
    name: "the reference page, colours",
  },
  {
    path: "/documentation/reference?tab=fonts",
    name: "the reference page, fonts",
  },
  {
    path: "/documentation/reference?tab=cursors",
    name: "the reference page, cursors",
  },
  {
    path: "/documentation/reference?tab=keycodes",
    name: "the reference page, keycodes",
  },
  { path: "/about", name: "the about page" },
  { path: "/contact", name: "the contact page" },
  { path: "/no/such/page", name: "the 404 page" },
] as const;
