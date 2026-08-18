/// <reference lib="dom" />
import * as machine from "@/core/machine.ts";
import { initialiseSettings, settingsStore } from "@/islands/settings.ts";
import * as program from "@/islands/turtle-system/program.ts";
import {
  highlightCodeBlocks,
  languageVisibility,
  modeVisibility,
} from "./passes.ts";
import { load } from "./state/storage.ts";
import { setErrorHandler, showError, SystemError } from "./tools/error.ts";

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

// `run()` installs these again on every run, but "Reset machine" calls
// `machine.reset()` directly, which draws to the canvas without a run first.
machine.setPorts({ timers, output, canvas, files });

// add the file/compile state to globals (for playing around in the console)
const glob = globalThis as unknown as { program: typeof program };
glob.program = program;

// The registration is what keeps `alert` - which exists in Deno too, and blocks
// on stdin - out of the island modules the server also imports.
setErrorHandler((error) => {
  console.error(error);
  alert(error instanceof Error ? error.message : String(error));
});

// Both before the islands hydrate - they are queued on a microtask, after this
// module's body - so the first render of every display already has the right
// program and settings in it. The order matters: the file memory is restored for
// the *stored* language, and initialising the settings is what notices that
// `?l=` has changed it.
program.initialise();
initialiseSettings();

// The three page-wide DOM passes (./passes.ts). Two of them follow the settings
// for as long as the page lives: the store notifies, the sweep runs.
highlightCodeBlocks();
languageVisibility();
modeVisibility();
settingsStore.subscribe(() => {
  languageVisibility();
  modeVisibility();
});

// A link into the system can carry an example (?x=) or a remote file (?f=) to
// open, and a language (?l=), which the settings store reads for itself above.
// None of the three is state, so all are taken straight off the URL.
//
// This module loads on every page, so the two file parameters are gated on the
// system app being present: without it, `/documentation/reference?x=Triangle`
// would quietly replace whatever file the user has open.
if (document.querySelector("turtle-system")) {
  const parameters = new URLSearchParams(document.location.search);
  const example = parameters.get("x");
  const file = parameters.get("f");
  if (example) program.openExampleFile(example);
  if (file) program.openRemoteFile(file);
}

addEventListener("beforeunload", function () {
  if (load("alwaysSaveSettings")) {
    showError(new SystemError("Not yet implemented."));
  }
});
