import {
  defaultCompilerOptions,
  type EncoderOptions,
} from "@/core/compiler.ts";
import { defaultMachineOptions, type MachineOptions } from "@/core/machine.ts";

/** `MachineOptions` is `Readonly<>` at source; the settings store writes to its own copy. */
type Writable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * The type stored under each property - what `load` returns and `save` takes.
 *
 * `files` is `readonly unknown[]`: `unknown` because a value that has been
 * through a JSON round trip has lost its element type - which is why the file
 * memory has a `restoreFile` at all - and `readonly` because the default an
 * unset property falls back to is this module's own array, not a copy.
 *
 * `language` and `mode` are `string` for the same reason: what comes back out
 * of storage (or off a `?l=`, or out of the cookie) is not something a type can
 * vouch for, so the modules that need the narrower type validate it - see
 * `setLanguage` in src/islands/settings.ts.
 *
 * The command table's category and level filters used to live here. They are
 * ephemeral view state now: the table resets to its defaults on every visit,
 * which is also why it no longer needs a mount effect to correct the server's
 * render of it.
 */
export type PropertyValues = {
  // system settings
  language: string;
  mode: string;
  fullscreen: boolean;
  editorFontFamily: string;
  editorFontSize: number;
  outputFontFamily: string;
  outputFontSize: number;
  includeCommentsInExamples: boolean;
  loadCorrespondingExample: boolean;
  assembler: boolean;
  decimal: boolean;
  autoCompileOnLoad: boolean;
  autoRunOnLoad: boolean;
  autoFormatOnLoad: boolean;
  // file memory
  files: readonly unknown[];
  currentFileIndex: number;
} & Writable<MachineOptions> &
  EncoderOptions;

export type Property = keyof PropertyValues;

export const defaults: PropertyValues = {
  // system settings
  language: "Python",
  mode: "normal",
  fullscreen: false,
  editorFontFamily: "Courier",
  editorFontSize: 13,
  outputFontFamily: "Courier",
  outputFontSize: 13,
  includeCommentsInExamples: true,
  loadCorrespondingExample: true,
  assembler: true,
  decimal: true,
  autoCompileOnLoad: false,
  autoRunOnLoad: false,
  autoFormatOnLoad: false,
  // file memory
  files: [],
  currentFileIndex: 0,
  // machine runtime options
  ...defaultMachineOptions,
  // compiler options
  ...defaultCompilerOptions,
};

/**
 * The persisted properties the **server** has to know, because the markup it
 * sends differs by them. These are mirrored into a cookie so the first render is
 * already right; everything else persisted lives in `localStorage` alone.
 *
 * The rule that decides membership is "persisted, and changes the markup the
 * server sends":
 *
 * | Property            | What it changes in the first render                     |
 * | ------------------- | ------------------------------------------------------- |
 * | `language`          | the language `<select>`, the editor's highlighting, which prose the documentation pages show, the command table's rows, the filename bar's labels |
 * | `mode`              | six of the nine tab panes, the tab `<select>`'s options, nineteen `setting-*` controls |
 * | `fullscreen`        | `<body class="index fullscreen">`                       |
 * | `editorFontFamily`  | the editor's `style` attribute                          |
 * | `editorFontSize`    | the same attribute, and the line height derived from it |
 *
 * **The machine and compiler options are deliberately not here**, though they
 * are persisted and do change the server's markup. Every one of them renders
 * into a submenu that starts closed or the Run Settings tab, which starts
 * inactive - so hydration corrects them where nobody can see it, and a
 * thirty-seven field cookie would buy nothing. `test/ui/ssr/cookie.test.ts`
 * holds that distinction to account: it flips every persisted setting in turn
 * and fails if one changes the first render without being either in this list or
 * in its own list of off-screen exceptions.
 *
 * `outputFontFamily` and `outputFontSize` are not here either, for a different
 * reason: nothing on a fresh page has written any output yet, so there is
 * nothing for them to be wrong about.
 */
export const cookieFields = [
  "language",
  "mode",
  "fullscreen",
  "editorFontFamily",
  "editorFontSize",
] as const satisfies readonly Property[];

export type CookieField = (typeof cookieFields)[number];

export type CookieValues = Pick<PropertyValues, CookieField>;
