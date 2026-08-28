/// <reference lib="dom" />
import { store } from "@merivale/womble";
import { type Language, languages } from "@/core/constants.ts";
import {
  defaults,
  type Property,
  type PropertyValues,
} from "@/client/constants/properties.ts";
import { isStored, load, save, writeCookie } from "@/client/state/storage.ts";
import { showError, SystemError } from "@/client/tools/error.ts";
import { requestCloseMenu } from "./turtle-system/commands.ts";
import { applyLanguage } from "./turtle-system/program.ts";

/**
 * Every *persisted setting* in the system, and the functions that change them.
 * See src/README.md for how the three stores divide the state between them.
 *
 * **No side effects at import time**: the server imports this module, because
 * every page's markup varies with the language and the mode. The store holds
 * the defaults until either the layout seeds it from the request's cookie or
 * `initialiseSettings` runs in the browser.
 *
 * Five of these settings are mirrored into a cookie, because the server has to
 * know them to render the page correctly the first time - see `cookieFields` in
 * src/client/constants/properties.ts for which five and why. The rest are
 * `localStorage` alone.
 */

// ----------------------------------------------------------- what a setting is

/**
 * `satisfies readonly Property[]` is what makes "a setting must have a default"
 * a compile error rather than an `undefined` turning up in a checkbox. Grouped
 * as the Delphi version's own settings dialogue groups them.
 */
export const settingNames = [
  // system settings
  "language",
  "mode",
  "fullscreen",
  "editorFontFamily",
  "editorFontSize",
  "outputFontFamily",
  "outputFontSize",
  "includeCommentsInExamples",
  "loadCorrespondingExample",
  "assembler",
  "decimal",
  "autoCompileOnLoad",
  "autoRunOnLoad",
  "autoFormatOnLoad",
  // machine runtime options
  "showCanvasOnRun",
  "showOutputOnWrite",
  "showMemoryOnDump",
  "drawCountMax",
  "codeCountMax",
  "smallSize",
  "stackSize",
  "traceOnRun",
  "activateHCLR",
  "preventStackCollision",
  "rangeCheckArrays",
  // compiler options
  "canvasStartSize",
  "setupDefaultKeyBuffer",
  "turtleAttributesAsGlobals",
  "initialiseLocals",
  "allowCSTR",
  "separateReturnStack",
  "separateMemoryControlStack",
  "separateSubroutineRegisterStack",
] as const satisfies readonly Property[];

export type SettingName = (typeof settingNames)[number];

export type Settings = Pick<PropertyValues, SettingName>;

/** The annotation rather than a cast is the point: a name in `settingNames` without a default is a type error here. */
export const defaultSettings: Settings = defaults;

/**
 * A control's `setting=` is an HTML attribute written by hand at ~40 call sites,
 * so it can't be a static type. Every one is server-rendered markup, so a typo
 * is something a test can rule out wholesale - test/ui/ssr/routes.test.ts checks
 * against this.
 */
export const isSettingName = (name: string): name is SettingName =>
  (settingNames as readonly string[]).includes(name);

// ------------------------------------------------------------------ the store

/**
 * The store starts at the defaults, and the layout seeds it per request with
 * everything this request can actually say: the five cookie fields, with a
 * link's `?l=` resolved over the top of them by `resolveLanguage` below. The
 * seed crosses into the browser in the page's markup, so the first paint needs
 * no correcting - which is the whole point of the cookie.
 *
 * Uncoalesced: a setting changes when a person changes one.
 */
export const settingsStore = store("settings", {
  state: { ...defaultSettings } as Settings,
  actions: {
    /** The whole record, re-read from the session and the URL. */
    hydrate: (): Partial<Settings> => readSettings(),

    /**
     * One setting, with its durable copy. Persisting inside the action is what
     * keeps the in-memory value and `localStorage` from diverging - and, for the
     * five in `cookieFields`, the cookie with them.
     *
     * **No settings action may ever be dispatched during a server render.** Deno
     * implements the Web Storage API natively, so a `save()` on the server
     * writes to a process-wide store - a cross-request leak that `withStores`
     * cannot help with, since it scopes the value rather than the side effect.
     */
    write: (
      _state,
      { name, value }: { name: SettingName; value: Settings[SettingName] },
    ) => {
      save(name, value);
      return { [name]: value } as Partial<Settings>;
    },

    /**
     * Every setting, in one commit and one notification. `language` is
     * included, but its *file-level* half is `resetDefaults`'s to run
     * afterwards.
     */
    reset: () => {
      const next: Partial<Settings> = {};
      for (const name of settingNames) {
        const value = defaultSettings[name];
        save(name, value);
        write(next, name, value);
      }
      return next;
    },

    /** Adopts a language the file memory has already stored - see `syncLanguage`. */
    adopt: (_state, language: string) => ({ language }),
  },
});

/** The settings as they are now. Read this from inside a component's `render`. */
export const getSettings = (): Settings =>
  Object.fromEntries(
    settingNames.map((name) => [name, settingsStore.get(name)]),
  ) as Settings;

/**
 * The stored settings over the defaults, with `resolveLanguage` deciding the
 * language. The client entry calls this once, before any island has rendered and
 * before the file memory is restored - the file memory now takes its starting
 * language from here rather than the other way round.
 *
 * **This and the seed agree by construction**, because they read the same rule
 * over the same inputs: the server reads the cookie, the browser reads the
 * `localStorage` the cookie mirrors. So a cached page served with a stale seed
 * still settles on the same answer, and nothing is corrected on screen.
 *
 * The `writeCookie` is for the browser that has settings but no cookie - one
 * that stored them before the cookie existed, or whose cookie has expired. It
 * gets a correct one here, and its *next* page load is server-rendered right.
 */
export const initialiseSettings = (): void => {
  settingsStore.dispatch("hydrate");
  writeCookie();
};

// ---------------------------------------------------------------- the setters

/**
 * Changes one setting.
 *
 * A generic function over a non-generic action: Womble infers an action's method
 * parameters from its signature, so a generic action would surface as `(name:
 * SettingName, value: Settings[SettingName])` and lose the correlation between
 * the two. The wrapper carries the generics; the action carries the commit.
 *
 * `language` is the only setting with a path of its own, being the only one with
 * a file-level half as well as a stored value.
 */
export const setSetting = <K extends SettingName>(
  name: K,
  value: Settings[K],
): void => {
  if (name === "language") {
    // the one setting worth a no-op check: re-adopting the current language
    // would mark the file uncompiled and re-tokenize it for nothing
    if (value === getSettings().language) return;
    setLanguage(value as string);
    return;
  }
  settingsStore.dispatch("write", { name, value });
};

/** Resets every setting to its default, and closes the menu that asked. */
export const resetDefaults = (): void => {
  settingsStore.dispatch("reset");
  // the file-level half, which the action itself can't do
  applyLanguage(defaultSettings.language as Language);
  // reset is reached through the system menu, so the menu closes behind it
  requestCloseMenu();
};

/**
 * Picks up a language change that originated in the file memory - opening a file
 * in another language adopts it - so the language <select> and the
 * language-visibility pass both follow.
 */
export const syncLanguage = (): void => {
  const language = load("language");
  if (language === getSettings().language) return;
  settingsStore.dispatch("adopt", language);
};

// ----------------------------------------------------------------- the helpers

/**
 * `"hidden"` unless the current mode is one of `modes`, a comma-separated list.
 * Every component derives its own mode visibility this way, and the server
 * renders the same answer because the mode is one of the cookie fields - so a
 * pane that should be hidden arrives hidden rather than being hidden afterwards.
 */
export const hiddenUnless = (mode: string, modes: string): string =>
  modes.split(",").includes(mode) ? "" : "hidden";

export const languageOf = (settings: Settings): Language =>
  settings.language as Language;

/**
 * The language a link asked for, if it named one this system has. An `?l=`
 * naming something else is no language at all, and the caller falls back.
 */
export const languageFromUrl = (search: URLSearchParams): Language | null => {
  const value = search.get("l");
  return value && languages.includes(value as Language)
    ? (value as Language)
    : null;
};

/**
 * A language this system has, or `null`. What comes out of the cookie or out of
 * `localStorage` is a bare string that no type vouches for, and an unknown one
 * breaks `highlight` downstream, so both sides narrow it through here.
 */
export const asLanguage = (value: string | undefined): Language | null =>
  value !== undefined && languages.includes(value as Language)
    ? (value as Language)
    : null;

/** What `resolveLanguage` needs to know. Both sides fill this in from what they have. */
export type LanguageContext = {
  /** the `?l=` this request carried, if it named a language this system has */
  url: Language | null;
  /** what this browser has already stored, or `null` if it has stored nothing */
  stored: Language | null;
  /** whether this page is the system app, rather than documentation */
  system: boolean;
  /** whether the URL also names an example to open (`?x=`) */
  example: boolean;
};

/**
 * Which language a page is in. **The one home for this rule**, read by the
 * layout to seed a request and by `readSettings` to hydrate the browser - if the
 * two disagreed, a link would serve one page and then correct to another, which
 * is precisely what the cookie exists to prevent.
 *
 * The rule differs by page, because the word means two different things:
 *
 * - **On a documentation page** it is a *view parameter* - which of the six
 *   guides am I reading - so `?l=` wins outright. That is what makes "the Python
 *   guide to loops" a thing a worksheet can link to.
 * - **On the system page** it is a property of the open *file*, and the stored
 *   value tracks it (opening a file adopts its language - see
 *   `adoptFileLanguage` in ./turtle-system/program.ts). So the stored value wins,
 *   and `?l=` speaks only for a file that is about to be opened: one named by
 *   `?x=`, or the very first file of a browser that has stored nothing yet.
 *
 * That last clause is what stops `/?l=BASIC` silently re-languaging a program
 * someone is in the middle of writing.
 */
export const resolveLanguage = ({
  url,
  stored,
  system,
  example,
}: LanguageContext): Language =>
  (!system || example ? (url ?? stored) : (stored ?? url)) ??
  (defaultSettings.language as Language);

// --------------------------------------------------------------- the internals

const setLanguage = (language: string): void => {
  // a language can arrive from ?l= or from sessionStorage, neither of which a
  // type covers, and an unknown one breaks `highlight` downstream
  if (!languages.includes(language as Language)) {
    showError(new SystemError(`Unknown language "${language}".`));
    return;
  }
  settingsStore.dispatch("write", { name: "language", value: language });
  // the file-level half. No re-entrancy guard needed: the file memory only asks
  // this module to adopt a language when the *file* changes.
  applyLanguage(language as Language);
};

/**
 * Whatever `localStorage` holds, over the defaults, with `resolveLanguage`
 * deciding the language. On the server there is neither, so this is the
 * defaults - but the server never reaches it, because the layout seeds the store
 * rather than hydrating it.
 *
 * **Nothing here writes.** A link's `?l=` is a view override, not a preference:
 * following "the BASIC guide" should not repoint the system you go back to
 * afterwards. The stored language changes when a person changes it, or when
 * opening a file brings its own.
 */
const readSettings = (): Settings => {
  const settings = { ...defaultSettings };
  // `document` rather than a bare `location` or `localStorage` global: the DOM
  // shim test/ui/dom/ runs under installs `document` but no window globals
  // deno-coverage-ignore-start -- the early return is unreachable from the
  // tests and from a browser: Womble only calls `hydrate` when a store adopts
  // its seed on the client, where there is always a document. It is what keeps
  // this function safe to reach from the server-side render path, which
  // imports this module too.
  if (typeof document === "undefined") return settings;
  // deno-coverage-ignore-stop
  for (const name of settingNames) {
    write(settings, name, load(name));
  }
  const search = new URLSearchParams(document.location.search);
  settings.language = resolveLanguage({
    url: languageFromUrl(search),
    // "has stored nothing" is not the same as "stored the default", and only the
    // first of the two lets a link's `?l=` speak for the file about to be made
    stored: isStored("language") ? (load("language") as Language) : null,
    system: document.querySelector("turtle-system") !== null,
    example: search.get("x") !== null,
  });
  return settings;
};

// A write whose key is a variable: `settings[name] = value` type-checks only
// where the name is a type parameter rather than the `SettingName` union.
const write = <K extends SettingName>(
  settings: Partial<Settings>,
  name: K,
  value: Settings[K],
): void => {
  settings[name] = value;
};
