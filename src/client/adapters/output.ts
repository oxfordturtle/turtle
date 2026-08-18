/// <reference lib="dom" />

import type {
  MemoryDump,
  Output,
  StateChange,
  TurtleProperty,
} from "@/core/machine.ts";
import { requestTab } from "@/islands/turtle-system/commands.ts";
import {
  setMemory,
  setStatus,
  setTurtleProperty,
} from "@/islands/turtle-system/machine.ts";
import { showError } from "../tools/error.ts";

/**
 * The machine's output port, which is two jobs.
 *
 * **The text streams stay here and stay imperative.** The console and the Output
 * tab are appended to character by character by a running program, so they are
 * plain `innerHTML` writes on elements the two pane components hand over from
 * their mount effects, exactly as the canvas adapter works.
 *
 * **Everything else is state**, and goes to the machine store
 * (src/islands/turtle-system/machine.ts) for the components that display it.
 */

let console: HTMLPreElement | null = null;
let output: HTMLPreElement | null = null;

/** Installs the console element. Called by `<canvas-tab>`'s mount effect. */
export const attachConsole = (element: HTMLPreElement | null): void => {
  console = element;
};

/** Installs the Output tab's element. Called by `<output-tab>`'s mount effect. */
export const attachOutput = (element: HTMLPreElement | null): void => {
  output = element;
};

const updateTurtleProperty = <Property extends TurtleProperty>(
  property: Property,
  value: Property extends "c" ? string : number,
): void => {
  setTurtleProperty(property, value);
};

const updateMemoryDisplay = (memoryDump: MemoryDump): void => {
  setMemory(memoryDump);
};

const configureConsole = (clear: boolean, colour: string): void => {
  if (!console) return;
  if (clear) console.innerHTML = "";
  console.style.background = colour;
};

const logToConsole = (text: string): void => {
  if (!console) return;
  console.innerHTML += text;
  console.scrollTop = console.scrollHeight;
};

const backspaceConsole = (): void => {
  if (!console) return;
  console.innerHTML = console.innerHTML.slice(0, -1);
  console.scrollTop = console.scrollHeight;
};

const configureOutput = (clear: boolean, colour: string): void => {
  if (!output) return;
  if (clear) output.innerHTML = "";
  output.style.background = colour;
};

const writeToOutput = (text: string): void => {
  if (!output) return;
  output.innerHTML += text;
};

// `<turtle-system>` owns which tab is showing, and this adapter is outside its
// subtree, so it asks the way anything outside does - see
// src/islands/turtle-system/commands.ts.
const selectTab = (tab: string): void => {
  requestTab(tab);
};

const notifyStateChange = (change: StateChange): void => {
  setStatus(change);
};

const notifyRuntimeError = (error: Error): void => {
  showError(error);
};

export default {
  updateTurtleProperty,
  updateMemoryDisplay,
  configureConsole,
  logToConsole,
  backspaceConsole,
  configureOutput,
  writeToOutput,
  selectTab,
  notifyStateChange,
  notifyRuntimeError,
} satisfies Output;
