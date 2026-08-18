/// <reference lib="dom" />
import { store } from "@merivale/womble";
import { type Language, languages } from "@/core/constants.ts";
import { defaults, type Property } from "@/client/constants/properties.ts";
import { load, save } from "@/client/state/storage.ts";
import { showError, SystemError } from "@/client/tools/error.ts";
import { requestCloseMenu } from "./turtle-system/commands.ts";
import { applyLanguage } from "./turtle-system/program.ts";

/**
 * Every *persisted setting* in the system, and the functions that change them.
 * See src/README.md for how the three stores divide the state between them.
 *
 * **No side effects at import time**: the server imports this module, because
 * every page's markup varies with the language and the mode, and
 * `sessionStorage` is a browser fact. The store holds the defaults until
 * `initialiseSettings` runs in the browser.
 */

// ----------------------------------------------------------- what a setting is

/**
 * `satisfies readonly Property[]` is what makes "a setting must have a default"
 * a compile error rather than an `undefined` turning up in a checkbox. Grouped
 * as the Delphi version's own settings dialogue groups them.
 */
export const settingNames = [
  // whether the user's saved settings have been loaded in this session
  "savedSettingsHaveBeenLoaded",
  // system settings
  "language",
  "mode",
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
  "alwaysSaveSettings",
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

// `defaults` is `as const`, so its literal types describe a *default* rather
// than a *setting*: `language` would be `"Python"` rather than `string`.
type Widen<T> = T extends boolean
  ? boolean
  : T extends number
    ? number
    : T extends string
      ? string
      : T;

export type Settings = { [K in SettingName]: Widen<(typeof defaults)[K]> };

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
 * The store starts at the defaults, which is what the server should render for
 * anything it cannot see. What it *can* see — a link's `?l=` — the layout seeds
 * per request, and the seed crosses into the browser in the page's markup, so
 * the first paint needs no correcting.
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
     * keeps the in-memory value and `sessionStorage` from diverging.
     *
     * **No settings action may ever be dispatched during a server render.** Deno
     * implements `sessionStorage` natively, so a `save()` on the server writes
     * to a process-wide store - a cross-request leak that `withStores` cannot
     * help with, since it scopes the value rather than the side effect.
     */
    write: (
      _state,
      { name, value }: { name: SettingName; value: Settings[SettingName] },
    ) => {
      save(name as Property, value);
      return { [name]: value } as Partial<Settings>;
    },

    /**
     * Every setting but `savedSettingsHaveBeenLoaded`, in one commit and one
     * notification. `language` is included, but its *file-level* half is
     * `resetDefaults`'s to run afterwards.
     */
    reset: () => {
      const next: Partial<Settings> = {};
      for (const name of settingNames) {
        if (name === "savedSettingsHaveBeenLoaded") continue;
        const value = defaultSettings[name];
        save(name as Property, value);
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
 * The session's copy over the defaults, then the `?l=` URL parameter over that.
 * The client entry calls this once, after the file memory has been restored and
 * before any island has rendered.
 *
 * **This, not the seed, is what decides the browser's settings.** The server's
 * seed reaches the store first and is overwritten here by a full re-read of the
 * same inputs, plus the session the server couldn't see - so the two agree by
 * construction, and a cached page with no seed behaves like one with it.
 */
export const initialiseSettings = (): void => {
  // read before `hydrate` writes a `?l=` language over it: the file memory was
  // restored from this value, so a difference is exactly when it must be told
  const restored = load("language") as string;
  settingsStore.dispatch("hydrate");
  const { language } = getSettings();
  if (language !== restored) applyLanguage(language as Language);
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

// Both stubs: the account persistence they need doesn't exist.
export const saveSettings = (): void => {
  showError(new SystemError("Not yet implemented."));
};

export const loadSavedSettings = (): void => {
  showError(new SystemError("Not yet implemented."));
};

/**
 * Picks up a language change that originated in the file memory - opening a file
 * in another language adopts it - so the language <select> and the
 * language-visibility pass both follow.
 */
export const syncLanguage = (): void => {
  const language = load("language") as string;
  if (language === getSettings().language) return;
  settingsStore.dispatch("adopt", language);
};

// ----------------------------------------------------------------- the helpers

/**
 * `"hidden"` unless the current mode is one of `modes`, a comma-separated list.
 * A component derives its own mode visibility this way rather than leaving it to
 * the page-wide `modeVisibility` pass (src/client/passes.ts), which runs before
 * the islands hydrate and would be wiped by a component's first render.
 */
export const hiddenUnless = (mode: string, modes: string): string =>
  modes.split(",").includes(mode) ? "" : "hidden";

export const languageOf = (settings: Settings): Language =>
  settings.language as Language;

/**
 * The language a link asked for, if it named one this system has. Two sides read
 * this rule - the layout seeds the store with it per request, and `readSettings`
 * re-derives it in the browser - so if they disagreed, `/?l=BASIC` would serve
 * one page and correct to another.
 */
export const languageFromUrl = (search: URLSearchParams): Language | null => {
  const value = search.get("l");
  return value && languages.includes(value as Language)
    ? (value as Language)
    : null;
};

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
 * Whatever the session holds, over the defaults, with the `?l=` URL parameter
 * over that. On the server there is neither, so this is the defaults.
 */
const readSettings = (): Settings => {
  const settings = { ...defaultSettings };
  // `document` rather than a bare `location` or `sessionStorage` global: the DOM
  // shim test/ui/dom/ runs under installs `document` but no window globals
  if (typeof document === "undefined") return settings;
  for (const name of settingNames) {
    write(settings, name, load(name as Property));
  }
  // both are persisted but force-reset on every page load: the "save settings"
  // feature needs a login that doesn't exist yet
  settings.savedSettingsHaveBeenLoaded = false;
  settings.alwaysSaveSettings = false;
  save("savedSettingsHaveBeenLoaded", false);
  save("alwaysSaveSettings", false);
  // ?l=<language> beats the stored value, and is read straight off the URL
  // rather than out of an attribute: it isn't state
  const urlLanguage = languageFromUrl(
    new URLSearchParams(document.location.search),
  );
  if (urlLanguage) {
    settings.language = urlLanguage;
    save("language", urlLanguage);
  }
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
