import {
  type EncoderOptions,
  defaultCompilerOptions,
} from "@/core/compiler.ts";
import { type MachineOptions, defaultMachineOptions } from "@/core/machine.ts";

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
 * of the session (or off a `?l=`) is not something a type can vouch for, so the
 * modules that need the narrower type validate it - see `setLanguage` in
 * src/islands/settings.ts.
 */
export type PropertyValues = {
  // whether user's saved settings have been loaded in this session
  savedSettingsHaveBeenLoaded: boolean;
  // system settings
  language: string;
  mode: string;
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
  alwaysSaveSettings: boolean;
  // help page properties
  commandsCategoryIndex: number;
  showSimpleCommands: boolean;
  showIntermediateCommands: boolean;
  showAdvancedCommands: boolean;
  // file memory
  files: readonly unknown[];
  currentFileIndex: number;
} & Writable<MachineOptions> &
  EncoderOptions;

export type Property = keyof PropertyValues;

export const defaults: PropertyValues = {
  // whether user's saved settings have been loaded in this session
  savedSettingsHaveBeenLoaded: false,
  // system settings
  language: "Python",
  mode: "normal",
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
  alwaysSaveSettings: false,
  // help page properties
  commandsCategoryIndex: 0,
  showSimpleCommands: true,
  showIntermediateCommands: false,
  showAdvancedCommands: false,
  // file memory
  files: [],
  currentFileIndex: 0,
  // machine runtime options
  ...defaultMachineOptions,
  // compiler options
  ...defaultCompilerOptions,
};
