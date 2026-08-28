/// <reference lib="dom" />
import * as machine from "@/core/machine.ts";
import { initialiseSettings, settingsStore } from "@/islands/settings.ts";
import * as program from "@/islands/turtle-system/program.ts";
import { highlightCodeBlocks, syncBodyState } from "./passes.ts";
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
  // right program and settings in it.
  //
  // **Settings first, then the file memory**, which is the other way round from
  // how this used to run. The settings no longer need to be told what the files
  // restored; the files need to know the language, because a browser with
  // nothing stored is about to make its first file and a link's `?l=` is
  // allowed to speak for that one (see `resolveLanguage`).
  initialiseSettings();
  program.initialise();

  // The two document-level jobs (./passes.ts). `syncBodyState` follows the
  // settings for as long as the page lives; its call here writes back exactly
  // what the server already rendered, so nothing on screen moves.
  highlightCodeBlocks();
  syncBodyState();
  settingsStore.subscribe(syncBodyState);
};
