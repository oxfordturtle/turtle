/// <reference lib="dom" />
import * as machine from "@/core/machine.ts";
import { initialiseSettings, settingsStore } from "@/islands/settings.ts";
import * as program from "@/islands/turtle-system/program.ts";
import {
  highlightCodeBlocks,
  languageVisibility,
  modeVisibility,
} from "./passes.ts";
import { setErrorHandler } from "./tools/error.ts";

// The machine's outbound ports. None touches the DOM as it loads:
// `<canvas-tab>` and `<output-tab>` hand them their elements from their own
// mount effects, which is what lets an island import them and call
// `machine.run()` itself.
import canvas from "./adapters/canvas.ts";
import files from "./adapters/files.ts";
import output from "./adapters/output.ts";
import timers from "./adapters/timers.ts";

// The site-wide islands. Registration order doesn't matter: a store is
// declarable as a source whenever a component happens to register.
import "@/islands/site-menu.ts";
import "@/islands/language-select.ts";
import "@/islands/setting-controls.ts";

// the system app's barrel, which registers the root before its subtree
import "@/islands/turtle-system/index.ts";

// the documentation-page islands. The cursor, font and keycode tables are fully
// static markup with nothing to hydrate, so they register nothing.
import "@/islands/doc-tabs.ts";
import "@/islands/reference/colour-table.ts";
import "@/islands/reference/command-table.ts";

/**
 * The whole client startup, in its one load-bearing order. `main.ts` (the
 * bundle entry) calls this once per page load; `test/ui/lib/setup.ts` calls it
 * per mount, so the startup the tests exercise IS this function rather than a
 * hand-kept mirror of it. The islands above register as this module loads,
 * before anything calls `init`.
 */
export const init = (): void => {
  // `run()` installs these again on every run, but "Reset machine" calls
  // `machine.reset()` directly, which draws to the canvas without a run first.
  machine.setPorts({ timers, output, canvas, files });

  // add the file/compile state to globals (for playing around in the console)
  const glob = globalThis as unknown as { program: typeof program };
  glob.program = program;

  // The registration is what keeps `alert` - which exists in Deno too, and
  // blocks on stdin - out of the island modules the server also imports.
  setErrorHandler((error) => {
    console.error(error);
    alert(error instanceof Error ? error.message : String(error));
  });

  // Both before the islands hydrate - they are queued on a microtask, after
  // this module's body - so the first render of every display already has the
  // right program and settings in it. The order matters: the file memory is
  // restored for the *stored* language, and initialising the settings is what
  // notices that `?l=` has changed it.
  program.initialise();
  initialiseSettings();

  // The three page-wide DOM passes (./passes.ts). Two of them follow the
  // settings for as long as the page lives: the store notifies, the sweep runs.
  highlightCodeBlocks();
  languageVisibility();
  modeVisibility();
  settingsStore.subscribe(() => {
    languageVisibility();
    modeVisibility();
  });

  // A link into the system can carry an example (?x=) to open, and a language
  // (?l=), which the settings store reads for itself above. Neither is state,
  // so both are taken straight off the URL.
  //
  // This runs on every page, so the example parameter is gated on the system
  // app being present: without it, `/documentation/reference?x=Triangle` would
  // quietly replace whatever file the user has open.
  if (document.querySelector("turtle-system")) {
    const parameters = new URLSearchParams(document.location.search);
    const example = parameters.get("x");
    if (example) program.openExampleFile(example);
  }
};
