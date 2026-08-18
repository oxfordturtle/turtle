import { defaultCompilerOptions } from "@/core/compiler.ts";
import { defaultMachineOptions } from "@/core/machine.ts";

export type Property = (typeof properties)[number];

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
