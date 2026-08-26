import { defaultCompilerOptions } from "@/core/compiler.ts";
import { defaultMachineOptions } from "@/core/machine.ts";

export type Property = (typeof properties)[number];

/**
 * `defaults` is `as const`, so its literal types describe a *default* rather
 * than a *value*: `language` would be `"Python"` rather than `string`. Arrays
 * widen to `readonly unknown[]`: `unknown` because a value that has been
 * through a JSON round trip has lost its element type - which is why the file
 * memory has a `restoreFile` at all - and `readonly` because the default an
 * unset property falls back to is this module's own array, not a copy.
 */
type Widen<T> = T extends boolean
  ? boolean
  : T extends number
    ? number
    : T extends string
      ? string
      : T extends readonly unknown[]
        ? readonly unknown[]
        : T;

/** The type stored under each property - what `load` returns and `save` takes. */
export type PropertyValues = { [P in Property]: Widen<(typeof defaults)[P]> };

export const properties = [
  // whether user's saved settings have been loaded in this session
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
  // help page properties
  "commandsCategoryIndex",
  "showSimpleCommands",
  "showIntermediateCommands",
  "showAdvancedCommands",
  // file memory
  "files",
  "currentFileIndex",
  "filename",
  "lexemes",
  "usage",
  "routines",
  "pcode",
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
] as const;

export const defaults = {
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
  filename: "",
  lexemes: [],
  usage: [],
  routines: [],
  pcode: [],
  // machine runtime options
  ...defaultMachineOptions,
  // compiler options
  ...defaultCompilerOptions,
} as const;
